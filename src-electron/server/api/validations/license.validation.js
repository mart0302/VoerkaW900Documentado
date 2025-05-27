const Joi = require('joi')

module.exports = {
	// Crear un archivo de certificado de dispositivo
	createLicense: {
		body: {
			id: Joi.string().required(),
			license: Joi.string().required()
		}
	},
	// Obtener lista
	listLicense: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0)
		}
	}
}
