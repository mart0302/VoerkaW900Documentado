const { DEVICE_ATTRS } = requireConfig('constant')
const logger = requireConfig('logger')
const { uniqBy, cloneDeep, isEqual, indexOf } = require('lodash')
const { Op, QueryTypes } = require('sequelize')
const path = require('path')
const fs = require('fs-extra')
const httpStatus = require('http-status')
const { mergeDeepRight } = require('../utils')
const { upload: uploadConfig } = requireConfig('vars')
const { license: licenseConfig } = uploadConfig
const { destination } = licenseConfig
const licensePath = appPath.resolve.data(destination)
const { USE_DEVICE } = require('../../config/constant')

async function assertDeviceNumbers(toAdd = 1) {
	const { result = {} } = $licenseValidResult || {}
	if (result.deviceNumbers < 0) {
		// 设备无限量
	} else if (result.deviceNumbers >= 0) {
		const count = (await $db.Device.count()) + toAdd
		// 设备限量
		if (count > result.deviceNumbers) {
			throw $APIError.Forbidden('error.device_number_maximum')
		}
	} else {
		// 证书无效（证书无效会在中间件中直接抛错，不会进来这里，此处只是顺便一写）
		throw $APIError.Forbidden('error.device_number_maximum')
	}
}

// 根据设备类型获取attrs
function setAttrs(device) {
	// 个性化属性
	if (DEVICE_ATTRS[device.type]) {
		// 设置lcd屏默认属性
		device.attrs = DEVICE_ATTRS[device.type]
	}
	return device
}

/**
 * 技术选用说明
 * 设备认证：组播设置
 * 设备编辑\手动添加：组播设置，之所以不用“mqtt属性设置”，是因为组播设置相对比较稳定可行，如果是mqtt保不齐设备又没实现
 */

// 加载
exports.load = async (req, res, next, id) => {
	try {
		id = id.toLowerCase()
		const device = await $db.Device.findByPk(id)
		if (!device) {
			throw $APIError.NotFound()
		}
		req.locals = { device: device.toJSON() }
		return next()
	} catch (error) {
		return next(error)
	}
}

// 获取设备
exports.get = (req, res) => res.json(req.locals.device)

// 新增
// 结合权限控制 $licenseValidResult
exports.create = async (req, res, next) => {
	try {
		// 检查设备数量
		await assertDeviceNumbers()

		let device = req.body
		try {
			device = setAttrs(device)
			device = (await $db.Device.create(req.body)).toJSON()
			// 组播设置
			if (device.model !== USE_DEVICE) await updateByMC({}, device, false)
		} catch (error) {
			// 409
			throw $APIError.Conflict()
		}
		res.status(httpStatus.CREATED)
		return res.json(device)
	} catch (error) {
		return next(error)
	}
}

// 编辑
exports.update = async (req, res, next) => {
	const { device } = req.locals
	const { sn } = device
	if (req.body.attrs?.logger?.server) {
		// 发送属性变更事件
		const payload = { logger: req.body.attrs.logger }
		$messager.postAttrs(
			{ to: device.sn, sid: true, domain: device.mqtt.domain || $userConfig.domain }, // domain可加可不加，因为此项目是单domain的
			payload
		)
	}
	const data = mergeDeepRight(device, req.body)
	try {
		// 更新数据库
		await $db.Device.update(data, { where: { sn } })
		// 查询结果
		const newDevice = (await $db.Device.findByPk(sn)).toJSON()
		// 组播设置
		await updateByMC(device, newDevice)
		// 返回
		return res.json(newDevice)
	} catch (error) {
		return next(error)
	}
}

// 删除设备
exports.remove = async (req, res, next) => {
	const { device } = req.locals
	const { sn } = device
	try {
		// 解绑关联设备
		// 从关联资源上查找是否绑定该设备
		let lastNode = await $db.sequelize.query(
			`SELECT Navigations.id, related FROM Navigations, json_each(Navigations.related) WHERE json_valid(Navigations.related) AND json_extract(json_each.value, '$.id') = '${id}'`,
			{
				type: QueryTypes.SELECT
			}
		)
		if (lastNode.length) {
			lastNode = lastNode[0]
			// 解绑
			let related = JSON.parse(lastNode.related).filter(item => item.id !== sn)
			await $db.Navigation.update({ related }, { where: { id: lastNode.id }, individualHooks: true })
		}
		// 先删除数据库记录
		await $db.Device.destroy({
			where: { sn },
			individualHooks: true
		})
		return res.json(device)
	} catch (error) {
		return next(error)
	}
}

