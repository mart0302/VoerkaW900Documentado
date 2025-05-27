const Joi = require('joi')

module.exports = {
	// Eliminación por lotes
	removeShift: {
		body: {
			ids: Joi.array().items(Joi.number())
		}
	},

	// Obtener lista
	listShift: {
		query: {
			nodeId: Joi.number().min(1),
			date: Joi.string()
		}
	},

	syncShift: {
		body: {
			nodeId: Joi.number().min(1),
			lastDate: Joi.string().required()
		}
	},

	// renovar
	updateShift: {
		body: {
			nodeId: Joi.number().min(1),
			date: Joi.number().required(),
			start: Joi.number().required(),
			end: Joi.number().required(),
			type: Joi.string().default('shiftScheduler'),
			users: Joi.array()
				.items(
					Joi.object({
						id: Joi.any(),
						type: Joi.string(),
						title: Joi.string()
					})
				)
				.default([])
		}
	}
}
