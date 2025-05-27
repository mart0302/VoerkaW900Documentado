const Joi = require('joi')

module.exports = {
	// 创建升级包
	createPackage: {
		body: {
			id: Joi.string().required(),
			type: Joi.string().required(),
			url: Joi.string().empty('').default(''),
			version: Joi.string().empty('').default(''),
			versions: Joi.array(),
			apps: Joi.array(),
			date: Joi.string().empty('').default(''),
			description: Joi.string().empty('').default(''),
			fileName: Joi.string().empty('').default(''),
			fileSize: Joi.number().default(0),
			hardware: Joi.string().empty('').default(''),
			md5: Joi.string().empty('').default(''),
			models: Joi.array(),
			remarks: Joi.string().empty('').default('')
		}
	},
	// 获取列表
	listPackages: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0)
		}
	}
}
