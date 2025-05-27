const httpStatus = require('http-status')
const { md5 } = require('../utils/crypto')
const { Op } = require('sequelize')

// Registro
exports.register = async (req, res, next) => {
	try {
		let user
		let data = req.body
		data.password = md5(data.decryptPassword)
		try {
			user = await $db.User.create(data)
			if (data.path) {
				const paths = data.path.split(',')
				const nodes = await $db.Navigation.findAll({
					where: { id: { [Op.in]: paths } }
				})
				nodes.map(node => {
					const related = node.related.concat([{ type: data.type, id: data.username }])
					$db.Navigation.update({ related }, { where: { id: node.id }, individualHooks: true })
				})
			}
			if (data.deptId) {
				let { related } = await $db.Department.findByPk(data.deptId)
				related = related.concat([
					{
						deptId: data.deptId,
						type: data.type,
						resourceType: data.resourceType,
						id: data.username,
						title: data.fullname
					}
				])
				$db.Department.update({ related }, { where: { id: data.deptId }, individualHooks: true })
			}
		} catch (error) {
			// Error 409 - Conflicto
			throw $APIError.Conflict('error.username_conflict')
		}
		res.status(httpStatus.CREATED)
		return res.json({ token: user.token(), user: user.transform() })
	} catch (error) {
		return next(error)
	}
}

// Inicio de sesión
exports.login = async (req, res, next) => {
	try {
		const { username, password } = req.body
		const user = await $db.User.findByPk(username)
		if (!user || user.password !== md5(password)) {
			// Error 401 - No autorizado
			throw $APIError.BadRequest('error.login')
		}
		return res.json({ token: user.token(), user: user.transform() })
	} catch (error) {
		return next(error)
	}
}

// Cambiar contraseña
exports.resetPassword = async (req, res, next) => {
	try {
		const { password: newPassword, oldPassword } = req.body
		const { username, password } = req.user

		if (md5(oldPassword) === password) {
			await $db.User.update({ password: md5(newPassword) }, { where: { username } })
			// Después de cambiar la contraseña, enviar a los dispositivos a través de MQTT
			$messager.sendHostAttrs({ username, password: newPassword })
			return res.json({})
		} else {
			throw $APIError.BadRequest('error.password_error')
		}
	} catch (error) {
		return next(error)
	}
}
