const Joi = require('joi')

module.exports = {
	// crear
	createKeyMap: {
		body: {
			value: Joi.object().required() // { 1: "Solicitar ayuda", 2: "Pedir comida"
		}
	},

	// renovar
	updateKeyMap: {
		body: {
			value: Joi.object().required() // { 1: "Solicitar ayuda", 2: "Pedir comida"
		}
	},

	// Eliminación por lotes
	removeKeyMaps: {
		body: {
			ids: Joi.array().items(Joi.number().min(1))
		}
	},

	// Obtener lista
	listKeyMaps: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0)
		}
	}
}
