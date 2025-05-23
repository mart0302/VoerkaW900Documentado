const Joi = require('joi')
const { TIME_DIMENSION } = require('../controllers/analytics.controller')
const { pick } = require('lodash')

const analytics = {
/* - hora de inicio, marca de tiempo
	 * - hora de finalización, marca de tiempo
	 * - grupo grupo de dispositivos
	 * - dimensiones: [] dimensiones, actualmente no abierto
	 * - medida: indicador, actualmente no abierto, especifique COUNT(id)
	 * - timeDimension: dimensión de tiempo, la agrupación de tiempo puede ser por hora (deshabilitada), diaria, semanal (deshabilitada), mensual
	 */
	start: Joi.number(),
	end: Joi.number(),
	group: Joi.string().empty('').default(''),
	timeDimension: Joi.string()
		.valid(...Object.values(TIME_DIMENSION))
		.empty('')
		.default('')
}

module.exports = {
	// Duración de la llamada
	callDuration: {
		body: {
			...analytics,
			unit: Joi.number().default(60 * 1000)
		}
	},
	// resultado de la llamada
	callResult: {
		body: {
			...analytics
		}
	},

	// estadísticas de llamadas
	callStatistics: {
		body: pick(analytics, ['start', 'end', 'group'])
	},

	// estadísticas de llamadas
	alarmStatistics: {
		body: pick(analytics, ['start', 'end', 'group'])
	}
}
