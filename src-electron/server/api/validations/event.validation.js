const Joi = require('joi')
const { TRANSACTION_RESULT } = require('@voerka/messager')

module.exports = {
	// Eliminación por lotes
	removeEvents: {
		body: {
			ids: Joi.array().items(Joi.string())
		}
	},

	// Obtener lista
	listEvents: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0),
			message: Joi.string().trim(), // información
			code: Joi.string(), // Buscar por código de evento
			type: Joi.string(), // Eventos/Alarmas
			group: Joi.string(), // Búsqueda de grupo
			path: Joi.string(), // Búsqueda de rutas semánticas
			level: Joi.number(), // nivel
			status: Joi.string(), // Estado de alarma
			result: Joi.string(), // 告警结果
			tid: Joi.string(), // Actas
			sn: Joi.string(), // equipo
			triggerTime: Joi.string(), // Tiempo de activación
			handleTime: Joi.string() // Tiempo de procesamiento
		}
	},

	// Manejo de alarmas
	handleAlarm: {
		body: {
			result: Joi.number()
				.valid(...Object.values(TRANSACTION_RESULT).filter(item => item >= TRANSACTION_RESULT.COMPLETED))
				.required(),
			remarks: Joi.string().empty('').default(''),
			resultTitle: Joi.string().empty('').default(''),
			syncTransaction: Joi.boolean().default(true) // Si finalizar la transacción sincrónicamente
		}
	}
}
