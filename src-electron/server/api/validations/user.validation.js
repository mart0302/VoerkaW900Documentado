const Joi = require('joi')
const ROLES = ['user', 'admin']

module.exports = {
	// GET /v1/users
	listUsers: {
		query: {
			page: Joi.number().min(1),
			perPage: Joi.number().min(1).max(100),
			username: Joi.string(),
			fullname: Joi.string(),
			open: Joi.boolean(),
			mphone: Joi.string(),
			deptId: Joi.number()
			// role: Joi.string().valid(ROLES)
		}
	},

	// POST /v1/users
	createUser: {
		body: {
			email: Joi.string().email().required(),
			username: Joi.string().max(128),
			password: Joi.string().min(6).max(128).required(),
			role: Joi.string().valid(ROLES)
		}
	},

	// PUT /v1/users/:userId
	replaceUser: {
		body: {
			email: Joi.string().email().required(),
			password: Joi.string().min(6).max(128).required(),
			name: Joi.string().max(128),
			role: Joi.string().valid(ROLES)
		},
		params: {
			userId: Joi.string()
				.regex(/^[a-fA-F0-9]{24}$/)
				.required()
		}
	},

	// PATCH /v1/users/:userId
	updateUser: {
		body: {
			email: Joi.string().email(),
			password: Joi.string().min(6).max(128),
			name: Joi.string().max(128),
			role: Joi.string().valid(ROLES)
		},
		params: {
			userId: Joi.string()
				.regex(/^[a-fA-F0-9]{24}$/)
				.required()
		}
	},

	// 批量删除
	removeUsers: {
		body: {
			users: Joi.array().items(Joi.string())
		}
	}
}
