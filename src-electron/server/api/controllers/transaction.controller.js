const { Op } = require('sequelize')
const httpStatus = require('http-status')
const { mergeDeepRight, parseTimeQuyer, parseArrayNum } = require('../utils')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

const Model = $db.Transaction

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

// 新增
exports.create = async (req, res, next) => {
	try {
		let data
		try {
			data = await Model.create(req.body)
		} catch (error) {
			// SQLITE_CONSTRAINT: FOREIGN KEY constraint failed
			// 404 外键未找到
			throw $APIError.NotFound()
		}
		res.status(httpStatus.CREATED)
		return res.json(data)
	} catch (error) {
		return next(error)
	}
}

// 编辑
exports.update = async (req, res, next) => {
	const { data } = req.locals
	const updateData = mergeDeepRight(data, req.body)
	try {
		// 更新数据库
		await Model.update(updateData, { where: { id: data.id }, individualHooks: true })
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

// 获取列表
exports.list = async (req, res, next) => {
	try {
		let { limit, offset, ...query } = req.query
		// 预处理
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
		//  特别参数的定制查询
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

// 处理事务/忽略事务
exports.handle = async (req, res, next) => {
	const { data } = req.locals
	// TODO: 获取当前登入的用户id，userId
	// const { result, progress, remarks = '' } = req.body
	try {
		// 处理实体事务
		await $messager.handleEntityTransaction(data, {
			...req.body,
			message: req.__('transaction.handle')
		})
		// 返回最新的事务数据
		const transaction = await $db.Transaction.findByPk(data.id)
		return res.json(transaction)
	} catch (error) {
		return next(error)
	}
}
