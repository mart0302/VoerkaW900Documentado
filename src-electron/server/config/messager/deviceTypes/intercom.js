// 处理消息
const { RESPONSE_CODE, MESSAGE_TYPE, EVENT_CODE, TRANSACTION_RESULT } = require('@voerka/messager')
const { isEmpty } = require('lodash')
const { INTERCOM_PUSH_TYPE } = requireConfig('constant')
const fs = require('fs-extra')
const { Op } = require('sequelize')
const { useKVCache } = requireApi('utils/index')
const { upload: uploadConfig } = requireConfig('vars')
const { tts: ttsConfig } = uploadConfig
const { destination } = ttsConfig
const ttsPath = appPath.resolve.data(destination)

// 设备类型
const TYPE = 'nx1_wlcall_gateway' //'intercom'

module.exports = ({ dbUtils, messager }) => {
	// 设备端说不能跟999冲突，所以直接从1000开始好了
	let id = 1000
	// tid - { msgId, devices: ['xxxx', 'xxx'] }
	const tidCache = useKVCache({ life: 60 * 30 * 1000 })

	// 添加消息给nx1led（nx1led执行添加消息动作）
	function addWavFile({ callerSn, path, message, domain, msgId, devices = [] } = {}) {
		// 执行动作
		devices.forEach(async device => {
			const { sn, nodePath, nodeId, attrs } = device
			const prefix = [nodePath, nodeId].join('/')
			const trim = prefix.split('/').filter(item => !!item).length
			// 显示的消息：1. 不包含当前条屏的位置，只显示子位置；2. 如果子位置还是超出3格，只保留3格
			let messages = `${prunePath(path, { trim, keep: 3 })} ${message}`

			const gatewayId = parseInt(sn, 16)
			// 判断目标目录是否存在，不存在需创建
			if (!fs.existsSync(ttsPath)) {
				fs.mkdirsSync(ttsPath)
			}
			$tts._saveWav(messages, msgId + gatewayId, ttsPath, async code => {
				// 合成语音包'C:\\Users\\Admin\\AppData\\Roaming\\@voerka\\w900\\Data\\temps\\6751595118430.wav'
				if (code == 0) {
					const id = parseInt(msgId + gatewayId) + ''
					const fileName = `${id}.wav`
					const url = `/${destination}/${fileName}`
					let ttsAudio = await $db.TtsAudio.findByPk(id)
					if (!ttsAudio) {
						// 创建记录
						const maxOrderItem = await $db.TtsAudio.findAll({
							where: { gatewaySn: device.sn },
							order: [['orderId', 'DESC']]
						}) // ASC
						let orderId = 0
						if (maxOrderItem.length) {
							orderId = maxOrderItem[0].orderId + 1
						}
						$db.TtsAudio.create({
							id,
							gatewaySn: device.sn,
							fileName,
							url,
							callerSn,
							path,
							orderId,
							message: messages,
							status: false
						})
					} else {
						// 更新记录
						$db.TtsAudio.update({ status: false, url: url }, { where: { id }, individualHooks: true })
					}
				}
			})
		})
	}

	// 移除消息
	function removeMessage({ domain, msgId, devices = [] } = {}) {
		// 删除音频文件
		// 执行动作
		devices.forEach(async device => {
			const { sn } = device
			const gatewayId = parseInt(sn, 16)
			const id = parseInt(msgId + gatewayId) + ''
			let ttsAudio = await $db.TtsAudio.findByPk(id)
			if (ttsAudio) {
				// 先删除文件，再操作数据库
				// 删除文件
				await $db.TtsAudio.destroy({
					where: { id },
					individualHooks: true
				})
			}
		})
	}

	/**
	 *  获取这条消息路径上的所有网关设备
	 * @param {*} param0
	 * @returns { [{nodeId, nodePath, sn}] } devices
	 */

	async function findNodeDevices({ group, type }) {
		const ids = group.split('/').map(item => parseInt(item))
		// 找出路径上有开启对讲功能绑定设备的设备节点
		const intercomNodes = await $db.Navigation.findAll({
			where: { id: { [Op.in]: ids }, intercom: { [Op.ne]: null }, pushType: { [Op.ne]: INTERCOM_PUSH_TYPE.NOTICE } }
		})
		// 找出节点上有开启对讲功能绑定设备的设备
		// let intercomNodes = nodes.filter(item => item.intercom)
		const sns = intercomNodes.map(item => item.intercom)
		// 组装 [{nodeId, nodePath, sn}]
		let res = []
		const devices = await $db.Device.findAll({
			where: { sn: { [Op.in]: sns }, [Op.or]: [{ type }, { type: 'nx1_wlcall_gateway' }] }
		})
		intercomNodes.forEach(item => {
			const { device: sn, related, intercom } = item
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
			if (related.length && intercom) {
				related.forEach(resource => {
					if (resource.type !== 'keyMap') {
						const device = devices.find(i => i.sn === resource.id)
						if (device && device.sn == intercom) {
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
		const { from: fromDevice, payload = {}, type, tid } = message
		const { code, result } = payload
		/** 处理80000业务呼叫事件，添加到条屏显示 */
		if (type === MESSAGE_TYPE.EVENTS) {
			switch (Number(code)) {
				// 业务呼叫
				case EVENT_CODE.APPLICATION_CALL:
					const { path, message, group, device } = payload
					// 检查是否有缓存
					const tidItem = tidCache.get(tid)
					// const lan = await $db.Setting.findByPk('current_language')
					// 有缓存
					if (tidItem) {
						const { msgId, devices } = tidItem
						// 执行显示动作
						addWavFile({ callerSn: device.sn, path, message, domain, msgId, devices })
					} else {
						// 获取这条消息路径上的所有intercom设备
						const devices = await findNodeDevices({ group, type: TYPE })
						// 使用呼叫器的sn作为msgId，防止因设备重启导致led屏消息驻留
						const msgId = parseInt(device.sn, 16) // 通知不能用这个
						// 设置缓存
						tidCache.set(tid, { msgId, devices })
						// 执行显示动作
						addWavFile({ callerSn: device.sn, path, message, domain, msgId, devices })
					}
					break
				case RESPONSE_CODE.OK: // 有可能是网关发来的播放语音包后，发送过来的消息
					// 查找id， 删除，并下发下一条音频包通知
					const { id } = payload
					const playedAudio = await $db.TtsAudio.findByPk(id)
					if (playedAudio) {
						// 更新状态
						await $db.TtsAudio.destroy({
							where: { id },
							individualHooks: true
						})
						// await $db.TtsAudio.update({ status: true }, { where: { id }, individualHooks: true })
					}
					// 查找下一个语音包，发送通知
					const validAudios = await $db.TtsAudio.findAll({
						where: { gatewaySn: fromDevice, status: false },
						order: [['orderId', 'ASC']]
					}) // ASC
					if (validAudios.length) {
						const nextAudio = validAudios[0].toJSON()
						const { id, url } = nextAudio
						$messager.postAction(
							{
								to: fromDevice,
								sid: true,
								domain: $userConfig.domain
							},
							{
								action: 'intercom',
								msgId: parseInt(id),
								url: url
							}
						)
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
