const { uniq } = require('lodash')
const { Op, QueryTypes } = require('sequelize')
const httpStatus = require('http-status')
const { INTERCOM_PUSH_TYPE } = requireConfig('constant')
const { mergeDeepRight, parseTimeQuyer } = require('../utils')
const { encodeMessage } = require('../../../utils.js')
const { upload: uploadConfig } = requireConfig('vars')
const { tts: ttsConfig } = uploadConfig
const { destination } = ttsConfig
const ttsPath = appPath.resolve.data(destination)

const Model = $db.Notification
// Tiempo de envío
let gaptime = {}
let id = 0
async function addMessage({ message, domain, msgId, devices = [], unicastAddr } = {}) {
	// Ejecutar acción
	$log.info('【notification】 lorawatch addMessage+++++++++++++', message, domain, msgId, devices)
	let result = true
	let idFailed = []
	let numExecuted = 0
	let numFailed = 0
	const lan = await $db.Setting.findByPk('current_language')
	for (let i = 0; i < devices.length; i++) {
		let device = devices[i]
		const { sn } = device
		// Intervalo de tiempo
		let timestamp = gaptime[sn] ? new Date().getTime() - gaptime[sn] : 0
		if (gaptime[sn] && timestamp < 4 * 1000) {
			await $messager._takeARest(4 * 1000)
		}
		$log.info('【notification】postAction: ', sn)
		gaptime[sn] = new Date().getTime()
		const sid = $messager._sid
		$messager.postAction(
			{
				to: sn,
				sid: true,
				domain
			},
			{
				action: 'wireless_watch_transparent',
				message: encodeMessage({
					...device,
					sn,
					unicastAddr,
					msgId,
					messages: message,
					cmd: 'SEND_MESSAGE',
					lan
				})
			}
		)
		await $messager._takeARest()
		const answerData = $messager.getActionAnswer(sid)
		if (!answerData) {
			result = false
			idFailed.push(sn)
			numFailed = numFailed + 1
		} else {
			numExecuted = numExecuted + 1
		}
	}
	return {
		status: result ? 'successed' : 'failed',
		numExecuted,
		numFailed,
		idFailed
	}
}

// Buscar puertas de enlace de notificación
async function getGateways(resource) {
	let gateways = []
	let related = []
	// Buscar si existe el dispositivo en el dispositivo principal
	const sn = resource?.id || resource
	let lastNode = await $db.Navigation.findAll({ where: { device: sn } })
	if (lastNode.length) {
		// Buscar si hay una puerta de enlace en este nodo
		lastNode.map(n => {
			related = related.concat(n.related)
		})
	}
	// Buscar en recursos relacionados
	lastNode = await $db.sequelize.query(
		`SELECT Navigations.id, Navigations.device, related  FROM Navigations, json_each(Navigations.related) WHERE json_valid(Navigations.related) AND json_extract(json_each.value, '$.id') = '${sn}'`,
		{
			type: QueryTypes.SELECT
		}
	)
	if (lastNode.length) {
		// Buscar si hay una puerta de enlace en este nodo
		lastNode.map(n => {
			related = related.concat(JSON.parse(n.related))
			if (n.device) {
				// Verificar si este dispositivo principal es una puerta de enlace
				related.push(n.device)
			}
		})
	}
	// Buscar puertas de enlace
	for (let i = 0, len = related.length; i < len; i++) {
		let device = related[i]
		const pid = device.id || device
		let gateway = await $db.Device.findByPk(pid)
		if (gateway && gateway.type === 'nx1_wlcall_gateway') {
			const uniqGateway = gateways.filter(dev => dev.sn === gateway.sn)
			if (!uniqGateway.length) gateways.push(gateway)
		}
	}
	$log.info('【notification】getGateways gateways.length：', gateways.length)
	return gateways
}

