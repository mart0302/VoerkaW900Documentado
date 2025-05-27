// 处理消息
const { RESPONSE_CODE, MESSAGE_TYPE, EVENT_CODE, TRANSACTION_STATUS, TRANSACTION_RESULT } = require('@voerka/messager')
const { isEmpty } = require('lodash')
const { Op } = require('sequelize')
const { useKVCache } = requireApi('utils/index')

// 设备类型
const TYPE = 'wlcallerhost'

module.exports = ({ dbUtils, messager }) => {
	// tid - { msgId, devices: ['xxxx', 'xxx'] }
	const tidCache = useKVCache({ life: 60 * 30 * 1000 }) // 如果修改会导致超过30秒后，事务想清掉，找不到对应的事务了

	// 添加消息给nx1led（nx1led执行添加消息动作）
	function addMessage({ path, message, domain, msgId, devices = [] } = {}) {
		// 执行动作
		devices.forEach(device => {
			const { sn, nodePath, nodeId } = device
			const prefix = [nodePath, nodeId].join('/')
			const trim = prefix.split('/').filter(item => !!item).length
			// 显示的消息：1. 不包含当前条屏的位置，只显示子位置；2. 如果子位置还是超出3格，只保留3格
			let messages = `${prunePath(path, { trim, keep: 3 })} ${message.message}`
			messager.postAction(
				{
					to: sn,
					sid: true,
					domain
				},
				{
					action: 'add',
					msgId,
					...message,
					content: messages
				}
			)
		})
	}

	// 移除消息
	function removeMessage({ domain, msgId, devices = [] } = {}) {
		// 执行动作
		devices.forEach(device => {
			const { sn } = device
			messager.postAction(
				{
					to: sn,
					sid: true,
					domain
				},
				{
					action: 'remove',
					msgId
				}
			)
		})
	}

	/**
	 *  获取这条消息路径上的所有nx1led设备
	 * @param {*} param0
	 * @returns { [{nodeId, nodePath, sn}] } devices
	 */
	async function findNodeDevices({ group, type }) {
		$log.info('wlcallerhost findNodeDevices+++++++++++++++++', group, type)
		const ids = group.split('/').map(item => parseInt(item))
		// 找出路径上的所有节点
		const nodes = await $db.Navigation.findAll({
			where: { id: { [Op.in]: ids } }
		})
		// 找出节点上有绑定设备的设备
		// 因为节点只有设备序列号，没有设备类型；当时设计的时候因为使用sqlite，为了简单使用外键，没把设备类型也放上去，所以多浪费了一次查询
		let sns = nodes.map(item => item.device).filter(item => item)
		$log.info('wlcallerhost findNodeDevices================', sns, nodes)
		// 找出节点上绑定的资源
		nodes.map(item => {
			if (item.related.length) {
				item.related.map(resource => {
					if (resource.type !== 'keyMap') sns.push(resource.id)
				})
			}
		})
		const devices = await $db.Device.findAll({
			where: { sn: { [Op.in]: sns }, type }
		})

		// 组装 [{nodeId, nodePath, sn}]
		const res = []
		nodes.forEach(item => {
			const { device: sn, related } = item
			if (sn) {
				const device = devices.find(i => i.sn === sn)
				if (device) {
					res.push({
						nodeId: item.id,
						nodePath: item.path,
						sn: device.sn,
						attrs: device.attrs
					})
				}
			}
			// 从关联资源上找设备
			if (related.length) {
				related.forEach(resource => {
					if (resource.type !== 'keyMap') {
						const device = devices.find(i => i.sn === resource.id)
						if (device) {
							res.push({
								nodeId: item.id,
								nodePath: item.path,
								sn: device.sn,
								attrs: device.attrs
							})
						}
					}
				})
			}
		})
		// 返回
		return res
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
					const { group, path } = payload
					// 检查是否有缓存
					const tidItem = tidCache.get(tid)
					// 有缓存
					if (tidItem) {
						const { msgId, devices } = tidItem
						// 执行显示动作
						addMessage({ path, message: payload, domain, msgId, devices })
					} else {
						// 获取这条消息路径上的所有wlcallerhost设备
						const devices = await findNodeDevices({ group, type: TYPE })
						if (!devices) break
						$log.info('wlcallerhost message+++++++++++++++++', devices)
						// 使用呼叫器的sn作为msgId，防止因设备重启导致led屏消息驻留
						const msgId = tid
						// 设置缓存
						tidCache.set(tid, { msgId, devices })
						// 执行显示动作
						addMessage({ path, message: payload, domain, msgId, devices })
					}
					break
				default:
					break
			}
		} else if (type === MESSAGE_TYPE.ALARMS) {
			// 告警
		}

		/** 事务结束，移除条屏显示 */
		if (tid && result >= TRANSACTION_RESULT.COMPLETED) {
			const tidItem = tidCache.get(tid)
			// 找不到就没办法取消消息显示，只能选择设备执行动作-全部清除
			if (tidItem) {
				const { msgId, devices } = tidItem
				removeMessage({ domain, msgId, devices })
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