// 批量删除设备
exports.removeList = async (req, res, next) => {
	const { ids = [] } = req.body
	try {
		// 解绑关联设备
		let sns = ids.map(id => `'${id}'`)
		sns = sns.join(',')
		let lastNodes = await $db.sequelize.query(
			`SELECT Navigations.id, related FROM Navigations, json_each(Navigations.related) WHERE json_valid(Navigations.related) AND json_extract(json_each.value, '$.id') in (${sns})`,
			{
				type: QueryTypes.SELECT
			}
		)
		if (lastNodes.length) {
			lastNodes.map(async lastNode => {
				// 解绑
				let related = JSON.parse(lastNode.related).filter(item => indexOf(ids, item.id) == -1)
				await $db.Navigation.update({ related }, { where: { id: lastNode.id }, individualHooks: true })
			})
		}
		// 删除证书文件
		// ids.map(sn => {
		// 	if ($devicesWatcher[sn]) {
		// 		$devicesWatcher[sn].stop()
		// 	}
		// 	if (fs.existsSync(path.join(licensePath, sn + '.license'))) {
		// 		fs.removeSync(path.join(licensePath, sn + '.license'))
		// 	}
		// })

		// 删除数据库记录
		let rows = 0
		try {
			rows = await $db.Device.destroy({
				where: { sn: { [Op.in]: ids } },
				individualHooks: true // 认情况下,类似 bulkCreate 的方法不会触发单独的 hook - 仅批量 hook. 但是,如果你还希望触发单个 hook, 可以配置individualHooks=true
			})
		} catch (e) {
			// 如果删除失败，外键约束导致
			await $db.Navigation.update({ device: null }, { where: { device: { [Op.in]: ids } }, individualHooks: true })
			await $db.sequelize.query('PRAGMA foreign_keys = OFF')
			rows = await $db.Device.destroy({
				where: { sn: { [Op.in]: ids } },
				individualHooks: true // 认情况下,类似 bulkCreate 的方法不会触发单独的 hook - 仅批量 hook. 但是,如果你还希望触发单个 hook, 可以配置individualHooks=true
			})
			await $db.sequelize.query('PRAGMA foreign_keys = ON')
		}
		return res.json({
			rows
		})
	} catch (error) {
		return next(error)
	}
}

// 获取设备列表
exports.list = async (req, res, next) => {
	try {
		let { limit, offset, ...query } = req.query
		//  特别参数的定制查询
		const qry = {}
		query.sn && (qry.sn = { [Op.eq]: query.sn })
		query.type && (qry.type = { [Op.eq]: query.type })
		query.model && (qry.model = { [Op.eq]: query.model })
		if ('online' in query) {
			qry.online = { [Op.eq]: query.online }
		}
		query.title && (qry.title = { [Op.like]: `%${query.title}%` })

		const { count: total, rows: data } = await $db.Device.findAndCountAll({
			limit,
			offset,
			where: qry,
			order: [['updatedAt', 'DESC']]
		})

		return res.json({
			limit,
			offset,
			total,
			data
		})
	} catch (error) {
		return next(error)
	}
}

// 执行动作
exports.execute = async (req, res, next) => {
	try {
		const { device } = req.locals
		const { action } = req.params
		if (!action || typeof action !== 'string') {
			throw $APIError.BadRequest('error.action_error')
		}
		const payload = { action, ...req.body }
		const sid = $messager._sid
		$messager.postAction({ to: device.sn, sid: true, domain: device.mqtt.domain || $userConfig.domain }, payload)
		await $messager._takeARest()
		const result = $messager.getActionAnswer(sid)
		if (!result) {
			return res.json({
				code: 200,
				device,
				status: 'failed',
				message: 'error.device_no_response',
				payload: {
					idFailed: device.sn
				}
			})
		}

		return res.json({ code: 200, status: 'successed', device, payload })
	} catch (error) {
		return next(error)
	}
}

// 属性配置
exports.attrs = async (req, res, next) => {
	try {
		const { device } = req.locals
		const payload = { ...req.body }
		$messager.postAttrs(
			{ to: device.sn, sid: true, domain: device.mqtt.domain || $userConfig.domain }, // domain可加可不加，因为此项目是单domain的
			payload
		)
		return res.json({ device, payload })
	} catch (error) {
		return next(error)
	}
}

