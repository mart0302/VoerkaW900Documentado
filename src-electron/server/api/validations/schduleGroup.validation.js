const Joi = require('joi')

module.exports = {
	// Eliminación por lotes
	removeGroup: {
		body: {
			ids: Joi.array().items(Joi.string())
		}
	},

	// Obtener lista
	listGroup: {
		query: {
			nodeId: Joi.number().min(1),
			start: Joi.string().required(),
			end: Joi.string().required()
		}
	},
	// renovar
	updateGroup: {
		body: {
			nodeId: Joi.number().min(1),
			start: Joi.string().required(),
			end: Joi.string().required(),
			type: Joi.string().default('scheduleGroup'),
			ranges: Joi.array()
				.items(
					Joi.object({
						start: Joi.number(),
						end: Joi.number()
					})
				)
				.default([])
		}
	}
}