// Cargar
exports.load = async (req, res, next, id) => {
	try {
		const data = await Model.findByPk(id)
		if (!data) {
			throw $APIError.NotFound()
		}
		req.locals = { data: data.toJSON() }
		return next()
	} catch (error) {
		return next(error)
	}
}

// Obtener
exports.get = async (req, res) => {
	try {
		const { data } = req.locals
		const detail = await Model.findByPk(data.id)
		res.json(detail)
	} catch (error) {
		return next(error)
	}
}

// Crear nuevo registro de notificación
exports.create = async (req, res, next) => {
	try {
		let data
		try {
			data = await Model.create(req.body)
		} catch (error) {
			// SQLITE_CONSTRAINT: FOREIGN KEY constraint failed
			// Error 404: clave foránea no encontrada, es decir, el dispositivo no existe
			throw $APIError.NotFound('error.device_not_found')
		}
		res.status(httpStatus.CREATED)
		return res.json(data)
	} catch (error) {
		return next(error)
	}
}

// Actualizar registro de notificación
exports.update = async (req, res, next) => {
	const { data } = req.locals
	const updateData = mergeDeepRight(data, req.body)
	try {
		// Actualizar base de datos
		await Model.update(updateData, { where: { id: data.id }, individualHooks: true })
		// Consultar resultado
		const newData = await Model.findByPk(data.id)
		// Retornar
		return res.json(newData)
	} catch (error) {
		return next(error)
	}
}

// Eliminar
exports.remove = async (req, res, next) => {
	const { data } = req.locals
	try {
		// Primero eliminar el registro de la base de datos
		await Model.destroy({
			where: { id: data.id },
			individualHooks: true
		})
		return res.json(data)
	} catch (error) {
		return next(error)
	}
}

