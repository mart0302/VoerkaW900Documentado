const {
	default: Messager,
	RESPONSE_CODE,
	MESSAGE_TYPE,
	EVENT_CODE,
	TRANSACTION_STATUS,
	TRANSACTION_RESULT
} = require('@voerka/messager')

const MQTT = require('mqtt')
const { useCache } = requireApi('utils/index')
const { EVENT_TYPE, RES_TYPE_KEYMAP, KEYMAP_TYPE, RES_TYPE_DEVICE, CALL_SETTINGS } = require('../constant')
const { pick } = require('lodash')
const { genToken } = requireApi('utils/index')
const { Op, QueryTypes } = require('sequelize')
const logger = requireConfig('logger')
const { filter } = require('rxjs/operators')
const { encodeMessage } = require('../../../utils.js')
const moment = require('moment-timezone')

// TODO: 按道理按键映射是呼叫器的逻辑，也应该抽出来到./deviceTypes/wlcaller
// 设备类型处理消息逻辑
const installNx1ledService = require('./deviceTypes/nx1led')

const installLorawatchService = require('./deviceTypes/lorawatch')

const installCancelCallerService = require('./deviceTypes/cancelCaller')

const installWlcallerhostService = require('./deviceTypes/wlcallerhost')

const installIntercomService = require('./deviceTypes/intercom')

const { mergeDeepRight } = require('../../api/utils')

const installMeeyiCloudService = require('./deviceTypes/meeyiCloud')

// 服务端模拟sn，因为服务端也要发送消息，消息必须又来源，来源是设备序列号，假设服务端也有设备序列号
const SERVER_SN = 'w900_server1'

