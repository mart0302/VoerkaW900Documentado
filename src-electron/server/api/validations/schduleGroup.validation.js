const Joi = require('joi')

module.exports = {
	// 批量删除
	removeGroup: {
		body: {
			ids: Joi.array().items(Joi.string())
		}
	},

	// 获取列表
	listGroup: {
		query: {
			nodeId: Joi.number().min(1),
			start: Joi.string().required(),
			end: Joi.string().required()
		}
	},
	// 更新
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
