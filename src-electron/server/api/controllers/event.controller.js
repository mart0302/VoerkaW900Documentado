const { NETWORK } = requireConfig('constant')
const logger = requireConfig('logger')
const { uniqBy, cloneDeep, isEqual, pick } = require('lodash')
const { Op } = require('sequelize')
const httpStatus = require('http-status')
const { mergeDeepRight, parseTimeQuyer, parseArrayNum } = require('../utils')
const { EVENT_TYPE } = requireConfig('constant')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

const Model = $db.Event

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

// 新增
exports.create = async (req, res, next) => {
	try {
		let data
		try {
			data = await Model.create(req.body)
		} catch (error) {
			// SQLITE_CONSTRAINT: FOREIGN KEY constraint failed
			// 404 外键未找到，即设备不存在
			throw $APIError.NotFound('error.device_not_found')
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
		// code
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

		//  特别参数的定制查询
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

// 处理告警
exports.handle = async (req, res, next) => {
	const { data } = req.locals
	// TODO: 获取当前登入的用户id，userId
	// const { result, remarks = '', syncTransaction } = req.body
	try {
		// 处理实体告警
		await $messager.handleEntityAlarm(data, req.body)
		// 返回最新告警数据
		const alarm = await Model.findByPk(data.id)
		return res.json(alarm)
	} catch (error) {
		return next(error)
	}
}