// 动作应答消息
let actions = {}
module.exports = function createMessager($db) {
	const dbUtils = useDatabase($db)
	const { findDevice, findNodeBySn, findPathNodes, findKeyMapByPath } = dbUtils

	const filterPools = {}
	const filterTimeGap = 5000
	// 过滤IO事件
	const filterIOKeyEvent = key => {
		const hit = filterPools[key]
		if (!hit) {
			filterPools[key] = Date.now() + filterTimeGap
			return true
		} else {
			if (Date.now() > hit) {
				filterPools[key] = Date.now() + filterTimeGap
				return true
			} else {
				return false
			}
		}
	}

	const $messager = new Messager({
		MQTT,
		master: {
			url: 'mqtt://127.0.0.1',
			clientId: SERVER_SN,
			voerka: {
				sn: SERVER_SN,
				domain: $userConfig.domain, // 此处说明，后端只会支持一个domain，并不是多个domain同时支持，如果要支持多个domain，那么domain必须在每次发消息时明确指定(TODO)
				subscriptions: ['/voerka/#']
			},
			defineInSubject(subject) {
				return subject.pipe(
					filter(item => {
						const { message } = item
						const { from: sn, payload = {}, type, id } = message
						const { code, key } = payload
						// 只针对呼叫器io事件进行分组
						if (type === MESSAGE_TYPE.EVENTS && code === EVENT_CODE.IO_KEY) {
							return filterIOKeyEvent(`${sn}_${key}`)
						} else {
							return true
						}
					})
				)
			}
		}
	})

	// 注册各个设备类型的业务处理
	const nx1ledOnMsg = installNx1ledService({ dbUtils, messager: $messager })

	const lorawatchOnMsg = installLorawatchService({ dbUtils, messager: $messager })

	const cancelCallerOnMsg = installCancelCallerService({ dbUtils, messager: $messager })

	const wlcallerhostOnMsg = installWlcallerhostService({ dbUtils, messager: $messager })

	const intercomOnMsg = installIntercomService({ dbUtils, messager: $messager })

	const meeyicloudOnMsg = installMeeyiCloudService({ dbUtils, messager: $messager })

	// 将收到的消息分发给各个设备类型处理专门的逻辑
	function dispatchToDeviceTypes({ topic, message, domain, device }) {
		nx1ledOnMsg({ topic, message, domain, device })
		wlcallerhostOnMsg({ topic, message, domain, device })
		meeyicloudOnMsg({ topic, message, domain, device })
		intercomOnMsg({ topic, message, domain, device })
	}

	/** 方法 */
	/**
	 * 转换IO消息【包含发送消息】
	 * 转换并发送转化完成的消息
	 * @return
	 */
	async function transformIoMessage({ ioMessage, path, keymap, device, groupId }) {
		const key = ioMessage.payload.key
		const { message = '', type = KEYMAP_TYPE.CALL, color, code, level } = parseKeymap(keymap, key)
		// 语义路径
		const semanticPath = path
			.map(item => item.title)
			.reverse()
			.join('/')
		// 路径
		const group = path
			.map(item => item.id)
			.reverse()
			.join('/')

		if (type === KEYMAP_TYPE.ALARM) {
			// 发送告警
			return $messager.postAlarm(
				{
					tid: true, // 凡是转化的告警一律创建新的事务【可根据业务优化】
					group,
					from: device.sn // 服务器只是代理转化消息，实际上消息虽然是服务器发出去的，但是from还是之前的sn，方便后续代码编写
				},
				{
					type,
					message,
					color,
					group,
					path: semanticPath,
					device: pick(device, ['sn', 'title']),
					code, // 根据按键映射中的定义
					level,
					progress: 10,
					result: TRANSACTION_RESULT.HANDLING
				}
			)
		} else {
			// 事件code，事务进度与结果
			// 呼叫事件 或者 取消某个事务
			const typeRes =
				type === KEYMAP_TYPE.CANCEL // 取消呼叫
					? {
							code: EVENT_CODE.DEVICE_TRANS_PROGRESS,
							progress: 100,
							result: TRANSACTION_RESULT.COMPLETED, // 产品部要求，按键取消认为是这个呼叫完成
							remarks: message,
							handler: { sn: device.sn, type: device.type, title: device.title }
					  }
					: {
							// 呼叫
							code: EVENT_CODE.APPLICATION_CALL,
							progress: 10,
							result: TRANSACTION_RESULT.HANDLING
					  }

			// 如果设备还有事务没有结束，则算到这个事务里，如果是取消，代表事务刚好结束
			const transaction = await $db.Transaction.findOne({
				where: {
					sn: device.sn, // // 同一个设备发出来的算是同一个事务，也可用group代替，那样就是同一个节点不同设备算一个事务
					result: { [Op.lt]: TRANSACTION_RESULT.COMPLETED }, // 事务未结束
					code: EVENT_CODE.APPLICATION_CALL // 起始时间是呼叫
				}
			})

			// 如果当前呼叫器一个事务都没有，但是呼叫器却发送了取消按键事件过来
			// 都没有，怎么取消
			if (!transaction && type === KEYMAP_TYPE.CANCEL) {
				return
			}

			// 发送事件
			return $messager.postEvent(
				{
					tid: transaction ? transaction.id : true,
					group,
					from: device.sn // 服务器只是代理转化消息，实际上消息虽然是服务器发出去的，但是from还是之前的sn，方便后续代码编写
				},
				{
					key,
					groupId,
					type,
					message,
					color,
					group,
					path: semanticPath,
					device: pick(device, ['sn', 'title']),
					...typeRes
				}
			)
		}
	}

	/**
	 * 存储事件(包含告警) 【数据库操作，不包含发送消息】
	 */
	async function saveDbEvent(msg = {}) {
		const { id, timestamp, from: sn, type, payload = {}, tid } = msg
		const { code, message, remarks, location = {}, level, group, path, result } = payload

		// 涉及事务，先创建事务/更新事务（不然事件的外键会报错）
		if (tid) {
			const trans = await saveDbTransaction(msg)
			if (!trans) {
				// 事务早已经死亡，没有再处理的必要
				return
			}
		}

		// 创建事件
		let event = await $db.Event.create({
			id,
			type: type === MESSAGE_TYPE.ALARMS ? EVENT_TYPE.ALARM : EVENT_TYPE.EVENT,
			code,
			message,
			remarks,
			location,
			level,
			group,
			path,
			originalPayload: payload,
			triggerTime: new Date(timestamp),
			receiveTime: new Date(),
			handleTime: null,
			result,
			tid,
			sn: sn === SERVER_SN ? null : sn // 如果是服务端messager，则没有sn，否则进入到此处的均是已认证的设备
		})

		// 针对告警，特别实现1005-告警已取消，1006-告警已处理
		// 告警的处理方式： 1.事务进度(不认可) 2.事件1005、1006
		// 即告警与事务是分离的，告警的取消结束仅认可事件1005、1006，1条事务可以有多个告警
		await updateDbAlarm(msg)

		event = event.toJSON()

		return event
	}

	/**
	 * 存储事务（包含更新）【数据库操作，不包含发送消息】
	 */
	async function saveDbTransaction(msg = {}) {
		const { timestamp, from: sn, type, payload = {}, tid } = msg
		const { code, message, group, path, result, progress, remarks, handler = {} } = payload

		if (!tid) {
			return
		}
		const { callPrecaution } = $settings.get(CALL_SETTINGS)
		let transaction = await $db.Transaction.findByPk(tid)
		if (!transaction) {
			// 不存在，创建事务
			transaction = await $db.Transaction.create({
				id: tid,
				title: message,
				originalPayload: payload,
				remarks,
				handler,
				// 边界情况: 由于网络原因，或者什么问题，messager只收到这个事务的一条消息，且刚好是最后一条
				completeTime: progress >= 100 || result >= 10 ? new Date() : null,
				precaution: Date.now() - timestamp > callPrecaution ? true : false,
				progress: progress || 10, // 默认从10开始，否则会从0
				result,
				status: progress >= 100 || result >= 10 ? TRANSACTION_STATUS.COMPLETED : TRANSACTION_STATUS.PROGRESSING,
				startTime: new Date(timestamp),
				// 以下数据继承事务的第一个告警或事件
				type: type === MESSAGE_TYPE.EVENTS ? EVENT_TYPE.EVENT : EVENT_TYPE.ALARM,
				code,
				group,
				path,
				sn: sn === SERVER_SN ? null : sn
			})
		} else {
			// 判断事务是否已经死亡，对已经结束的事务就不再处理了
			if (transaction.result < TRANSACTION_RESULT.COMPLETED) {
				const { callTimeout } = $settings.get(CALL_SETTINGS)

				// 已存在，更新事务
				const completeTime =
					progress >= 100 || result >= 10 ? Math.min(new Date(), transaction.startTime.valueOf() + callTimeout) : null
				await $db.Transaction.update(
					{
						title: code === EVENT_CODE.APPLICATION_CALL ? message : transaction.message, // title以最新的呼叫事件消息为准（取消与事务处理就不算在内了）
						originalPayload: payload, // originalPayload以最新的为准
						remarks, // remarks以最新的为准
						handler,
						path, // 按键切换时如果节点已变更也需要变更
						completeTime, // 不管是不是1003
						duration: completeTime ? completeTime - transaction.startTime : null,
						precaution: Date.now() - transaction.startTime > callPrecaution ? true : false, // 根据settings判断是否超出预警时间
						progress,
						result,
						status: progress >= 100 || result >= 10 ? TRANSACTION_STATUS.COMPLETED : TRANSACTION_STATUS.PROGRESSING
					},
					{ where: { id: tid }, individualHooks: true } // individualHooks=true才能在钩子函数中监听到
				)
				transaction = await $db.Transaction.findByPk(tid)
			} else {
				// 事务早已结束，告知外层不必再处理了
				return false
			}
		}

		transaction = transaction.toJSON()

		return transaction
	}

	/**
	 * 更新告警 【数据库操作，不包含发送消息】
	 * 根据事件处理之前的某个告警
	 * http://192.168.38.165:8900/rdcenter/voerkadocs/protocols/common/设备事件管理.html#设备事件（1xxx）
	 * @param {*} msg
	 */
	async function updateDbAlarm(msg = {}) {
		const { payload = {} } = msg
		const { code, alarmId, alarmResult, userId, remarks } = payload

		// 不是1005或1006，返回
		if (code !== EVENT_CODE.DEVICE_ALARM_CANCELLED && code !== EVENT_CODE.DEVICE_ALARM_HANDLED) {
			return
		}
		// 没有alarmId，返回
		if (!alarmId) {
			return
		}
		const alarm = await $db.Event.findByPk(alarmId)
		// 找不到alarm，返回
		if (!alarm) {
			return
		}

		// 更新告警
		const { alarmTimeout } = $settings.get(CALL_SETTINGS)
		await $db.Event.update(
			{
				handleTime: Math.min(new Date(), alarm.triggerTime.valueOf() + alarmTimeout),
				result: alarmResult,
				status: TRANSACTION_STATUS.COMPLETED,
				remarks,
				userId
			},
			{ where: { id: alarmId }, individualHooks: true }
		)
	}

	/**
	 * 处理实体告警
	 *
	 * 此处不得已
	 * 本应该写在controller中，但是因为我们要处理超时，告警超时也是一种涉及多点的复杂操作，所以考虑复用；
	 * 但是是 controller调用messager 还是 messager调用controller？考虑决定还是controller调用messager
	 *
	 * @param { id, tid, type, result, group } alarm
	 * @param { result, remarks } params
	 */
	async function handleEntityAlarm(alarm, params = {}) {
		// 处理参数
		const { result, remarks = '', resultTitle = '', syncTransaction } = params

		// 如果不是告警返回错误
		if (alarm.type !== EVENT_TYPE.ALARM) {
			throw $APIError.NotFound('error.alarm_not_found')
		}

		// 如果告警已处理返回错误
		if (alarm.result >= TRANSACTION_RESULT.COMPLETED) {
			// 告警允许其重复处理
			// throw $APIError.NotFound('error.alarm_already_ended')
		}

		// 更新告警结果
		const { alarmTimeout } = $settings.get(CALL_SETTINGS)
		await $db.Event.update(
			{
				result,
				remarks,
				handleTime: Math.min(new Date(), alarm.triggerTime.valueOf() + alarmTimeout),
				status: TRANSACTION_STATUS.COMPLETED
			},
			{ where: { id: alarm.id } }
		)

		/**
		 * 同步处理事务
		 *
		 * 原本我打算通过：syncTransaction这个开关让前端实现选择：1.处理告警同时处理事务 2.仅处理告警
		 * 但是在实现中发现，但凡是事务，你只要带了result，就无法分辨是处理告警还是处理事务，所以通常判断为两者都处理
		 */
		if (!alarm.tid) {
			throw $APIError.NotFound('error.transaction_not_found')
		}
		// 发送消息
		// 发出1005/1006事件（告警已取消/已处理事件），同时这个事件也是事务，而且进度100，结果>=10，只是不是事务进度事件而是1005/1006
		const { message, topic } = $messager.handleAlarm(
			{
				w900: { solved: true }, // 告诉服务器messager，这条消息已经处理了，你那边不用再处理
				tid: alarm.tid,
				group: alarm.group
			},
			{
				result,
				resultTitle,
				progress: 100,
				remarks,
				alarmId: alarm.id,
				alarmResult: result,
				alarmCode: alarm.code,
				userId: '' // 后续多用户需要指明处理的用户，超时默认是system
			},
			{
				straight: true // 告诉messager，这条消息不等待mqtt走一回，直接进入接收环节
			}
		)
		// 处理消息
		const event = await $messager.saveDbEvent(message)
		if (!event) {
			const transaction = await $db.Transaction.findByPk(alarm.tid)
			await fixTransactionFinished(transaction)
		}
	}

	/**
	 * 处理实体事务
	 * @param { id, group } transaction
	 * @param { result, progress, remarks, message } payload
	 */
	async function handleEntityTransaction(transaction, payload = {}) {
		// 发送消息
		let { originalPayload } = transaction
		if (originalPayload && typeof originalPayload == 'string') {
			originalPayload = JSON.parse(originalPayload)
		}
		const origin = originalPayload
			? { groupId: originalPayload.groupId, type: originalPayload.type, device: originalPayload.device }
			: {}
		const { message, topic } = $messager.setTransactionProgress(
			{
				w900: { solved: true }, // 告诉服务器messager，这条消息已经处理了，你那边不用再处理
				tid: transaction.id,
				group: transaction.group
			},
			{
				...origin,
				...payload,
				path: transaction.path
			},
			{
				straight: true // 告诉messager，这条消息不等待mqtt走一回，直接进入接收环节，因为上面已经标记“已处理”，此处意义不大
			}
		)
		// 处理消息
		const event = await $messager.saveDbEvent(message)
		if (!event) {
			await fixTransactionFinished(transaction)
		}
	}

	// 有些事务已经结束了，但是仍然发起请求去结束事务，就会使用到这个方法
	async function fixTransactionFinished(transaction) {
		// 事务已经结束，只不过用户尝试再次结束事务，说明可能是数据错误的问题，直接更新数据即可，不再抛出错误
		const { id, completeTime, result, startTime } = transaction
		const { callTimeout, callPrecaution } = $settings.get(CALL_SETTINGS)

		let timeFix = {}
		if (!completeTime) {
			// 如果没有结束时间，则修复结束时间的错误
			const completeTime = Math.min(Date.now(), startTime.valueOf() + callTimeout)
			timeFix = {
				completeTime,
				duration: completeTime - startTime,
				precaution: completeTime - startTime > callPrecaution ? true : false
			}
		}
		await $db.Transaction.update(
			{
				...timeFix,
				progress: 100,
				// 如果超时，则结果为超时，否则沿用之前的结果
				result: timeFix.duration >= callTimeout ? TRANSACTION_RESULT.TIMEOUT : result || TRANSACTION_RESULT.COMPLETED,
				status: TRANSACTION_STATUS.COMPLETED
			},
			{ where: { id }, individualHooks: false } // 此处不必再触发资源变更事件，静默修改即可
		)
	}

	// 很多地方的变更需要通知所有主机设备
	async function sendHostAttrs(data) {
		// 下发属性变更事件
		const devs = await $db.Device.findAll({
			where: { type: 'wlcallerhost' }
		})
		if (devs.length) {
			devs.map(device => {
				$messager.postAttrs(
					{ to: device.sn, sid: true, domain: device.mqtt.domain || $userConfig.domain }, // domain可加可不加，因为此项目是单domain的
					{ ...data }
				)
			})
		}
	}

	/**
	 * 监听数据库变化，自动发出资源变更事件
	 *
	 * 资源创建/资源更新/资源删除
	 */
	function useDbResourceEvent(model, { type, pk = 'id' } = {}) {
		model.addHook('afterCreate', (res, options) => {
			$messager.postResCreated({ type, id: res[pk] }, res.toJSON())
		})

		model.addHook('afterDestroy', (res, options) => {
			// postResDeleted
			$messager.postResDeleted({ type, id: res[pk] }, res.toJSON())
		})

		model.addHook('afterUpdate', (res, options) => {
			// postResUpdated
			$messager.postResUpdated({ type, id: res[pk] }, res.toJSON())
		})
	}

	/** 处理接收消息 */
	$messager.onMessage(async data => {
		const { topic, message } = data
		$log.info('[onMessage] topic is:', topic)
		// $log.info('[onMessage] message is:', message)
		const { domain, rs } = parseTopic(topic)
		const { from: fromDevice, payload = {}, sid, type, w900 = {} } = message
		// TODO: 如果严格点，只允许当前选中domain，即$userConfig.domain
		if (!domain || !fromDevice || rs) {
			return
		}
		// 代表这条消息的业务已经被处理了，不用再处理；一般是controller中处理了，再把事件发出来
		if (w900.solved) {
			// 分发给设备类型
			const { value } = await $db.Setting.findByPk('call_settings')
			// 超时不推送
			if (value?.timeoutPush || typeof value.timeoutPush == 'undefined' || payload.result !== 15)
				lorawatchOnMsg({ topic, message, domain })
			dispatchToDeviceTypes({ topic, message, domain })
			return
		}
		// 如果设备未认证（不在数据库中），device === null
		const device = await findDevice(fromDevice)
		/** 设备登记【让设备闭嘴】 */
		if (topic.endsWith('/register')) {
			$log.info('[register] device is:', device?.sn, fromDevice)
			const { host, port } = $userConfig
			if (device) {
				// 注册成功
				$log.info('[register] before postAnswer')
				const timezone = moment().format('Z')
				const node = await findNodeBySn(device.sn)
				let group = ''
				let groupId = ''
				if (node) {
					groupId = node.id
					// 查找导航节点路径
					const pathNodes = findPathNodes(node.id)
					group = pathNodes
						.map(item => item.title)
						.reverse()
						.join('/')
				}
				$messager.postAnswer(
					{ to: fromDevice, domain, code: RESPONSE_CODE.OK, sid },
					{
						workerID: device.workerID,
						token: genToken({ id: device.sn, type: RES_TYPE_DEVICE }),
						web: {
							host,
							port
						},
						group,
						groupId,
						timezone: 'GMT' + timezone
					}
				)
				$log.info('[register] after postAnswer')
				let attrs = device.attrs
				// $log.info('wireless_watch+++++++++++++++++++++', device.sn, payload)
				// 识别网关是否带转发功能
				if (payload['wireless_watch']) {
					attrs.mode = 'transfer'
				}
				if (payload['interphone']) {
					attrs.intercom = true
				}
				const network = payload?.network?.eth0
				let networks = device.networks
				if (network)
					networks[0] = mergeDeepRight(networks[0], {
						ip: network.ip,
						dns_prefer: network.dnsPrefer,
						dns_alter: network.dnsAlter,
						subnetmask: network.subnetMask,
						gateway: network.gateway,
						dhcp: network.dhcp
					})
				const mqtt = mergeDeepRight(device.mqtt, { broker: payload?.mqtt?.broker, domain: payload?.domain })
				await $db.Device.update(
					{ online: true, attrs, version: payload.version, mqtt, networks },
					{ where: { sn: device.sn } }
				)
				// 成功连接上带转发的网关时，发送获取频率网络号信息
				if (payload.type === 'nx1_wlcall_gateway' && payload['wireless_watch']) {
					$messager.postAction(
						{
							to: fromDevice,
							sid: true,
							domain
						},
						{
							action: 'wireless_watch_transparent',
							message: encodeMessage({
								frequency: device.attrs.frequency,
								sn: fromDevice,
								netId: device.attrs.netId,
								cmd: 'READ_LAUNCHER'
							})
						}
					)
					if (payload['interphone']) {
						// 判断网关是否开启对讲机功能，如果是已注册已绑定，判断是否允许开启
						// 如果当前有空闲音频包，则需发送通知。
						const validAudios = await $db.TtsAudio.findAll({
							where: { gatewaySn: payload.sn, status: false },
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
					}
				} else if (payload.type === 'nx1led') {
					// 如果是led屏，则发送当前时区同步时间
					const timezone = moment().format('Z')
					$log.info('timezone=========', timezone)
					$messager.postAction(
						{
							to: fromDevice,
							sid: true,
							domain
						},
						{
							action: 'modify',
							timezone: 'utc' + timezone
						}
					)
				}
			} else {
				// 设备未认证，也要给返回注册成功，否则网关会一直发注册消息
				$messager.postAnswer(
					{ to: fromDevice, domain: $userConfig.domain, code: RESPONSE_CODE.OK, sid },
					{
						workerID: 0,
						token: genToken({ id: fromDevice, type: RES_TYPE_DEVICE }),
						web: {
							host,
							port
						},
						group: '',
						groupId: ''
					}
				)
				// 注册失败，设备未认证
				// $messager.postAnswer(
				// 	{ to: fromDevice, domain, code: RESPONSE_CODE.PERMISSION_DENIED, sid },
				// 	{ message: 'Device has not been authorized' }
				// )
			}
		}
		// 判断是否为取消呼叫器，如果是则直接丢到取消呼叫器设备中处理
		const cancelCall =
			device?.type === 'wlcaller' && device?.attrs && device?.attrs.label && device?.attrs.label === 'cancel'
		/** 设备告警、事件、呼叫事件处理 */
		// 设备是否认证, 仅处理已认证的设备发出的事件
		if (device && !cancelCall) {
			if (type === MESSAGE_TYPE.EVENTS) {
				// 有些事件需要特殊处理
				// TODO: 分离按键映射转化到wlcaller
				switch (Number(payload.code)) {
					// 呼叫器事件转化
					case EVENT_CODE.IO_KEY:
						/**
						 * 转换逻辑，即发出事件、告警、事务
						 * 原则上转换后的东西不应该在此处创建，但是“事务”除外
						 * 不通过监听事务进度事件创建事务（因为1.事务进度事件内不包含起始事件，监听也没用；2.外键原因导致需要先创建事务再创建事件、告警）
						 *
						 * 转换过程：构造事务类型的呼叫事件 -> 发出该事件 -----> （此处不包含逻辑）接收到事件，将事件、事务分并存入数据库
						 */
						// 1. 判断payload合不合规范
						if (isValidIOMessage(message)) {
							// 2. 根据设备查找导航节点
							const node = await findNodeBySn(device.sn)
							if (node) {
								// 3. 查找导航节点路径
								const pathNodes = findPathNodes(node.id)
								// 4. 查找匹配的按键映射(可能没有keymap，就是根本没有配置过按键映射)
								const keymap = await findKeyMapByPath(pathNodes)
								$log.info('findeKeyMap==================', device.sn)
								// 仅当有按键映射才能转化
								if (keymap) {
									// 5. 转化消息并发送消息
									await transformIoMessage({
										ioMessage: message,
										path: pathNodes,
										keymap,
										device,
										groupId: node.id
									})
								}
							}
						}
						break
					/** 收集设备设备在线状态，维护设备状态 */
					// 理论上在线应该是驻留消息，但是设备端老是莫名其妙，按道理最好还要有定时“查询机制”，双重保险，但是设备端根本没实现“查询”
					// 状态变更事件
					case EVENT_CODE.DEVICE_STATUS_CHANGED:
						const { status = {} } = payload
						if ('online' in status && device.online !== status.online) {
							$log.info('onMessage device ' + device.sn + 'status is :', status)
							await $db.Device.update({ online: status.online }, { where: { sn: device.sn } })
						}
					case RESPONSE_CODE.OK:
						break
					default:
						// 除设备IO事件以外，其他事件判断是否有携带path\group,如果已经有，则不填充；如果没有则填充path\group来保证事件完整
						if (!payload.path || !payload.group) {
							// 1. 根据设备查找导航节点
							const node = await findNodeBySn(device.sn)
							if (node) {
								// 2. 查找导航节点路径
								const pathNodes = findPathNodes(node.id)
								// 语义路径
								payload.path = pathNodes
									.map(item => item.title)
									.reverse()
									.join('/')
								// 路径
								payload.group = pathNodes
									.map(item => item.id)
									.reverse()
									.join('/')
							}
						}
						break
				}
				// 处理事件（持久化、创建/更新事务、资源变更）
				if (Number(payload.code) !== RESPONSE_CODE.OK) {
					await saveDbEvent(message)
				}
			} else if (type === MESSAGE_TYPE.ALARMS) {
				// 告警
				await saveDbEvent(message)
			} else if (type === MESSAGE_TYPE.ANSWER) {
				const { sid } = message
				actions[sid] = message
			}
		} else if (fromDevice === SERVER_SN) {
			// 处理对象: 服务端发出的事件（比如处理告警、事务进度）
			// 目前暂无处理的逻辑
		}
		if (cancelCall) {
			// 取消呼叫器
			cancelCallerOnMsg({ topic, message, domain, device })
		}
		if (!topic.endsWith('/register')) {
			// 分发给设备类型
			dispatchToDeviceTypes({ topic, message, domain, device })
			lorawatchOnMsg({ topic, message, domain, device }) // 原本应该放在dispatchToDeviceTypes里面，但是超时推送要做特殊处理
		}
	})

	/** 将一些方法绑定在messager上 */
	// 这样用户http请求处理事务的时候，在controller中就可以同步处理事务了，直接返回结果
	$messager.saveDbEvent = saveDbEvent
	$messager.handleEntityAlarm = handleEntityAlarm
	$messager.handleEntityTransaction = handleEntityTransaction
	$messager.sendHostAttrs = sendHostAttrs
	$messager.getActionAnswer = getActionAnswer
	$messager._takeARest = _takeARest
	/** 使用资源变更事件 */
	// 针对资源: 事件（包含告警）| 事务 | 导航节点 | 设备| 证书（暂不使用）
	// 事件告警
	useDbResourceEvent($db.Event, { type: 'event' })
	// 事务
	useDbResourceEvent($db.Transaction, { type: 'transaction' })
	// 导航节点
	useDbResourceEvent($db.Navigation, { type: 'navigation' })
	// 设备
	// useDbResourceEvent($db.Device, { type: 'devices', pk: 'sn' })
	/** 定时检查 */
	// 启动定时器，检查告警、事务超时
	// 导致问题：间隔时间即无法检查时间，原本5分钟过期的告警，可能到5分20s才过期，5分15秒人为点击处理则会被算成不是过期，不过这是小问题，不解决，间隔时间别定的太大即可
	function checkEventTimeout(time = 20 * 1000) {
		const check = async () => {
			// 每次都是读取最新的配置
			const { alarmTimeout, callTimeout } = $settings.get(CALL_SETTINGS)

			// 查询出所有超时的告警，即触发时间与当前时间的差值大于超时时间
			if (alarmTimeout > 0) {
				try {
					const alarms = await $db.sequelize.query(
						`SELECT id, tid, type, result, \`group\`, code, triggerTime, CAST (( JulianDay('now') - JulianDay(triggerTime)) * 24 * 60 * 60 * 1000 AS Integer ) AS takeTime
            FROM Events WHERE type = 'alarm' AND takeTime > ${alarmTimeout} AND result < ${TRANSACTION_RESULT.COMPLETED}`,
						{ type: QueryTypes.SELECT }
					)
					// 告警超时
					alarms.forEach(async item => {
						try {
							// 系统处理，处理类型超时，所以就没有备注了
							// w900对于告警处理的逻辑：只要是服务端处理的告警就不发出1005/1006事件，而是监听1005/1006事件处理告警（这样设备端可以不用访问api的形式处理告警）
							await handleEntityAlarm(item, { result: TRANSACTION_RESULT.TIMEOUT, remarks: '' })
						} catch (error) {
							// 处理失败
							logger.error(`[checkEventTimeout]: handleEntityAlarm error: ${error.message}`)
						}
					})
					// 遍历发出事件
				} catch (error) {
					logger.error(`[checkEventTimeout]: sql error: ${error.message}`)
				}
			}

			// 处理事务超时
			if (callTimeout > 0) {
				try {
					const transactions = await $db.sequelize.query(
						`SELECT id, type, result, \`group\`, path, code, \`originalPayload\`, CAST (( JulianDay('now') - JulianDay(startTime)) * 24 * 60 * 60 * 1000 AS Integer ) AS takeTime
            FROM Transactions WHERE takeTime > ${callTimeout} AND result < ${TRANSACTION_RESULT.COMPLETED}`,
						{ type: QueryTypes.SELECT }
					)
					// 告警超时
					transactions.forEach(async item => {
						try {
							await handleEntityTransaction(item, {
								result: TRANSACTION_RESULT.TIMEOUT,
								progress: 100,
								remarks: '',
								message: 'timeout',
								handler: { sn: SERVER_SN, title: $userConfig.projectTitle, type: SERVER_SN }
							})
						} catch (error) {
							// 处理失败
							logger.error(`[checkEventTimeout]: handleEntityTransaction error: ${error.message}`)
						}
					})
					// 遍历发出事件
				} catch (error) {
					logger.error(`[checkEventTimeout]: sql error: ${error.message}`)
				}
			}

			// 查询出所有超时的通知音频包,即创建时间与当前时间的差值大于30分钟
			try {
				const notificationTimeout = 30 * 60 * 1000 // ms
				const notificationAudio = await $db.sequelize.query(
					`SELECT id, url, callerSn, status, createdAt, CAST (( JulianDay('now') - JulianDay(createdAt)) * 24 * 60 * 60 * 1000 AS Integer ) AS takeTime
          FROM TtsAudios WHERE callerSn = null AND takeTime > ${notificationTimeout}`,
					{ type: QueryTypes.SELECT }
				)
				// 音频包超时
				notificationAudio.forEach(async item => {
					try {
						//删除文件, 删除记录
						await $db.TtsAudio.destroy({
							where: { id: item.id },
							individualHooks: true
						})
					} catch (error) {
						// 处理失败
						logger.error(`[checkNotificationTimeout]: notificationAudio error: ${error.message}`)
					}
				})
				// 遍历发出事件
			} catch (error) {
				logger.error(`[checkNotificationTimeout]: sql error: ${error.message}`)
			}
		}
		// 立即执行
		check()
		return setInterval(check, time)
	}
	// 执行
	checkEventTimeout()

	// 最终返回messager
	return $messager
}

/**
 * 转化按键映射
 * @param {*} keymap
 * @param {*} key
 * @returns
 */
function parseKeymap(keymap, key) {
	const { value = {} } = keymap
	return value[key] || {}
}

/**
 * 解析topic
 * @param {*} topic
 * @returns
 */
function parseTopic(topic = '') {
	// 目前只需要用到domain
	const strs = topic.split('/').filter(item => item.trim())
	return {
		domain: strs[1],
		rs: strs[2] === 'rs' // 是否是资源变更事件
	}
}

/**
 * 是否是合法的设备IO消息
 * 判断是否包含按键key
 * @param {*} message
 * @returns
 */
function isValidIOMessage(message) {
	const { payload = {} } = message
	return !!payload.key && payload.key !== '0'
}

/**
 * 使用数据库
 * @param {*} $db
 * @returns
 */
function useDatabase($db) {
	// 缓存生命时间，1个小时；根据sn找设备、根据id找映射
	const CACHE_LIFE = 60 * 60 * 1000
	// 定时刷新整棵树
	const REFRESH_TREE_NODE = 60 * 1000

	/** 数据库查询缓存 */
	/* 根据sn获取设备 */
	const findDevice = async sn => {
		try {
			const device = await $db.Device.findByPk(sn)
			if (device) {
				return device.toJSON()
			} else {
				return null
			}
		} catch (error) {
			return null
		}
	}
	// const findDevice = useCache(
	// 	async sn => {
	// 		try {
	// 			const device = await $db.Device.findByPk(sn)
	// 			if (device) {
	// 				return device.toJSON()
	// 			} else {
	// 				return null
	// 			}
	// 		} catch (error) {
	// 			return null
	// 		}
	// 	},
	// 	{
	// 		life: CACHE_LIFE, // 缓存生命时间，1个小时
	// 		onUpdate: set => {
	// 			// 外部剔除或更新池
	// 			// 设备删除时剔除缓存中的设备
	// 			$db.Device.addHook('afterDestroy', (device, options) => {
	// 				// set(id, value)
	// 				set(device.sn, null)
	// 			})
	// 		}
	// 	}
	// )
	// 批量获取设备
	const findDevices = sns => {
		return Promise.all(sns.map(findDevice))
	}
	/** 根据id获取按键映射 */
	const findKeyMap = useCache(
		async id => {
			try {
				const keymap = await $db.KeyMap.findByPk(id)
				if (keymap) {
					return keymap.toJSON()
				} else {
					return null
				}
			} catch (error) {
				return null
			}
		},
		{
			life: CACHE_LIFE, // 缓存生命时间，1个小时
			onUpdate: set => {
				$db.KeyMap.addHook('afterDestroy', (keymap, options) => {
					set(keymap.id, null)
				})
				$db.KeyMap.addHook('afterUpdate', (keymap, options) => {
					set(keymap.id, keymap.toJSON())
				})
			}
		}
	)
	/** 根据sn获取节点, 无法根据数据库hooks维护缓存的正确性，或者很难，代价高；其次是这是整个消息转换的起始，错了就麻烦了；所以干脆直接查询 */
	async function findNodeBySn(sn) {
		let node = await $db.Navigation.findOne({ where: { device: sn } })
		if (!node) {
			// 从关联资源上找设备
			node = await $db.sequelize.query(
				`SELECT Navigations.id, related FROM Navigations, json_each(Navigations.related) WHERE json_valid(Navigations.related) AND json_extract(json_each.value, '$.id') = '${sn}'`,
				{
					type: QueryTypes.SELECT
				}
			)
		}
		if (node.length) {
			node = await $db.Navigation.findOne({ where: { id: node[0].id } })
		}
		if (node) {
			try {
				node = node.toJSON()
				return node
			} catch (e) {
				return null
			}
		}
		return null
	}

	// 根据节点id获取节点【放弃】
	// 树节点映射
	let treeNodes = {}
	// 加载整棵树
	async function loadNodes() {
		const nodes = {}
		const allNodes = await $db.Navigation.findAll()
		allNodes.forEach(node => {
			nodes[node.id] = node.toJSON()
		})
		return nodes
	}
	// 加载
	loadNodes().then(nodes => {
		treeNodes = nodes
	})
	// 定时刷新树
	setInterval(async () => {
		treeNodes = await loadNodes()
	}, REFRESH_TREE_NODE)

	// 树节点更新机制
	// 节点删除
	$db.Navigation.addHook('afterDestroy', (node, options) => {
		delete treeNodes[node.id]
	})
	// 节点更新
	$db.Navigation.addHook('afterUpdate', (node, options) => {
		treeNodes[node.id] = node.toJSON()
	})
	// 节点创建
	$db.Navigation.addHook('afterCreate', (node, options) => {
		treeNodes[node.id] = node.toJSON()
	})
	/** 根据节点查找整个路径 */
	// 返回： [当前节点, 父, 爷, 祖父, ...]
	function findPathNodes(id, path = []) {
		const node = id ? treeNodes[id] : null
		if (node) {
			path.push(node)
			return findPathNodes(node.pid, path)
		} else {
			return path
		}
	}
	/** 通过路径获取按键映射 */
	async function findKeyMapByPath(nodes = []) {
		if (!nodes || !nodes.length) {
			return null
		}
		let keyMapId = ''
		const node = nodes.find(item => {
			const { related = [] } = item
			return related.some(i => i.type === RES_TYPE_KEYMAP)
		})

		// 搭配上述findPathNodes返回  [当前节点, 父, 爷, 祖父, ...]
		// find就是返回第一个发现的节点，也就是就近选择匹配的按键映射
		if (node) {
			const got = node.related.find(i => i.type === RES_TYPE_KEYMAP)
			keyMapId = got ? got.id : ''
		}

		if (keyMapId) {
			return findKeyMap(keyMapId)
		} else {
			return null
		}
	}

	return {
		findDevice,
		findDevices,
		findNodeBySn,
		findPathNodes,
		findKeyMapByPath
	}
}

function getActionAnswer(sid) {
	const res = actions[sid]
	delete actions[sid]
	return res
}

function _takeARest(timeout) {
	return new Promise(r => setTimeout(r, timeout || 1000))
}
