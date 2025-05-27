const { Op } = require('sequelize')
const httpStatus = require('http-status')
const { parseTimeQuyer } = require('../utils')

const Model = $db.ShiftScheduler

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

// Crear nuevo
exports.create = async (req, res, next) => {
	try {
		let data = await Model.create(req.body)
		res.status(httpStatus.CREATED)
		return res.json(data)
	} catch (error) {
		return next(error)
	}
}

// Editar
exports.update = async (req, res, next) => {
	const { data } = req.locals
	try {
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

// Sincronizar con la semana anterior
exports.syncLastWeek = async (req, res, next) => {
	let { nodeId, lastDate } = req.body
	// Consulta personalizada para parámetros especiales
	if (lastDate) {
		lastDate = parseTimeQuyer(lastDate)
	}
	const qry = {}
	nodeId && (qry.nodeId = { [Op.eq]: nodeId })
	lastDate && (qry.date = lastDate)
	try {
		let { count: total, rows: data } = await Model.findAndCountAll({
			where: qry
		})

		if (!data.length) {
			return res.json({
				code: 200,
				status: 'failed',
				message: 'error.no_data'
			})
		}

		data.map(async row => {
			const { type, date, end, start, users, nodeId } = row
			await Model.create({ type, date: date + 604800000, end, start, users, nodeId })
		})
		return res.json({
			code: 200,
			status: 'successed',
			total
		})
	} catch (error) {
		return next(error)
	}
}

// Obtener lista
exports.list = async (req, res, next) => {
	try {
		let { ...query } = req.query
		// Consulta personalizada para parámetros especiales
		if (query.date) {
			query.date = parseTimeQuyer(query.date)
		}
		const qry = {}
		if ('nodeId' in query) {
			qry.nodeId = { [Op.eq]: query.nodeId }
		}

		query.date && (qry.date = query.date)

		let { count: total, rows: data } = await Model.findAndCountAll({
			where: qry
		})

		return res.json({
			total,
			data
		})
	} catch (error) {
		return next(error)
	}
}
