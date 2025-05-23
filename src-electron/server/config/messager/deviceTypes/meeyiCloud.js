// 处理消息
const { MESSAGE_TYPE, EVENT_CODE, TRANSACTION_RESULT } = require('@voerka/messager')
const { Op } = require('sequelize')
const { useKVCache } = requireApi('utils/index')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const { mergeDeepRight } = require('../../../api/utils')
dayjs.extend(utc)

// 设备类型
const TYPE = 'user'

module.exports = ({ dbUtils, messager }) => {
	// tid - { msgId, devices: ['xxxx', 'xxx'] }
	const tidCache = useKVCache({ life: 60 * 30 * 1000 })

	// 发送mqtt通知前端发送消息给美一云推送消息
	function addMessage({ message, userPhones = [] } = {}) {
		// 通知meeyi信令发送消息
		$messager.postResUpdated({ type: 'meeyi_message', id: 1 }, { message, userPhones })
	}

	/**
	 * 获取这条消息路径上排班且符合当前时间的人员（内部人员）
	 */
	async function findNodeShift(ids, timestamp) {
		const today = dayjs(timestamp).format('YYYY-MM-DD').valueOf()
		const date = dayjs.utc(today).local()
		const time = dayjs(timestamp).format('HH:mm:ss').valueOf()
		let shifts = []
		for (let i = 0; i < ids.length; i++) {
			const id = ids[i]
			const qry = { nodeId: id, date: Number(date) }
			try {
				const shift = await $db.ShiftScheduler.findAll({ where: qry }) // 今天的排班
				shifts = shifts.concat(shift)
			} catch (e) {}
		}
		let users = []
		shifts.forEach(shift => {
			// 查找符合排班的部门/人员
			const start = dayjs.utc(shift.start).format('HH:mm:ss').valueOf()
			const end = dayjs.utc(shift.end).format('HH:mm:ss').valueOf()
			if (start <= time && end >= time) {
				users = users.concat(shift.users)
			}
		})
		let ableUsers = []
		// 获取人员手机
		for (let j = 0; j < users.length; j++) {
			let user = users[j]
			if (user.type == 'department') {
				// 查找部门所有人员
				const departmentUsers = await $db.User.findAll({
					where: { deptId: user.id, resourceType: 'internal' }
				})
				ableUsers = ableUsers.concat(departmentUsers)
			} else if (user.type == 'user') {
				const row = await $db.User.findByPk(user.id)
				ableUsers.push(row)
			}
		}
		const mphones = ableUsers.map(u => {
			return { resourceType: u.resourceType, mphone: u.mphone }
		})
		$log.info('users==========', mphones)
		return mphones
	}

	/**
	 *  获取这条消息路径上的所有人员/只能是内部人员
	 * @param {*} param0
	 * @returns { [{nodeId, nodePath, sn}] } devices
	 */
	async function findNodeUser({ group, type, timestamp }) {
		const ids = group.split('/').map(item => parseInt(item))
		// 找出路径上的所有节点
		const nodes = await $db.Navigation.findAll({
			where: { id: { [Op.in]: ids } }
		})
		// 找出节点上有绑定设备的设备
		let sns = []
		// 找出节点上绑定的资源
		nodes.map(item => {
			if (item.related.length) {
				item.related.map(resource => {
					if (resource.type == type) sns.push(resource.id)
				})
			}
		})
		const users = await $db.User.findAll({
			where: { username: { [Op.in]: sns } }
		})

		//
		const innerPersonPhones = await findNodeShift(ids, timestamp)
		const mphones = users
			.map(user => {
				return { resourceType: user.resourceType, mphone: user.mphone }
			})
			.concat(innerPersonPhones)
		$log.info('======================meeyi Cloud mphones======================================', mphones)
		// 返回
		return mphones
	}

	// 接收消息
	return async ({ topic, message, domain, device }) => {
		// 判断是否开启美一云功能, 开启则推送
		const meeyiCloudSetting = await await $db.Setting.findByPk('meeyi_cloud')
		if (meeyiCloudSetting.value.enabled) {
			const { payload = {}, type, tid, timestamp } = message
			const { code, result, alarmCode, progress } = payload
			/** 处理80000业务呼叫事件，添加到美一云显示 */
			if (type === MESSAGE_TYPE.EVENTS || type === MESSAGE_TYPE.ALARMS) {
				if (
					Number(code) == EVENT_CODE.APPLICATION_CALL ||
					Number(code) == EVENT_CODE.DEVICE_ATTRS_CHANGED ||
					Number(alarmCode) == EVENT_CODE.DEVICE_ATTRS_CHANGED
				) {
					// 业务呼叫
					// case EVENT_CODE.APPLICATION_CALL:
					const { group } = payload
					// 检查是否有缓存
					const tidItem = tidCache.get(tid)
					// 有缓存
					if (tidItem) {
						const { userPhones, message: storeMessage } = tidItem
						// 执行显示动作
						let newMessage = {}
						if (alarmCode) {
							// 原先告警事件处理完之后是不需要上报给前端的，但是由于需要推送美一消息，所以还是需要上报
							newMessage = mergeDeepRight(storeMessage, {
								payload: { result, progress: payload.progress, message: payload.resultTitle }
							})
						} else {
							newMessage = message
						}
						$log.info('message=====', newMessage, userPhones)
						addMessage({ message: newMessage, userPhones })
					} else {
						// 获取这条消息路径上的所有用户手机号
						const userPhones = await findNodeUser({ group, type: TYPE, timestamp })
						// 设置缓存
						tidCache.set(tid, { userPhones, message })
						// 执行显示动作
						addMessage({ message, userPhones })
					}
					// 	break
					// default:
					// 	break
				}
			}

			/** 事务结束，微信公众号显示 */
			if (tid && result >= TRANSACTION_RESULT.COMPLETED) {
				const tidItem = tidCache.get(tid)
				// 找不到就没办法取消消息显示，只能选择设备执行动作-全部清除
				if (tidItem) {
					const { userPhones } = tidItem
					addMessage({ message, userPhones })
					// 清除缓存
					tidCache.set(tid)
				}
			}
		}
	}
}
