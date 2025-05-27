const Joi = require('joi')
const { TRANSACTION_RESULT } = require('@voerka/messager')

module.exports = {
	// 批量删除
	removeEvents: {
		body: {
			ids: Joi.array().items(Joi.string())
		}
	},

	// 获取列表
	listEvents: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0),
			message: Joi.string().trim(), // 消息
			code: Joi.string(), // 按事件编码查找
			type: Joi.string(), // 事件/告警
			group: Joi.string(), // 分组查找
			path: Joi.string(), // 语义路径查找
			level: Joi.number(), // 级别
			status: Joi.string(), // 告警状态
			result: Joi.string(), // 告警结果
			tid: Joi.string(), // 事务
			sn: Joi.string(), // 设备
			triggerTime: Joi.string(), // 触发时间
			handleTime: Joi.string() // 处理时间
		}
	},

	// 处理告警
	handleAlarm: {
		body: {
			result: Joi.number()
				.valid(...Object.values(TRANSACTION_RESULT).filter(item => item >= TRANSACTION_RESULT.COMPLETED))
				.required(),
			remarks: Joi.string().empty('').default(''),
			resultTitle: Joi.string().empty('').default(''),
			syncTransaction: Joi.boolean().default(true) // 是否同步结束事务
		}
	}
}
