const Joi = require('joi')

module.exports = {
	// POST /v1/auth/register
	register: {
		body: {
			fullname: Joi.string().required(),
			mphone: Joi.string().required(),
			sex: Joi.number(),
			status: Joi.boolean(),
			username: Joi.string().required(),
			decryptPassword: Joi.string().required().min(6).max(64),
			deptId: Joi.number().default(1),
			postId: Joi.number().allow(null),
			menus: Joi.string().allow(null),
			resourceType: Joi.string().default('internal'), // ordinary
			type: Joi.string().default('user'),
			path: Joi.string().allow(null)
		}
	},

	// POST /v1/auth/login
	login: {
		body: {
			username: Joi.string().required(),
			password: Joi.string().required()
		}
	},

	// POST /v1/auth/resetPassword
	resetPassword: {
		body: {
			oldPassword: Joi.string().required(),
			password: Joi.string().required().min(6).max(64)
		}
	}
}
