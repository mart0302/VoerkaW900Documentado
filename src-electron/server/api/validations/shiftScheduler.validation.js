const Joi = require('joi')

module.exports = {
	// 批量删除
	removeShift: {
		body: {
			ids: Joi.array().items(Joi.number())
		}
	},

	// 获取列表
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

	// 更新
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
