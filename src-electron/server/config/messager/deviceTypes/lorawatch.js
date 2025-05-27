// 处理消息:lora手表与呼叫器一致属于无网络设备,需要通过网关进行转发消息
const { MESSAGE_TYPE, EVENT_CODE, TRANSACTION_RESULT } = require('@voerka/messager')
const { uniq } = require('lodash')
const { Op } = require('sequelize')
const { useKVCache } = requireApi('utils/index')
const { encodeMessage, decodeMessage } = require('../../../../utils.js')
const { whereEq } = require('ramda')
const i18n = require('../../i18n')

i18n.init

// 设备类型
const TYPE = 'lora_watch'

module.exports = ({ dbUtils, messager }) => {
	// 设备端包序号只能是0~255
	let id = 0
	let gaptime = {}
	// tid - { msgId, devices: ['xxxx', 'xxx'] }
	const tidCache = useKVCache({ life: 60 * 30 * 1000 })

	// 添加消息给lorawatch（lorawatch执行添加消息动作）
	async function addMessage({ path, message, domain, msgId, devices = [] } = {}) {
		// 执行动作
		$log.info('【lorawatch】 addMessage+++++++++++++', path, message, domain, msgId, devices)
		// devices.forEach(async device => {
		const lan = await $db.Setting.findByPk('current_language')
		for (let i = 0; i < devices.length; i++) {
			let device = devices[i]
			$log.info('setTimeout addMessage------', device.sn)
			const { sn, nodePath, nodeId, parent } = device
			let timestamp = gaptime[sn] ? new Date().getTime() - gaptime[sn] : 0
			const prefix = [nodePath, nodeId].join('/')
			const trim = prefix.split('/').filter(item => !!item).length
			if (message == 'timeout') {
				// 国际化
				i18n.setLocale(lan.value.lan)
				message = i18n.__(message)
			}
			// 显示的消息：1. 不包含当前条屏的位置，只显示子位置；2. 如果子位置还是超出3格，只保留3格
			let messages = `${prunePath(path, { trim, keep: 3 })} ${message}`
			const sid = messager._sid
			if (gaptime[sn] && timestamp < 4 * 1000) {
				await messager._takeARest(4 * 1000)
			}
			// 保证第一条马上发
			gaptime[sn] = new Date().getTime()
			// 配置消息体
			messager.postAction(
				{
					to: sn,
					sid: true,
					domain
				},
				{
					action: 'wireless_watch_transparent',
					message: encodeMessage({ ...device, msgId, messages, cmd: 'SEND_MESSAGE', lan })
				}
			)
			await messager._takeARest(2000)
			messager.getActionAnswer(sid) // 清掉answer
		}
		// })
	}

	// 配置手表网络id,频率

	/**
	 *  获取这条消息路径上的所有lora手表设备
	 * @param {*} param0
	 * @returns { [{nodeId, nodePath, sn}] } devices
	 */
	async function findNodeDevices({ group, type }) {
		const ids = group.split('/').map(item => parseInt(item))
		// 找出路径上的所有节点
		const nodes = await $db.Navigation.findAll({
			where: { id: { [Op.in]: ids } }
		})
		// 在每个节点上查找手表和带转发的网关设备

		// 只有当节点上同时绑定两种设备时,才转发
		// 找出节点上有绑定设备的设备
		// 因为节点只有设备序列号，没有设备类型；当时设计的时候因为使用sqlite，为了简单使用外键，没把设备类型也放上去，所以多浪费了一次查询
		let sns = []
		// 找出节点上绑定的资源
		nodes.map(item => {
			if (item.related.length) {
				item.related.map(resource => {
					if (resource.type == type || resource.type == 'nx1_wlcall_gateway') sns.push(resource.id)
				})
			}
			if (item.device) sns.push(item.device)
		})

		const devices = await $db.Device.findAll({
			where: { sn: { [Op.in]: sns }, [Op.or]: [{ type }, { type: 'nx1_wlcall_gateway' }] }
		})
		$log.info('devices==========', sns, devices.length)
		// 组装 [{nodeId, nodePath, sn}]
		let res = []
		nodes.forEach(item => {
			const { device: sn, related } = item
			// 从关联资源上找设备
			if (related.length) {
				let transfers = related.filter(device => device.type === type || device.type == 'nx1_wlcall_gateway')
				if (sn) {
					const dev = devices.find(i => i.sn === sn)
					if (dev && (dev.type === type || dev.type == 'nx1_wlcall_gateway')) {
						transfers.push({ id: sn, type: dev.type })
					}
				}
				transfers = uniq(transfers)
				$log.info('transfers==========', transfers)
				if (transfers.length >= 2) {
					let gateways = transfers.filter(device => device.type === 'nx1_wlcall_gateway')
					if (gateways.length) {
						gateways.forEach(gateway => {
							const device = devices.find(i => i.sn === gateway.id)
							if (device) {
								// 符合转发条件
								res.push({
									nodeId: item.id,
									nodePath: item.path,
									sn: device.sn,
									attrs: device.attrs,
									unicastAddr: item.unicastAddr
								})
							}
						})
					}
				}
			}
		})
		// 返回
		return { devices: res }
	}

	// 接收消息
	return async ({ topic, message, domain, device }) => {
		const { payload = {}, type, tid } = message
		const { code, result } = payload
		/** 处理80000业务呼叫事件，添加到条屏显示 */
		if (type === MESSAGE_TYPE.EVENTS) {
			switch (Number(code)) {
				// 业务呼叫
				case EVENT_CODE.APPLICATION_CALL:
					const { path, message, group, device } = payload
					// 检查是否有缓存
					const tidItem = tidCache.get(tid)
					// 有缓存
					if (tidItem) {
						const { devices } = tidItem
						// 所以msgId 应保证不与上一条一致
						const msgId = id++
						if (id === 255) id = 0
						// 执行显示动作
						addMessage({ path, message, domain, msgId, devices })
					} else {
						// 获取这条消息路径上的所有lorawatch设备
						const { devices } = await findNodeDevices({ group, type: TYPE })
						// msgId 为包序号,取值范围0~255;如果包序号与当前手表显示的包序号一致则导致该条消息被忽略无法显示;
						// 所以msgId 应保证不与上一条一致
						const msgId = id++
						if (id === 255) id = 0
						// 设置缓存
						tidCache.set(tid, { msgId, devices })
						// 执行显示动作
						addMessage({ path, message, domain, msgId, devices })
					}
					break
				case EVENT_CODE.IO_KEY:
					const { transparent } = payload
					if (transparent) {
						// 带转发的发射器, from 固定0000000, 通过解析主题获取到网关sn
						let topics = topic.split('/')
						const gatewaySn = topics[topics.length - 2]
						const gateway = await $db.Device.findByPk(gatewaySn)
						if (gateway) {
							// 解码
							if (transparent.endsWith('OD')) {
								// 如果包尾为OD的说明是手表收到信息后手动按键应答回码
							} else {
								$log.info('payload.transparent=====', transparent)
								let answerMsgs = decodeMessage(transparent)
								// 更新网关属性frequency":420,"netId":0
								if (gateway.attrs.mode !== 'transfer') {
									answerMsgs.mode = 'transfer'
								}
								let attrs = { ...gateway.attrs, ...answerMsgs }
								if (!whereEq(attrs)(gateway.attrs) || !whereEq(gateway.attrs)(attrs)) {
									$log.info('answerMsgs=====', gateway.attrs, attrs)
									await $db.Device.update({ attrs }, { where: { sn: gatewaySn } })
								}
							}
						}
					}
					break
				default:
					break
			}
		} else if (type === MESSAGE_TYPE.ALARMS) {
			// 告警
		}

		/** 事务结束，lora手表没有移除条屏显示的功能 */
		if (tid && result >= TRANSACTION_RESULT.COMPLETED) {
			const tidItem = tidCache.get(tid)
			// 找不到就没办法取消消息显示，只能选择设备执行动作-全部清除
			if (tidItem) {
				const { devices } = tidItem
				const { path, message, group, device } = payload
				$log.info('TRANSACTION_RESULT==================', payload)
				const msgId = id++
				if (id === 255) id = 0
				// 执行显示动作
				addMessage({ path, message, domain, msgId, devices })
				// 清除缓存
				tidCache.set(tid)
			}
		}
	}
}

/**
 * keep表示保持后面的多少格
 * trim表示剔除卡面的多少格
 * 先剔除再保持
 *
 * @param {*} path
 * @param { { keep, trim } } param1
 * @returns
 */
function prunePath(path, { trim = 0, keep = 3 }) {
	return path
		.split('/')
		.filter(item => !!item)
		.slice(trim)
		.slice(-keep)
		.join('/')
}
