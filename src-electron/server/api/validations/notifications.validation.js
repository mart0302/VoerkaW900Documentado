const Joi = require('joi')

module.exports = {
	// crear
	createNotice: {
		body: {
			type: Joi.string(),
			title: Joi.string(),
			content: Joi.string(),
			status: Joi.string(),
			star: Joi.boolean().default(false), // Si marcar estrellas
			receivers: Joi.array(),
			sendTime: Joi.string().default(null)
		}
	},
	// Eliminación por lotes
	removeNotices: {
		body: {
			ids: Joi.array().items(Joi.number())
		}
	},

	// Obtener lista
	listNotices: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0),
			to: Joi.object({
				type: Joi.string(),
				id: Joi.alternatives().try(Joi.number(), Joi.string()).required()
			}), // información
			from: Joi.object({
				type: Joi.string(),
				id: Joi.alternatives().try(Joi.number(), Joi.string()).required()
			}), // información
			status: Joi.string(), // Resultados de la alarma
			star: Joi.boolean(), // Buscar por código de evento
			title: Joi.string(), // Eventos/Alarmas
			sendTime: Joi.string() // Búsqueda de grupo
		}
	},

	// Manejo de notificaciones
	handleNotice: {
		body: {
			type: Joi.string(),
			receivers: Joi.array(),
			gateways: Joi.array(),
			title: Joi.string(),
			content: Joi.string(),
			status: Joi.string(),
			star: Joi.boolean().default(false) // Si marcar estrellas
		}
	},
	// Publicar notificaciones en plataformas de servicios de terceros
	publishNotice: {
		body: {
			id: Joi.array().required(), // Identificación del nodo
			title: Joi.string().empty('').default(''), // Título de la notificación, puede estar vacío, este campo no se envía al reloj.
			content: Joi.string().required(), // Contenido del mensaje enviado al reloj
			type: Joi.string().default('node')
		}
	}
}