// Obtener lista
exports.list = async (req, res, next) => {
	try {
		let { limit, offset, ...query } = req.query
		if (query.receiveTime) {
			query.receiveTime = parseTimeQuyer(query.receiveTime)
		}
		if (query.sendTime) {
			query.sendTime = parseTimeQuyer(query.sendTime)
		}
		// Consulta personalizada para parámetros especiales
		const qry = {}
		query.title && (qry.title = { [Op.eq]: query.title })
		query.from && (qry.from = { id: { [Op.eq]: query.from.id } })
		query.to && (qry.to = { id: { [Op.eq]: query.to.id } })
		query.star && (qry.star = { [Op.eq]: query.star })
		query.status && (qry.status = { [Op.like]: query.status })
		query.receiveTime && (qry.receiveTime = query.receiveTime)
		query.sendTime && (qry.sendTime = query.sendTime)
		const { count: total, rows: data } = await Model.findAndCountAll({
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

// Eliminar múltiples elementos de la lista
exports.removeList = async (req, res, next) => {
	const { ids = [] } = req.body
	try {
		// Eliminar registros de la base de datos
		const rows = await Model.destroy({
			where: { id: { [Op.in]: ids } }
		})
		return res.json({
			rows
		})
	} catch (error) {
		return next(error)
	}
}

// Guardar paquete de audio
async function addWavFile({ path, message, msgId, device = {} } = {}) {
	// Ejecutar acción
	$tts._saveWav(message, msgId, ttsPath, async code => {
		// Sintetizar paquete de voz
		if (code == 0) {
			const id = msgId
			const fileName = `${id}.wav`
			const url = `/${destination}/${fileName}`
			let ttsAudio = await $db.TtsAudio.findByPk(id)
			if (!ttsAudio) {
				// Crear registro
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
					fileName: `${id}.wav`,
					url: url,
					path,
					orderId,
					message,
					status: false
				})
			} else {
				// Actualizar registro
				$db.TtsAudio.update({ status: false, url: url }, { where: { id }, individualHooks: true })
			}
		}
	})
}

// Enviar notificación
exports.handle = async (req, res, next) => {
	// Obtener contenido actual
	let { content, receivers = [], gateways = [], type } = req.body
	$log.info('【notification】handle++++++', req.body)
	if (!receivers.length) throw $APIError.BadRequest('error.receivers')
	let numExecuted = 0
	let numFailed = 0
	let idFailed = []
	let result = 'successed'
	try {
		if (type === 'node') {
			for (let i = 0; i < receivers.length; i++) {
				let node = receivers[i]
				const msgId = id++
				if (id === 255) id = 0
				// Generar paquete de voz
				// 1. Verificar si el nodo tiene habilitada la función de intercomunicación, qué puerta de enlace está especificada, eliminar después de media hora
				$log.info('【notification】intercom node ++++++++++++', node)
				if (node.intercom && node.pushType != INTERCOM_PUSH_TYPE.CALL) {
					const intercomDevice = gateways.filter(dev => dev.sn == node.intercom)
					if (intercomDevice.length) {
						addWavFile({
							path: node.path,
							message: content,
							domain: $userConfig.domain,
							msgId: parseInt(Date.now()) + '',
							device: intercomDevice[0]
						})
					}
				}
				// Poner mensajes en cola
				const messageResult = await addMessage({
					path: node.path,
					message: content,
					domain: $userConfig.domain,
					msgId,
					devices: gateways,
					unicastAddr: node.broadcastAddr
				})
				numExecuted = numExecuted + messageResult.numExecuted
				numFailed = numFailed + messageResult.numFailed
				idFailed = idFailed.concat(messageResult.idFailed)
				if (messageResult?.status === 'failed') {
					result = 'failed'
				}
			}
		} else if (type === 'resource') {
			// Encontrar todos los nodos vinculados al reloj y verificar si estos nodos están vinculados a una puerta de enlace, si es así, obtener la puerta de enlace
			for (let i = 0; i < receivers.length; i++) {
				let resource = receivers[i]
				let devices = await getGateways(resource)
				const msgId = id++
				if (id === 255) id = 0
				// Poner mensajes en cola
				const sn = resource.sn
				const broadcastAddr =
					sn.substring(0, 3) + '.' + sn.substring(3, 6) + '.' + sn.substring(6, 9) + '.' + sn.substring(9, 12)
				const messageResult = await addMessage({
					path: '',
					message: content,
					domain: $userConfig.domain,
					msgId,
					devices,
					unicastAddr: broadcastAddr
				})
				numExecuted = numExecuted + messageResult.numExecuted
				numFailed = numFailed + messageResult.numFailed
				idFailed = idFailed.concat(messageResult.idFailed)
				if (messageResult?.status === 'failed') {
					result = 'failed'
				}
			}
		}
		$log.info('【notification】handle--------', result, idFailed, numExecuted, numFailed)
		if (result == 'failed') {
			idFailed = uniq(idFailed)
			return res.json({
				code: 200,
				status: result,
				message: 'error.device_no_response',
				payload: {
					numExecuted,
					numFailed,
					idFailed
				}
			})
		}

		return res.json({ status: result, data: req.body })
	} catch (error) {
		return next(error)
	}
}

async function getGatewaysByNode(node, gateways) {
	const len = node.length
	for (let i = 0; i < len; i++) {
		let item = node[i]
		if (item.device) {
			const device = await $db.Device.findByPk(item.device)
			let repeatGateway = gateways.length && gateways.filter(gateway => gateway.sn === item.device).length
			if (repeatGateway == 0 && device.type === 'nx1_wlcall_gateway') {
				gateways.push(device)
			}
		}
		if (item.related.length) {
			for (let j = 0, reLen = item.related.length; j < reLen; j++) {
				let resource = item.related[j]
				let repeatGateway = gateways.length && gateways.filter(gateway => gateway.sn === resource.id).length
				if (repeatGateway == 0 && resource.type === 'nx1_wlcall_gateway') {
					const gateway = await $db.Device.findByPk(resource.id)
					gateways.push(gateway)
				}
			}
		}
		if (item.children) {
			// Obtener puertas de enlace
			gateways = await getGatewaysByNode(item.children, gateways)
		}
	}
	return gateways
}

exports.publish = async (req, res, next) => {
	// Obtener contenido actual
	let { content, id: nodeIds = [], title = '', type } = req.body
	$log.info('【notification】publish++++', req.body)
	let numExecuted = 0
	let numFailed = 0
	let idFailed = []
	let result = 'successed'
	try {
		if (type === 'node') {
			// Encontrar relojes y puertas de enlace que coincidan según el id del nodo
			for (let i = 0; i < nodeIds.length; i++) {
				let nodeId = nodeIds[i]
				const node = await $db.Navigation.findNode({
					where: { id: nodeId }
				})
				if (isEmpty(node))
					return res.json({
						code: 200,
						status: 'failed',
						message: 'failed',
						data: `There is invalid node id ${nodeId} in id array`
					})
				let gateways = []
				gateways = await getGatewaysByNode([node], gateways)
				if (!gateways.length)
					return res.json({
						code: 200,
						status: 'failed',
						message: 'failed',
						data: `This node id ${nodeId} is no bind gateway`
					})
				const msgId = id++
				if (id === 255) id = 0
				// Generar paquete de voz
				// 1. Verificar si el nodo tiene habilitada la función de intercomunicación, qué puerta de enlace está especificada, eliminar después de media hora
				$log.info('publish===========', node)
				if (node.intercom && node.pushType != INTERCOM_PUSH_TYPE.CALL) {
					const intercomDevice = gateways.filter(dev => dev.sn == node.intercom)
					$log.info('publish addWavFile===========', intercomDevice.length)
					if (intercomDevice.length) {
						addWavFile({
							path: node.path,
							message: content,
							domain: $userConfig.domain,
							msgId: parseInt(Date.now()) + '',
							device: intercomDevice[0]
						})
					}
				}

				// Poner mensajes en cola
				const messageResult = await addMessage({
					path: node.path,
					message: content,
					domain: $userConfig.domain,
					msgId,
					devices: gateways,
					unicastAddr: node.broadcastAddr
				})
				numExecuted = numExecuted + messageResult.numExecuted
				numFailed = numFailed + messageResult.numFailed
				idFailed = idFailed.concat(messageResult.idFailed)
				if (messageResult?.status === 'failed') {
					result = 'failed'
				}
			}
		} else if (type === 'resource') {
			// Encontrar todos los nodos vinculados al reloj y verificar si estos nodos están vinculados a una puerta de enlace, si es así, obtener la puerta de enlace
			for (let i = 0; i < nodeIds.length; i++) {
				let resource = nodeIds[i]
				const sn = resource?.sn || resource
				let devices = await getGateways(resource)
				const msgId = id++
				if (id === 255) id = 0
				// Poner mensajes en cola
				const broadcastAddr =
					sn.substring(0, 3) + '.' + sn.substring(3, 6) + '.' + sn.substring(6, 9) + '.' + sn.substring(9, 12)
				const messageResult = await addMessage({
					path: '',
					message: content,
					domain: $userConfig.domain,
					msgId,
					devices,
					unicastAddr: broadcastAddr
				})
				numExecuted = numExecuted + messageResult.numExecuted
				numFailed = numFailed + messageResult.numFailed
				idFailed = idFailed.concat(messageResult.idFailed)
				if (messageResult?.status === 'failed') {
					result = 'failed'
				}
			}
		}
		if (result == 'failed') {
			idFailed = uniq(idFailed)
			return res.json({
				code: 200,
				status: result,
				message: 'error.device_no_response',
				data: {
					numExecuted,
					numFailed,
					idFailed
				}
			})
		}
		return res.json({ code: 200, status: 'successed', message: 'successed', data: null })
	} catch (error) {
		return next(error)
	}
}

exports.test = async (req, res, next) => {
	$log.info('【notification】test====', req.body)
	return res.json({ code: 200, message: 'successed', data: null })
}
