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

// Verificar cantidad de dispositivos permitidos
async function assertDeviceNumbers(toAdd = 1) {
	const { result = {} } = $licenseValidResult || {}
	if (result.deviceNumbers < 0) {
		// Dispositivos ilimitados
	} else if (result.deviceNumbers >= 0) {
		const count = (await $db.Device.count()) + toAdd
		// Límite de dispositivos
		if (count > result.deviceNumbers) {
			throw $APIError.Forbidden('error.device_number_maximum')
		}
	} else {
		// Licencia inválida (la licencia inválida lanzará un error en el middleware, no llegará aquí, esto es solo por completitud)
		throw $APIError.Forbidden('error.device_number_maximum')
	}
}

// Obtener atributos según el tipo de dispositivo
function setAttrs(device) {
	// Atributos personalizados
	if (DEVICE_ATTRS[device.type]) {
		// Establecer atributos predeterminados de pantalla LCD
		device.attrs = DEVICE_ATTRS[device.type]
	}
	return device
}

/**
 * Explicación de la elección técnica
 * Autenticación de dispositivos: configuración de multidifusión
 * Edición/Adición manual de dispositivos: configuración de multidifusión
 * Se usa multidifusión en lugar de "configuración de atributos MQTT" porque es más estable y confiable
 * Con MQTT no podemos garantizar que el dispositivo lo implemente
 */

// Cargar
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

// Obtener dispositivo
exports.get = (req, res) => res.json(req.locals.device)

