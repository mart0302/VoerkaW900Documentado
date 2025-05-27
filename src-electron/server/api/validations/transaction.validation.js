const Joi = require('joi')
const { TRANSACTION_RESULT } = require('@voerka/messager')

module.exports = {
	// 批量删除
	removeTransactions: {
		body: {
			ids: Joi.array().items(Joi.string())
		}
	},

	// 获取列表
	listTransactions: {
		query: {
			limit: Joi.number().integer().min(1).max(1000).default(20),
			offset: Joi.number().integer().min(0).default(0),
			title: Joi.string().trim(), // 消息
			status: Joi.string(), // 告警状态
			result: Joi.string(), // 告警结果
			code: Joi.string(), // 按事件编码查找
			type: Joi.string(), // 事件/告警
			group: Joi.string(), // 分组查找
			path: Joi.string(), // 语义路径查找
			sn: Joi.string(), // 设备
			startTime: Joi.string(), // 触发时间
			completeTime: Joi.string() // 处理时间
		}
	},

	// 处理事务
	handleTransactions: {
		body: {
			result: Joi.number()
				.valid(...Object.values(TRANSACTION_RESULT))
				.required(),
			progress: Joi.number().min(1).max(100),
			remarks: Joi.string().empty('').default(''),
			path: Joi.string().empty('').default(''),
			handler: Joi.object({
				sn: Joi.string().min(12).max(12).lowercase().required(),
				title: Joi.string().empty('').default(''),
				type: Joi.string().empty('').default('')
			})
		}
	}
}
