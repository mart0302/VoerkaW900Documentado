const Joi = require('joi')

module.exports = {
	// 创建设备证书文件
	createLicense: {
		body: {
			id: Joi.string().required(),
			license: Joi.string().required()
		}
	},
	// 获取列表
	listLicense: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0)
		}
	}
}