// Crear nuevo
// Combinado con control de permisos $licenseValidResult
exports.create = async (req, res, next) => {
	try {
		// Verificar cantidad de dispositivos
		await assertDeviceNumbers()

		let device = req.body
		try {
			device = setAttrs(device)
			device = (await $db.Device.create(req.body)).toJSON()
			// Configuración de multidifusión
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

// Editar
exports.update = async (req, res, next) => {
	const { device } = req.locals
	const { sn } = device
	if (req.body.attrs?.logger?.server) {
		// Enviar evento de cambio de atributos
		const payload = { logger: req.body.attrs.logger }
		$messager.postAttrs(
			{ to: device.sn, sid: true, domain: device.mqtt.domain || $userConfig.domain }, // El dominio es opcional porque este proyecto usa un solo dominio
			payload
		)
	}
	const data = mergeDeepRight(device, req.body)
	try {
		// Actualizar base de datos
		await $db.Device.update(data, { where: { sn } })
		// Consultar resultado
		const newDevice = (await $db.Device.findByPk(sn)).toJSON()
		// Configuración de multidifusión
		await updateByMC(device, newDevice)
		// Retornar
		return res.json(newDevice)
	} catch (error) {
		return next(error)
	}
}

// Eliminar dispositivo
exports.remove = async (req, res, next) => {
	const { device } = req.locals
	const { sn } = device
	try {
		// Desvincular dispositivos asociados
		// Buscar si el dispositivo está vinculado en los recursos asociados
		let lastNode = await $db.sequelize.query(
			`SELECT Navigations.id, related FROM Navigations, json_each(Navigations.related) WHERE json_valid(Navigations.related) AND json_extract(json_each.value, '$.id') = '${id}'`,
			{
				type: QueryTypes.SELECT
			}
		)
		if (lastNode.length) {
			lastNode = lastNode[0]
			// Desvincular
			let related = JSON.parse(lastNode.related).filter(item => item.id !== sn)
			await $db.Navigation.update({ related }, { where: { id: lastNode.id }, individualHooks: true })
		}
		// Primero eliminar el registro de la base de datos
		await $db.Device.destroy({
			where: { sn },
			individualHooks: true
		})
		return res.json(device)
	} catch (error) {
		return next(error)
	}
}

// Eliminar múltiples dispositivos
exports.removeList = async (req, res, next) => {
	const { ids = [] } = req.body
	try {
		// Desvincular dispositivos asociados
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
				// Desvincular
				let related = JSON.parse(lastNode.related).filter(item => indexOf(ids, item.id) == -1)
				await $db.Navigation.update({ related }, { where: { id: lastNode.id }, individualHooks: true })
			})
		}
		// Eliminar archivo de certificado
		// ids.map(sn => {
		// 	if ($devicesWatcher[sn]) {
		// 		$devicesWatcher[sn].stop()
		// 	}
		// 	if (fs.existsSync(path.join(licensePath, sn + '.license'))) {
		// 		fs.removeSync(path.join(licensePath, sn + '.license'))
		// 	}
		// })

		// Eliminar registro de la base de datos
		let rows = 0
		try {
			rows = await $db.Device.destroy({
				where: { sn: { [Op.in]: ids } },
				individualHooks: true // Normalmente, métodos como bulkCreate no activarán hooks individuales - solo hooks en lote. Sin embargo, si deseas activar hooks individuales, puedes configurar individualHooks=true
			})
		} catch (e) {
			// Si la eliminación falla, es debido a restricciones de clave foránea
			await $db.Navigation.update({ device: null }, { where: { device: { [Op.in]: ids } }, individualHooks: true })
			await $db.sequelize.query('PRAGMA foreign_keys = OFF')
			rows = await $db.Device.destroy({
				where: { sn: { [Op.in]: ids } },
				individualHooks: true // Normalmente, métodos como bulkCreate no activarán hooks individuales - solo hooks en lote. Sin embargo, si deseas activar hooks individuales, puedes configurar individualHooks=true
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

// Obtener lista de dispositivos
exports.list = async (req, res, next) => {
	try {
		let { limit, offset, ...query } = req.query
		// Consulta personalizada para parámetros especiales
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

// Ejecutar acción
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

// Configuración de atributos
exports.attrs = async (req, res, next) => {
	try {
		const { device } = req.locals
		const payload = { ...req.body }
		$messager.postAttrs(
			{ to: device.sn, sid: true, domain: device.mqtt.domain || $userConfig.domain }, // El dominio es opcional porque este proyecto usa un solo dominio
			payload
		)
		return res.json({ device, payload })
	} catch (error) {
		return next(error)
	}
}

// Actualización
// La actualización también es un tipo de acción
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
			// Como el dispositivo no envía la respuesta al tema correspondiente según lo convencional, asumimos que todas las actualizaciones son exitosas por defecto
			// TODO: 升级失败只能通过mqtt.fx调试得出
			// Solo puedo decir que es culpa del dispositivo, no mía. No puedo obtener respuesta del dispositivo, la espera por tiempo límite es muy larga, y como no siguen el estándar, no voy a complacerlos
			const sid = $messager._sid
			$messager.postAction(
				{ to: device.sn, sid: true, domain: device.mqtt.domain || $userConfig.domain }, // El dominio es opcional porque este proyecto usa un solo dominio
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

// Autenticación de dispositivos
// No se puede hacer en lote, se autentica uno por uno y se actualiza la base de datos
const getWorkID = genWorkerID()
exports.authorize = async (req, res, next) => {
	try {
		const success = [],
			failed = []
		let { devices } = req.body
		devices = uniqBy(devices, 'sn')

		// Verificar cantidad de dispositivos
		await assertDeviceNumbers(devices.length)

		const devicesMap = {}
		// Manejar problema de dispositivos padre-hijo
		devices.forEach(device => {
			if (device.parent) {
				// Tiene dispositivo padre
				let parent = $discoverService.cache[device.parent]
				if (!parent) {
					// No se encuentra el dispositivo padre
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
				// Sin dispositivo padre
				// Y el dispositivo actual no ha sido obtenido
				// Posible escenario: autenticación masiva desde el frontend, selección de autenticación simultánea padre-hijo, [hijo, padre], entonces entra en el ciclo, procesa primero el dispositivo hijo, el código anterior agregará automáticamente el dispositivo padre, así que aquí no es necesario agregarlo
				if (!devicesMap[device.sn]) {
					devicesMap[device.sn] = device
				}
			}
		})

		// Procesar dispositivos
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
				// Almacenamiento en base de datos, primero almacenar dispositivos hijo
				if (device.children) {
					for (let j = 0; j < device.children.length; j++) {
						const sub = device.children[j]
						try {
							let title = sub.sn
							// mergeData(sub, { title: sub.sn })
							// await $db.Device.upsert(sub) // Con este método, si el dispositivo ya existe, el título será modificado
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
				// Procesar este dispositivo
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

/** Relacionado con multidifusión */
// Configurar MQTT mediante multidifusión
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

// Configurar red mediante multidifusión
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

// Configurar WiFi mediante multidifusión
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

// Configurar ubicación mediante multidifusión
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

// Actualizar dispositivo mediante multidifusión
async function updateByMC(oldDevice = {}, newDevice = {}, setNetworks = true) {
	// Comparación profunda de MQTT
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

	// Finalmente actualizar la red
	if (setNetworks) {
		if (!isEqual(newDevice.networks, oldDevice.networks)) {
			await updateNetworksByMC(oldDevice, newDevice)
		}
	}
	// Temporalmente manejamos la modificación del título aquí, debería usar un hook, pero aún no he descubierto cómo hacerlo
	if (!isEqual(newDevice.title, oldDevice.title)) {
		$messager.postAttrs(
			{ to: newDevice.sn, sid: true, domain: newDevice.mqtt.domain || $userConfig.domain }, // El dominio es opcional porque este proyecto usa un solo dominio
			{ title: newDevice.title }
		)
	}
}

// Configuración mediante multidifusión
async function setByMC(device, cmd, payload = {}) {
	const { sn, source, networks = [], type } = device
	const ip = networks[0].ip
	if (!ip) {
		throw new $APIError.BadRequest('error.device_no_response')
	}

	// Configuración de multidifusión
	try {
		const data = {
			sn,
			source: source || 'MULTICAST', // Llevar tal cual desde el dispositivo descubierto
			targetIP: ip, // Cuando el objetivo de configuración es una dirección IP, debe llevar esta información
			cmd, // Ver protocolo
			payload
		}
		// Resolver el problema de que la adición manual del reloj lora se queda atascada durante mucho tiempo en el descubrimiento de dispositivos
		if (type !== 'lora_watch') {
			await $discoverService.configDiscovered(data)
		}
	} catch (error) {
		logger.error(sn, error.message)
		throw new $APIError.BadRequest('error.device_no_response')
	}
}

/** Métodos de utilidad */
// Agregar datos al dispositivo
function mergeDataToDevice(data = {}) {
	return (...devices) => Object.assign(...devices, data)
}

// Obtener ID de trabajador
function genWorkerID() {
	let workerID = 0
	return () => workerID++ % 1024
}
