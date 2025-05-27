const { NETWORK } = requireConfig('constant')
const logger = requireConfig('logger')
const { uniqBy, cloneDeep, isEqual, pick } = require('lodash')
const { Op } = require('sequelize')
const httpStatus = require('http-status')
const { mergeDeepRight } = require('../utils')

const Model = $db.KeyMap

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

// Obtener dispositivo
exports.get = (req, res) => res.json(req.locals.data)

// Crear nuevo
exports.create = async (req, res, next) => {
	try {
		let data
		try {
			data = await Model.create(req.body)
		} catch (error) {
			// Error 409
			throw $APIError.Conflict()
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
		// Consulta personalizada para parámetros especiales
		const qry = {}
		// query.title && (qry.title = { [Op.like]: `%${query.title}%` })

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