// 升级
// 升级其实也是一种动作
exports.upgrade = async (req, res, next) => {
	try {
		const { devices = [], package } = req.body
		let pkg = await $db.Package.findByPk(package)
		if (!pkg) {
			throw $APIError.NotFound('error.package_no_found')
		}
		pkg = pkg.toJSON()
		const devs = await $db.Device.findAll({
			where: { sn: { [Op.in]: devices } }
		})
		let idFailed = []
		let result = 'successed'
		for (let index = 0; index < devs.length; index++) {
			const device = devs[index]
			// 由于设备不按常规将应答发送到对应的主题上，所以默认全部升级成功
			// TODO: 升级失败只能通过mqtt.fx调试得出
			// 只能说这是设备的锅不是我的锅，我这边得不到设备的响应，超时等待又太长，他们不按标准来，我也不惯着他们
			const sid = $messager._sid
			$messager.postAction(
				{ to: device.sn, sid: true, domain: device.mqtt.domain || $userConfig.domain }, // domain可加可不加，因为此项目是单domain的
				{ action: 'upgrade', url: pkg.url }
			)
			await $messager._takeARest()
			const answerData = $messager.getActionAnswer(sid)
			if (!answerData) {
				result = 'failed'
				idFailed.push(device.sn)
			}
		}
		if (result === 'failed') {
			return res.json({
				code: 200,
				status: 'failed',
				message: 'error.device_no_response',
				idFailed
			})
		}
		return res.json({ code: 200, status: 'successed', success: devs.map(item => item.sn) })
	} catch (error) {
		return next(error)
	}
}

// 设备认证
// 做不了批量，一个个进行设备认证，认证完毕更新数据库
const getWorkID = genWorkerID()
exports.authorize = async (req, res, next) => {
	try {
		const success = [],
			failed = []
		let { devices } = req.body
		devices = uniqBy(devices, 'sn')

		// 检查设备数量
		await assertDeviceNumbers(devices.length)

		const devicesMap = {}
		// 处理父子设备问题
		devices.forEach(device => {
			if (device.parent) {
				// 有父设备
				let parent = $discoverService.cache[device.parent]
				if (!parent) {
					// 找不到父设备
					logger.error(`${device.sn} cannot find parent: ${device.parent}`)
					failed.push(device.sn)
				} else {
					if (devicesMap[parent.sn]) {
						parent = devicesMap[parent.sn]
					} else {
						parent = cloneDeep(parent)
						parent.children = []
					}
					parent.children.push(device)
					devicesMap[parent.sn] = parent
				}
			} else {
				// 无父设备
				// 且当前未获取设备；
				// 可能情况：前端批量认证设备，选择父子同时认证，[子，父]，则进入循环，先处理子设备，上述代码会自动添加父设备，此处就无需再添加了
				if (!devicesMap[device.sn]) {
					devicesMap[device.sn] = device
				}
			}
		})

		// 处理设备
		devices = Object.values(devicesMap)
		for (let index = 0; index < devices.length; index++) {
			const device = setAttrs(devices[index])
			try {
				const mqtt = await updateMqttByMC(device)
				const mergeData = mergeDataToDevice({
					mqtt,
					workerID: getWorkID(),
					online: false
				})
				// 数据库存储，先存储子设备
				if (device.children) {
					for (let j = 0; j < device.children.length; j++) {
						const sub = device.children[j]
						try {
							let title = sub.sn
							// mergeData(sub, { title: sub.sn })
							// await $db.Device.upsert(sub) // 用这种方法，如果该设备已经存在，title会被修改
							const oldDevice = await $db.Device.findByPk(sub.sn)
							if (oldDevice) {
								title = oldDevice.dataValues.title
							}
							mergeData(sub, { title })
							await $db.Device.upsert(sub)
							success.push(sub.sn)
						} catch (error) {
							failed.push(sub.sn)
						}
					}
				}
				let title = device.sn
				const oldDevice = await $db.Device.findByPk(device.sn)
				if (oldDevice) {
					title = oldDevice.dataValues.title
				}
				mergeData(device, { title })
				await $db.Device.upsert(device)
				// 处理本设备
				// mergeData(device, { title: device.sn })
				// await $db.Device.upsert(device)
				success.push(device.sn)
			} catch (error) {
				failed.push(device.sn)
			}
		}
		return res.json({ success, failed })
	} catch (error) {
		return next(error)
	}
}

