const { Op, QueryTypes } = require('sequelize')
const httpStatus = require('http-status')
const { mergeDeepRight } = require('../utils')

const Model = $db.Position

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
		let data
		try {
			if (!req.body.orderNumber) {
				const orderNumber = await $db.sequelize.query(`SELECT MAX(orderNumber) as max FROM Positions;`, {
					type: QueryTypes.SELECT
				})
				req.body['orderNumber'] = orderNumber[0].max + 1
			} else {
				// 更新排序号
				const positions = await Model.findAll({ where: { orderNumber: { [Op.gte]: parseInt(req.body.orderNumber) } } })
				if (positions.length) {
					positions.map(post => {
						Model.update({ orderNumber: post.orderNumber + 1 }, { where: { id: post.id } })
					})
				}
			}
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
		if (updateData.orderNumber) {
			// 更新排序号
			const conflictRow = await Model.findAll({
				where: { orderNumber: { [Op.eq]: updateData.orderNumber }, id: { [Op.ne]: updateData.id } }
			})
			if (conflictRow.length) {
				const positions = await Model.findAll({
					where: { orderNumber: { [Op.gte]: updateData.orderNumber }, id: { [Op.ne]: updateData.id } }
				})
				positions.map(post => {
					Model.update({ orderNumber: post.orderNumber + 1 }, { where: { id: post.id } })
				})
			}
		}
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
		if ('open' in query) {
			qry.open = { [Op.eq]: query.open }
		}

		query.title && (qry.title = { [Op.like]: `%${query.title}%` })

		let { count: total, rows: data } = await Model.findAndCountAll({
			limit,
			offset,
			where: qry,
			order: [['orderNumber', 'ASC']]
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
