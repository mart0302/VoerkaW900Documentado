const { DEVICE_TYPES } = require('../../config/constant')
exports.load = async (req, res, next, id) => {
	try {
		const setting = await $db.Setting.findByPk(id)
		if (!setting) {
			throw $APIError.NotFound()
		}
		req.locals = { setting }
		return next()
	} catch (error) {
		return next(error)
	}
}

// Obtener configuración
exports.get = (req, res) => res.json(req.locals.setting)

// Actualizar configuración
exports.update = async (req, res, next) => {
	try {
		const { key } = req.locals.setting
		const { value, ...options } = req.body
		const setting = await $settings.update(key, value, options)
		if (key === 'current_language') {
			// Enviar evento de cambio de atributos
			$messager.sendHostAttrs(value)
		}
		return res.json(setting)
	} catch (error) {
		return next(error)
	}
}

// Crear
exports.create = async (req, res, next) => {
	try {
		const { key, value, ...options } = req.body
		let setting = await $db.Setting.findByPk(key)
		if (setting) {
			throw $APIError.Conflict()
		}
		setting = await $settings.update(key, value, options)
		return res.json(setting)
	} catch (error) {
		return next(error)
	}
}

// Obtener lista
exports.list = async (req, res, next) => {
	try {
		let { count: total, rows: data } = await $db.Setting.findAndCountAll({
			order: [['updatedAt', 'DESC']]
		})

		return res.json({
			total,
			data
		})
	} catch (error) {
		return next(error)
	}
}
