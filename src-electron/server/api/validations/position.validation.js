const Joi = require('joi')

module.exports = {
	// 批量删除
	removePositions: {
		body: {
			ids: Joi.array().items(Joi.number())
		}
	},

	// 获取列表
	listPositions: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0),
			title: Joi.string(),
			open: Joi.boolean()
		}
	}
}
