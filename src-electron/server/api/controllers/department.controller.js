const { Op } = require('sequelize')

// Cargar - parámetro id
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

// Obtener lista
exports.getList = async (req, res, next) => {
	try {
		const department = await $db.Department.findAll()
		return res.json(department)
	} catch (error) {
		return next(error)
	}
}

// Obtener nodo
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

// Crear nuevo
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

// Filtrar
exports.getQuery = async (req, res, next) => {
	let { ...query } = req.query
	// Consulta personalizada para parámetros especiales
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

// Editar
exports.update = async (req, res, next) => {
	const { department } = req.locals
	const { id } = department
	let data = req.body
	try {
		// Actualizar base de datos
		const result = await $db.Department.updateNode(data, { where: { id }, individualHooks: true })
		// Retornar
		return res.json(result)
	} catch (error) {
		return next(error)
	}
}

// Eliminar nodo, actualizar el estado de vinculación de dispositivos
$db.Department.addHook('afterDestroy', async (node, options) => {
	const { leader, related, id } = node
	// Primero desvincular
	if (related.length) {
		related.map(async item => {
			await $db.User.update({ nodeId: null }, { where: { sn: item.id, nodeId: id } })
		})
	}
	// Si el nodo tiene recursos no multi-vinculados
	if (leader) {
		$db.User.update({ nodeId: null }, { where: { id: leader } })
	}
})

// Eliminar
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
