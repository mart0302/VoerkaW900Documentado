const Joi = require('joi')
const { TRANSACTION_RESULT } = require('@voerka/messager')

module.exports = {
	// 保存证书
	saveLicense: {
		body: {
			license: Joi.string().required()
		}
	}
}
