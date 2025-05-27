const { NETWORK } = requireConfig('constant')
const logger = requireConfig('logger')
const { uniqBy, cloneDeep, isEqual, pick } = require('lodash')
const { Op } = require('sequelize')
const httpStatus = require('http-status')
const { mergeDeepRight, parseTimeQuyer, parseArrayNum } = require('../utils')
const { EVENT_TYPE } = requireConfig('constant')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

const Model = $db.Event

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
		const detail = await Model.findByPk(data.id, {
			include: [
				'transaction',
				{
					model: $db.Device,
					as: 'source',
					attributes: ['sn', 'type', 'title']
				}
			]
		})
		res.json(detail)
	} catch (error) {
		return next(error)
	}
}

// Crear nuevo
exports.create = async (req, res, next) => {
	try {
		let data
		try {
			data = await Model.create(req.body)
		} catch (error) {
			// SQLITE_CONSTRAINT: FOREIGN KEY constraint failed
			// 404 clave foránea no encontrada, es decir, el dispositivo no existe
			throw $APIError.NotFound('error.device_not_found')
		}
		res.status(httpStatus.CREATED)
		return res.json(data)
	} catch (error) {
		return next(error)
	}
}

// Editar
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

// Eliminar múltiples
exports.removeList = async (req, res, next) => {
	const { ids = [] } = req.body
	try {
		// Eliminar registros de la base de datos
		const rows = await Model.destroy({
			where: { id: { [Op.in]: ids } },
			individualHooks: true
		})
		return res.json({
			rows
		})
	} catch (error) {
		return next(error)
	}
}

// Obtener lista
exports.list = async (req, res, next) => {
	try {
		let { limit, offset, ...query } = req.query

		// Preprocesamiento
		// código
		if (query.code) {
			query.code = parseArrayNum(query.code)
		}
		if (query.status) {
			query.status = parseArrayNum(query.status)
		}
		if (query.result) {
			query.result = parseArrayNum(query.result)
		}
		if (query.triggerTime) {
			query.triggerTime = parseTimeQuyer(query.triggerTime)
		}
		if (query.receiveTime) {
			query.receiveTime = parseTimeQuyer(query.receiveTime)
		}
		if (query.handleTime) {
			query.handleTime = parseTimeQuyer(query.handleTime)
		}

		// Consulta personalizada para parámetros especiales
		const qry = {}
		query.message && (qry.message = { [Op.like]: `%${query.message}%` })
		query.code && (qry.code = { [Op.in]: query.code })
		query.type && (qry.type = { [Op.eq]: query.type })
		query.group && (qry.group = { [Op.like]: `%${query.group}%` })
		query.path && (qry.path = { [Op.like]: `%${query.path}%` })
		query.level && (qry.level = { [Op.eq]: query.level })
		query.status && (qry.status = { [Op.in]: query.status })
		query.result && (qry.result = { [Op.in]: query.result })
		query.tid && (qry.tid = { [Op.eq]: query.tid })
		query.sn && (qry.sn = { [Op.eq]: query.sn })
		query.triggerTime && (qry.triggerTime = query.triggerTime)
		query.receiveTime && (qry.receiveTime = query.receiveTime)
		query.handleTime && (qry.handleTime = query.handleTime)

		const { count: total, rows: data } = await Model.findAndCountAll({
			limit,
			offset,
			where: qry,
			order: [['updatedAt', 'DESC']],
			include: {
				model: $db.Device,
				as: 'source',
				attributes: ['sn', 'type', 'title']
			}
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

// Manejar alarma
exports.handle = async (req, res, next) => {
	const { data } = req.locals
	// TODO: Obtener el ID del usuario actualmente conectado, userId
	// const { result, remarks = '', syncTransaction } = req.body
	try {
		// Manejar alarma de entidad
		await $messager.handleEntityAlarm(data, req.body)
		// Retornar los datos más recientes de la alarma
		const alarm = await Model.findByPk(data.id)
		return res.json(alarm)
	} catch (error) {
		return next(error)
	}
}