/** 组播相关 */
// 通过组播设置mqtt
// Cmd==1
async function updateMqttByMC(device, mqtt) {
	if (!mqtt) {
		const { host, domain, mqttPort = 1883, mqttUsername = '', mqttPassword = '' } = $userConfig
		const port = device?.mqtt?.broker == 'ws://' ? 8083 + '/mqtt' : mqttPort
		const broker = device?.mqtt?.broker == 'ws://' ? `ws://${host}:${port}` : `${host}:${port}` // 'ws://192.168.111.126:8083/mqtt'
		mqtt = { broker, domain, username: mqttUsername, password: mqttPassword }
	}
	await setByMC(device, 1, {
		Domain: mqtt.domain,
		MQTT: mqtt.broker,
		MQTT_Username: mqtt.username,
		MQTT_Password: mqtt.password
	})
	return mqtt
}

// 通过组播设置网络
// Cmd==2
async function updateNetworksByMC(oldDevice, newDevice) {
	await setByMC(oldDevice, 2, {
		Networks: newDevice.networks.map(item => {
			const { dhcp, dnsAlter, dnsPrefer, gateway, ip, interface, mac, subnetMask } = item
			return {
				Interface: interface,
				DHCP: dhcp,
				IP: ip,
				SubnetMask: subnetMask,
				Gateway: gateway,
				DNS_prefer: dnsPrefer,
				DNS_alter: dnsAlter,
				MAC: mac
			}
		})
	})
}

// 通过组播设置wifi
// Cmd==3
async function updateWifiByMC(device) {
	const { wifi = {} } = device
	const { ap = '', enable, password, secret } = wifi
	await setByMC(device, 3, {
		WIFI_AP: ap,
		WIFI_Enable: enable ? 1 : 0,
		WIFI_Password: password,
		WIFI_Secret: secret
	})
}

// 通过组播设置安装位置
// Cmd==4
async function updateLocationByMC(device) {
	const { location = {} } = device
	const { label = '', long, lati } = location
	await setByMC(device, 4, {
		Location: label,
		Long: long,
		Lati: lati
	})
}

// 通过组播更新设备
async function updateByMC(oldDevice = {}, newDevice = {}, setNetworks = true) {
	// 深度比较mqtt
	if (!isEqual(newDevice.mqtt, oldDevice.mqtt)) {
		await updateMqttByMC(newDevice, newDevice.mqtt)
	}

	// wifi
	if (!isEqual(newDevice.wifi, oldDevice.wifi)) {
		await updateWifiByMC(newDevice)
	}

	// location
	if (!isEqual(newDevice.location, oldDevice.location)) {
		await updateLocationByMC(newDevice)
	}

	// 最后更新网络
	if (setNetworks) {
		if (!isEqual(newDevice.networks, oldDevice.networks)) {
			await updateNetworksByMC(oldDevice, newDevice)
		}
	}
	// 暂时在这处理修改title，本应该使用hook，但是目前还没搞明白怎么弄
	if (!isEqual(newDevice.title, oldDevice.title)) {
		$messager.postAttrs(
			{ to: newDevice.sn, sid: true, domain: newDevice.mqtt.domain || $userConfig.domain }, // domain可加可不加，因为此项目是单domain的
			{ title: newDevice.title }
		)
	}
}

// 通过组播设置
async function setByMC(device, cmd, payload = {}) {
	const { sn, source, networks = [], type } = device
	const ip = networks[0].ip
	if (!ip) {
		throw new $APIError.BadRequest('error.device_no_response')
	}

	// 组播设置
	try {
		const data = {
			sn,
			source: source || 'MULTICAST', // 从被发现设备上原样携带
			targetIP: ip, // 当配置目标是 ip 地址时应携带此信息
			cmd, // 见协议
			payload
		}
		// 解决手动添加lora手表因设备发现卡很久问题
		if (type !== 'lora_watch') {
			await $discoverService.configDiscovered(data)
		}
	} catch (error) {
		logger.error(sn, error.message)
		throw new $APIError.BadRequest('error.device_no_response')
	}
}

/** 工具方法 */
// 添加数据给设备
function mergeDataToDevice(data = {}) {
	return (...devices) => Object.assign(...devices, data)
}

// 获取workerID
function genWorkerID() {
	let workerID = 0
	return () => workerID++ % 1024
}
