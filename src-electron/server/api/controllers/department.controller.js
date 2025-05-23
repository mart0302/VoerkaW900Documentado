const { Op } = require('sequelize')

// 加载 - params id
exports.load = async (req, res, next, id) => {
	try {
		const department = await $db.Department.findByPk(id)
		if (!department) {
			throw $APIError.NotFound()
		}
		req.locals = { department: department.toJSON() }
		return next()
	} catch (error) {
		return next(error)
	}
}

// 获取列表
exports.getList = async (req, res, next) => {
	try {
		const department = await $db.Department.findAll()
		return res.json(department)
	} catch (error) {
		return next(error)
	}
}

// 获取节点
exports.get = async (req, res, next) => {
	try {
		const { id } = req.locals.department
		const department = await $db.Department.findNode({
			where: { id }
		})
		return res.json(department)
	} catch (error) {
		return next(error)
	}
}

// 新增
exports.create = async (req, res, next) => {
	try {
		const department = await $db.Department.createNode(req.body)
		return res.json(department)
	} catch (error) {
		if (error.message === 'parent_node_not_found') {
			return next($APIError.BadRequest('error.parent_not_found'))
		}
		return next(error)
	}
}

// 过滤
exports.getQuery = async (req, res, next) => {
	let { ...query } = req.query
	//  特别参数的定制查询
	const qry = {}
	if ('open' in query) {
		qry.open = { [Op.eq]: query.open }
	}

	query.title && (qry.title = { [Op.like]: `%${query.title}%` })

	const departments = await $db.Department.findAll({
		where: qry,
		order: [['orderNumber', 'ASC']]
	})
	return res.json(departments)
}

// 编辑
exports.update = async (req, res, next) => {
	const { department } = req.locals
	const { id } = department
	let data = req.body
	try {
		// 更新数据库
		const result = await $db.Department.updateNode(data, { where: { id }, individualHooks: true })
		// 返回
		return res.json(result)
	} catch (error) {
		return next(error)
	}
}

// 节点删除，更新设备的绑定状态
$db.Department.addHook('afterDestroy', async (node, options) => {
	const { leader, related, id } = node
	// 先解绑
	if (related.length) {
		related.map(async item => {
			await $db.User.update({ nodeId: null }, { where: { sn: item.id, nodeId: id } })
		})
	}
	// 如果节点上关联资源有非多绑
	if (leader) {
		$db.User.update({ nodeId: null }, { where: { id: leader } })
	}
})

// 删除
exports.remove = async (req, res, next) => {
	const { department } = req.locals
	const { id } = department
	try {
		const result = await $db.Department.destroyNode({
			where: { id },
			individualHooks: true
		})
		return res.json(result)
	} catch (error) {
		return next(error)
	}
}
