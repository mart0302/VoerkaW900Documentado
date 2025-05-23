const { NETWORK } = requireConfig('constant')
const logger = requireConfig('logger')
const { uniqBy, cloneDeep, isEqual, pick } = require('lodash')
const { Op } = require('sequelize')
const httpStatus = require('http-status')
const { mergeDeepRight } = require('../utils')

const Model = $db.KeyMap

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

// 获取设备
exports.get = (req, res) => res.json(req.locals.data)

// 新增
exports.create = async (req, res, next) => {
	try {
		let data
		try {
			data = await Model.create(req.body)
		} catch (error) {
			// 409
			throw $APIError.Conflict()
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
		//  特别参数的定制查询
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
