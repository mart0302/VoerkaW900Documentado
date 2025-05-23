const { Op, QueryTypes } = require('sequelize')
const { indexOf, difference } = require('lodash')
const { md5 } = require('../utils/crypto')
/**
 * Load user and append to req.
 * @public
 */
exports.load = async (req, res, next, id) => {
	try {
		const user = await $db.User.findByPk(id)
		if (!user) {
			throw $APIError.NotFound()
		}
		// 相当于把用户存储起来放置在req的某个位置，供一个中间件使用
		req.locals = { user }
		return next()
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
 * Get user
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
			// 更新绑定路径
			const dataPaths = data?.path?.split(',') || []
			const paths = user?.path?.split(',') || []
			if (user.path) {
				// 取更新前与更新后的不同节点进行解绑
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
				// 取更新后与更新前不同的节点进行绑定
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
		// 更新部门关联，不做这一步的话，前端排班表新增人员，无法将人员放到树节点上
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

		// 更新数据库
		await $db.User.update(data, { where: { username }, individualHooks: true })
		// 查询结果
		const newData = await $db.User.findByPk(username)
		// 返回
		return res.json(newData)
	} catch (error) {
		return next(error)
	}
}
const INIT_PASSWORD = '123456'
// 重置密码
exports.resetPassword = async (req, res) => {
	try {
		const { user } = req.locals
		const { username } = user
		// 更新数据库
		await $db.User.update(
			{ decryptPassword: INIT_PASSWORD, password: md5(INIT_PASSWORD) },
			{ where: { username }, individualHooks: true }
		)
		// 查询结果
		const newData = await $db.User.findByPk(username)
		// 返回
		return res.json(newData)
	} catch (error) {
		return next(error)
	}
}

// 批量删除用户
exports.removeList = async (req, res, next) => {
	const { users = [] } = req.body
	let rows = 0
	try {
		// 如果有绑节点需要解绑
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
				// 解绑
				let related = JSON.parse(lastNode.related).filter(item => indexOf(users, item.id) == -1)
				await $db.Navigation.update({ related }, { where: { id: lastNode.id }, individualHooks: true })
			})
		}
		// 从部门中解绑
		let departments = await $db.sequelize.query(
			`SELECT Departments.id, related FROM Departments, json_each(Departments.related) WHERE json_valid(Departments.related) AND json_extract(json_each.value, '$.id') in (${usernames})`,
			{
				type: QueryTypes.SELECT
			}
		)
		if (departments.length) {
			departments.map(async department => {
				// 解绑
				let related = JSON.parse(department.related).filter(item => indexOf(users, item.id) == -1)
				await $db.Department.update({ related }, { where: { id: department.id }, individualHooks: true })
			})
		}
		// 从排班中解绑
		let shifts = await $db.sequelize.query(
			`SELECT ShiftSchedulers.id, users FROM ShiftSchedulers, json_each(ShiftSchedulers.users) WHERE json_valid(ShiftSchedulers.users) AND json_extract(json_each.value, '$.id') in (${usernames})`,
			{
				type: QueryTypes.SELECT
			}
		)
		if (shifts.length) {
			shifts.map(async shift => {
				// 解绑
				let newUsers = JSON.parse(shift.users).filter(item => indexOf(users, item.id) == -1)
				await $db.ShiftScheduler.update({ users: newUsers }, { where: { id: shift.id }, individualHooks: true })
			})
		}
		// 删除用户
		rows = await $db.User.destroy({
			where: { username: { [Op.in]: users } },
			individualHooks: true // 认情况下,类似 bulkCreate 的方法不会触发单独的 hook - 仅批量 hook. 但是,如果你还希望触发单个 hook, 可以配置individualHooks=true
		})
		return res.json({
			rows
		})
	} catch (error) {
		return next(error)
	}
}
