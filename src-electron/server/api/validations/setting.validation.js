const Joi = require('joi')

module.exports = {
	// create
	createSetting: {
		body: {
			key: Joi.string().max(32).required(),
			value: Joi.object().required(),
			description: Joi.string().max(256).empty('')
		}
	},
	// update
	updateSetting: {
		body: {
			value: Joi.object().required(),
			description: Joi.string().max(256).empty('')
		}
	}
}
