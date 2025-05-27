const { Op, QueryTypes } = require('sequelize')
const { indexOf, difference } = require('lodash')
const { md5 } = require('../utils/crypto')
/**
 * Cargar usuario y añadirlo a req.
 * @public
 */
exports.load = async (req, res, next, id) => {
	try {
		const user = await $db.User.findByPk(id)
		if (!user) {
			throw $APIError.NotFound()
		}
		// Equivalente a almacenar el usuario en una ubicación de req para su uso en un middleware
		req.locals = { user }
		return next()
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
		if ('open' in query) {
			qry.open = { [Op.eq]: query.open }
		}

		query.username && (qry.username = { [Op.like]: `%${query.username}%` })
		query.fullname && (qry.fullname = { [Op.like]: `%${query.fullname}%` })
		query.mphone && (qry.mphone = { [Op.like]: `%${query.mphone}%` })
		query.deptId && (qry.deptId = { [Op.eq]: query.deptId })

		let { count: total, rows: data } = await $db.User.findAndCountAll({
			limit,
			offset,
			where: qry,
			order: [['createdAt', 'ASC']]
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

/**
 * Obtener usuario
 * @public
 */
exports.get = (req, res) => res.json(req.locals.user)

exports.update = async (req, res, next) => {
	const { user } = req.locals
	let data = req.body
	const { username } = user
	try {
		if (data.decryptPassword) {
			data.password = md5(data.decryptPassword)
		}
		if (data?.path !== user.path) {
			// Actualizar ruta de vinculación
			const dataPaths = data?.path?.split(',') || []
			const paths = user?.path?.split(',') || []
			if (user.path) {
				// Desvincular los nodos que son diferentes entre la actualización anterior y la nueva
				const unbindPaths = difference(paths, dataPaths)
				let nodes = await $db.Navigation.findAll({
					where: { id: { [Op.in]: unbindPaths } }
				})
				nodes.map(node => {
					const related = node.related.filter(res => res.id !== username)
					$db.Navigation.update({ related }, { where: { id: node.id }, individualHooks: true })
				})
			}
			if (data.path) {
				// Vincular los nodos que son diferentes entre la nueva actualización y la anterior
				const bindPaths = difference(dataPaths, paths)
				nodes = await $db.Navigation.findAll({
					where: { id: { [Op.in]: bindPaths } }
				})
				nodes.map(node => {
					const relateds = node.related.concat([{ type: 'user', id: username }])
					$db.Navigation.update({ related: relateds }, { where: { id: node.id }, individualHooks: true })
				})
			}
		}
		// Actualizar asociación de departamento, sin este paso, al agregar personal en la tabla de turnos del frontend, no se puede colocar el personal en el nodo del árbol
		if (data?.deptId !== user.deptId || data?.fullname !== user.fullname) {
			let newReource = {}
			if (data?.deptId) {
				newReource = {
					deptId: data.deptId,
					type: data.type,
					resourceType: data.resourceType,
					id: data.username,
					title: data.fullname
				}
			} else {
				newReource = {
					deptId: user.deptId,
					type: user.type,
					resourceType: user.resourceType,
					id: user.username,
					title: data.fullname
				}
			}

			let { related } = await $db.Department.findByPk(user.deptId)
			related = related.filter(item => item.id !== user.username)
			await $db.Department.update({ related }, { where: { id: user.deptId }, individualHooks: true })

			let newDept = await $db.Department.findByPk(newReource.deptId)

			let newRelated = newDept.related.concat([newReource])

			$db.Department.update({ related: newRelated }, { where: { id: newReource.deptId }, individualHooks: true })
		}

		// Actualizar base de datos
		await $db.User.update(data, { where: { username }, individualHooks: true })
		// Consultar resultado
		const newData = await $db.User.findByPk(username)
		// Retornar
		return res.json(newData)
	} catch (error) {
		return next(error)
	}
}
const INIT_PASSWORD = '123456'
// Restablecer contraseña
exports.resetPassword = async (req, res) => {
	try {
		const { user } = req.locals
		const { username } = user
		// Actualizar base de datos
		await $db.User.update(
			{ decryptPassword: INIT_PASSWORD, password: md5(INIT_PASSWORD) },
			{ where: { username }, individualHooks: true }
		)
		// Consultar resultado
		const newData = await $db.User.findByPk(username)
		// Retornar
		return res.json(newData)
	} catch (error) {
		return next(error)
	}
}

// Eliminar múltiples usuarios
exports.removeList = async (req, res, next) => {
	const { users = [] } = req.body
	let rows = 0
	try {
		// Si hay nodos vinculados, es necesario desvincularlos
		let usernames = users.map(id => `'${id}'`)
		usernames = usernames.join(',')
		let lastNodes = await $db.sequelize.query(
			`SELECT Navigations.id, related FROM Navigations, json_each(Navigations.related) WHERE json_valid(Navigations.related) AND json_extract(json_each.value, '$.id') in (${usernames})`,
			{
				type: QueryTypes.SELECT
			}
		)
		if (lastNodes.length) {
			lastNodes.map(async lastNode => {
				// Desvincular
				let related = JSON.parse(lastNode.related).filter(item => indexOf(users, item.id) == -1)
				await $db.Navigation.update({ related }, { where: { id: lastNode.id }, individualHooks: true })
			})
		}
		// Desvincular del departamento
		let departments = await $db.sequelize.query(
			`SELECT Departments.id, related FROM Departments, json_each(Departments.related) WHERE json_valid(Departments.related) AND json_extract(json_each.value, '$.id') in (${usernames})`,
			{
				type: QueryTypes.SELECT
			}
		)
		if (departments.length) {
			departments.map(async department => {
				// Desvincular
				let related = JSON.parse(department.related).filter(item => indexOf(users, item.id) == -1)
				await $db.Department.update({ related }, { where: { id: department.id }, individualHooks: true })
			})
		}
		// Desvincular de los turnos
		let shifts = await $db.sequelize.query(
			`SELECT ShiftSchedulers.id, users FROM ShiftSchedulers, json_each(ShiftSchedulers.users) WHERE json_valid(ShiftSchedulers.users) AND json_extract(json_each.value, '$.id') in (${usernames})`,
			{
				type: QueryTypes.SELECT
			}
		)
		if (shifts.length) {
			shifts.map(async shift => {
				// Desvincular
				let newUsers = JSON.parse(shift.users).filter(item => indexOf(users, item.id) == -1)
				await $db.ShiftScheduler.update({ users: newUsers }, { where: { id: shift.id }, individualHooks: true })
			})
		}
		// Eliminar usuarios
		rows = await $db.User.destroy({
			where: { username: { [Op.in]: users } },
			individualHooks: true // Normalmente, métodos como bulkCreate no disparan hooks individuales - solo hooks en lote. Sin embargo, si deseas activar hooks individuales, puedes configurar individualHooks=true
		})
		return res.json({
			rows
		})
	} catch (error) {
		return next(error)
	}
}
