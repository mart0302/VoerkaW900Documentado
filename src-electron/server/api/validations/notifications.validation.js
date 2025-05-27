const Joi = require('joi')

module.exports = {
	// 创建
	createNotice: {
		body: {
			type: Joi.string(),
			title: Joi.string(),
			content: Joi.string(),
			status: Joi.string(),
			star: Joi.boolean().default(false), // 是否标星
			receivers: Joi.array(),
			sendTime: Joi.string().default(null)
		}
	},
	// 批量删除
	removeNotices: {
		body: {
			ids: Joi.array().items(Joi.number())
		}
	},

	// 获取列表
	listNotices: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0),
			to: Joi.object({
				type: Joi.string(),
				id: Joi.alternatives().try(Joi.number(), Joi.string()).required()
			}), // 消息
			from: Joi.object({
				type: Joi.string(),
				id: Joi.alternatives().try(Joi.number(), Joi.string()).required()
			}), // 消息
			status: Joi.string(), // 告警结果
			star: Joi.boolean(), // 按事件编码查找
			title: Joi.string(), // 事件/告警
			sendTime: Joi.string() // 分组查找
		}
	},

	// 处理通知
	handleNotice: {
		body: {
			type: Joi.string(),
			receivers: Joi.array(),
			gateways: Joi.array(),
			title: Joi.string(),
			content: Joi.string(),
			status: Joi.string(),
			star: Joi.boolean().default(false) // 是否标星
		}
	},
	// 发布通知到第三方服务平台
	publishNotice: {
		body: {
			id: Joi.array().required(), // 节点id
			title: Joi.string().empty('').default(''), // 通知标题, 可以为空，该字段不发送到手表
			content: Joi.string().required(), // 发送给手表消息内容
			type: Joi.string().default('node')
		}
	}
}
