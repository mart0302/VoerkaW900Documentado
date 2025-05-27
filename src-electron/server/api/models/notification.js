const { DataTypes } = require('sequelize')
const { EVENT_TYPE } = requireConfig('constant')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

// Método de inicialización
module.exports = sequelize => {
	return sequelize.define(
		'Notification',
		{
			title: { type: DataTypes.STRING },
			from: { type: DataTypes.JSON, defaultValue: { id: 'admin', type: 'user' } },
			to: { type: DataTypes.JSON },
			sendTime: { type: DataTypes.DATE, defaultValue: null }, // Tiempo de envío
			receiveTime: { type: DataTypes.DATE, defaultValue: new Date() }, // Tiempo de recepción
			status: { type: DataTypes.NUMBER },
			type: { type: DataTypes.STRING }, // Método de notificación: nodo/recurso
			content: { type: DataTypes.STRING },
			receipt: { type: DataTypes.STRING },
			star: { type: DataTypes.BOOLEAN, defaultValue: false }, // Observación, hereda del último evento
			content: { type: DataTypes.STRING }, // Título, hereda del último evento
			receivers: { type: DataTypes.JSON }, // Destinatarios
			projekt: { type: DataTypes.BOOLEAN, defaultValue: false } // Borrador
			// sn (clave externa)
		},
		{}
	)
}
