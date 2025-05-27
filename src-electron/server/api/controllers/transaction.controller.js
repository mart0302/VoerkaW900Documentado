const { Op } = require('sequelize')
const httpStatus = require('http-status')
const { mergeDeepRight, parseTimeQuyer, parseArrayNum } = require('../utils')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

const Model = $db.Transaction

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
				{
					model: $db.Device,
					as: 'source',
					attributes: ['sn', 'type', 'title']
				},
				{
					model: $db.Event,
					as: 'events',
					attributes: { exclude: ['originalPayload'] }
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
			// Error 404: clave foránea no encontrada
			throw $APIError.NotFound()
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

// Eliminar múltiples elementos
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
		if (query.code) {
			query.code = parseArrayNum(query.code)
		}
		if (query.status) {
			query.status = parseArrayNum(query.status)
		}
		if (query.result) {
			query.result = parseArrayNum(query.result)
		}
		if (query.startTime) {
			query.startTime = parseTimeQuyer(query.startTime)
		}
		if (query.completeTime) {
			query.completeTime = parseTimeQuyer(query.completeTime)
		}
		if (query.handler) {
			query.handler = JSON.parse(query.handler)
		}
		// Consulta personalizada para parámetros especiales
		const qry = {}
		query.title && (qry.title = { [Op.like]: `%${query.title}%` })
		query.code && (qry.code = { [Op.in]: query.code })
		query.type && (qry.type = { [Op.eq]: query.type })
		query.group && (qry.group = { [Op.like]: `%${query.group}%` })
		query.path && (qry.path = { [Op.like]: `%${query.path}%` })
		query.status && (qry.status = { [Op.in]: query.status })
		query.result && (qry.result = { [Op.in]: query.result })
		query.sn && (qry.sn = { [Op.eq]: query.sn })
		query.startTime && (qry.startTime = query.startTime)
		query.completeTime && (qry.completeTime = query.completeTime)
		query.handler && (qry.handler = { type: { [Op.eq]: query.handler.type } })

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

// Procesar transacción/Ignorar transacción
exports.handle = async (req, res, next) => {
	const { data } = req.locals
	// TODO: Obtener el ID del usuario actualmente conectado, userId
	// const { result, progress, remarks = '' } = req.body
	try {
		// Procesar transacción de entidad
		await $messager.handleEntityTransaction(data, {
			...req.body,
			message: req.__('transaction.handle')
		})
		// Retornar los datos más recientes de la transacción
		const transaction = await $db.Transaction.findByPk(data.id)
		return res.json(transaction)
	} catch (error) {
		return next(error)
	}
}
