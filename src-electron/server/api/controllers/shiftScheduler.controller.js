const { Op } = require('sequelize')
const httpStatus = require('http-status')
const { parseTimeQuyer } = require('../utils')

const Model = $db.ShiftScheduler

// 加载
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

// 获取
exports.get = async (req, res) => {
	try {
		const { data } = req.locals
		const detail = await Model.findByPk(data.id)
		res.json(detail)
	} catch (error) {
		return next(error)
	}
}

// 新增
exports.create = async (req, res, next) => {
	try {
		let data = await Model.create(req.body)
		res.status(httpStatus.CREATED)
		return res.json(data)
	} catch (error) {
		return next(error)
	}
}

// 编辑
exports.update = async (req, res, next) => {
	const { data } = req.locals
	try {
		// 查询结果
		const newData = await Model.findByPk(data.id)
		// 返回
		return res.json(newData)
	} catch (error) {
		return next(error)
	}
}

// 删除
exports.remove = async (req, res, next) => {
	const { data } = req.locals
	try {
		// 先删除数据库记录
		await Model.destroy({
			where: { id: data.id },
			individualHooks: true
		})
		return res.json(data)
	} catch (error) {
		return next(error)
	}
}

// 批量删除
exports.removeList = async (req, res, next) => {
	const { ids = [] } = req.body
	try {
		// 删除数据库记录
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

// 同步上周
exports.syncLastWeek = async (req, res, next) => {
	let { nodeId, lastDate } = req.body
	//  特别参数的定制查询
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

// 获取列表
exports.list = async (req, res, next) => {
	try {
		let { ...query } = req.query
		//  特别参数的定制查询
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
