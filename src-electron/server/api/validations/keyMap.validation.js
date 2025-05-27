const Joi = require('joi')

module.exports = {
	// 创建
	createKeyMap: {
		body: {
			value: Joi.object().required() // { 1: "请求支援", 2: "点菜" }
		}
	},

	// 更新
	updateKeyMap: {
		body: {
			value: Joi.object().required() // { 1: "请求支援", 2: "点菜" }
		}
	},

	// 批量删除
	removeKeyMaps: {
		body: {
			ids: Joi.array().items(Joi.number().min(1))
		}
	},

	// 获取列表
	listKeyMaps: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0)
		}
	}
}
