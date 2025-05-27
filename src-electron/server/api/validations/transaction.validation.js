const Joi = require('joi')
const { TRANSACTION_RESULT } = require('@voerka/messager')

module.exports = {
	// Eliminación por lotes
	removeTransactions: {
		body: {
			ids: Joi.array().items(Joi.string())
		}
	},

	// Obtener lista
	listTransactions: {
		query: {
			limit: Joi.number().integer().min(1).max(1000).default(20),
			offset: Joi.number().integer().min(0).default(0),
			title: Joi.string().trim(), // información
			status: Joi.string(), // Estado de alarma
			result: Joi.string(), // Resultados de la alarma
			code: Joi.string(), // Buscar por código de evento
			type: Joi.string(), // Eventos/Alarmas
			group: Joi.string(), // Búsqueda de grupo
			path: Joi.string(), // Búsqueda de rutas semánticas
			sn: Joi.string(), // equipo
			startTime: Joi.string(), // Tiempo de activación
			completeTime: Joi.string() // Tiempo de procesamiento
		}
	},

	// Manejo de transacciones
	handleTransactions: {
		body: {
			result: Joi.number()
				.valid(...Object.values(TRANSACTION_RESULT))
				.required(),
			progress: Joi.number().min(1).max(100),
			remarks: Joi.string().empty('').default(''),
			path: Joi.string().empty('').default(''),
			handler: Joi.object({
				sn: Joi.string().min(12).max(12).lowercase().required(),
				title: Joi.string().empty('').default(''),
				type: Joi.string().empty('').default('')
			})
		}
	}
}
