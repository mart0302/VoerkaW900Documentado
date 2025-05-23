const Joi = require('joi')

module.exports = {
	createDepartment: {
		body: {
			title: Joi.string().max(64).required(),
			pid: Joi.number().min(1).required(),
			open: Joi.boolean().default(true),
			orderNumber: Joi.number().min(1).required(),
			leader: Joi.string().default(null),
			type: Joi.string().default('department'),
			related: Joi.array()
				.items(
					Joi.object({
						type: Joi.string().required(),
						id: Joi.alternatives().try(Joi.number(), Joi.string()).required()
					})
				)
				.default([])
		}
	},

	updateDepartment: {
		body: {
			title: Joi.string().max(64),
			pid: Joi.number().min(0),
			open: Joi.boolean().default(true),
			orderNumber: Joi.number().min(0),
			leader: Joi.string().allow(null),
			related: Joi.array().items(
				Joi.object({
					type: Joi.string().required(),
					id: Joi.alternatives().try(Joi.string(), Joi.number()).required()
				})
			)
		}
	},
	// lista de consultas
	listDepartment: {
		query: {
			title: Joi.string(),
			open: Joi.boolean()
		}
	}
}
