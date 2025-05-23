const Joi = require('joi')
const { TRANSACTION_RESULT } = require('@voerka/messager')

module.exports = {
	//Guardar certificado
	saveLicense: {
		body: {
			license: Joi.string().required()
		}
	}
}
