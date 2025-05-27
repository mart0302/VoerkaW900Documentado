const Joi = require('joi')
const { INTERCOM_PUSH_TYPE } = requireConfig('constant')

module.exports = {
	createNavigation: {
		body: {
			title: Joi.string().max(64).required(),
			pid: Joi.number().min(1).required(),
			device: Joi.string().min(12).max(12).lowercase().allow(null),
			related: Joi.array().items(
				Joi.object({
					type: Joi.string().required(),
					id: Joi.alternatives().try(Joi.number(), Joi.string()).required()
				})
			)
		}
	},
	createNavigations: {
		body: {
			copyId: Joi.number().min(1).required(),
			id: Joi.number().min(1).required()
		}
	},
	updateNavigation: {
		body: {
			title: Joi.string().max(64),
			pid: Joi.number().min(1),
			device: Joi.string().min(12).max(12).lowercase().allow(null),
			related: Joi.array().items(
				Joi.object({
					type: Joi.string().required(),
					id: Joi.alternatives().try(Joi.string(), Joi.number()).required()
				})
			),
			subscription: Joi.boolean(),
			intercom: Joi.string().min(12).max(12).lowercase().allow(null),
			pushType: Joi.string().default(INTERCOM_PUSH_TYPE.ALL)
		},
		query: {
			deviceUnbindNode: Joi.boolean().default(false),
			deleteRelated: Joi.boolean().default(false)
		}
	},

	// Obtener lista
	// No es necesario implementar por el momento la implementación del filtrado front-end
	listNavigations: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0),
			title: Joi.string().trim()
		}
	},

	getIntercomDevice: {
		body: {
			intercoms: Joi.array().items(Joi.string().min(12).max(12).lowercase().allow(null)),
			nodeId: Joi.number().min(1).required()
		}
	}
}
