const { DataTypes } = require('sequelize')
const { EVENT_TYPE } = requireConfig('constant')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

// método de inicialización
module.exports = sequelize => {
	return sequelize.define(
		'Notification',
		{
			title: { type: DataTypes.STRING },
			from: { type: DataTypes.JSON, defaultValue: { id: 'admin', type: 'user' } },
			to: { type: DataTypes.JSON },
			sendTime: { type: DataTypes.DATE, defaultValue: null }, // tiempo de envío
			receiveTime: { type: DataTypes.DATE, defaultValue: new Date() }, // tiempo de recepción
			status: { type: DataTypes.NUMBER },
			type: { type: DataTypes.STRING }, // método de notificación: nodo/recurso
			content: { type: DataTypes.STRING },
			receipt: { type: DataTypes.STRING },
			star: { type: DataTypes.BOOLEAN, defaultValue: false }, // marcar con estrella
			content: { type: DataTypes.STRING }, // título, heredado del último evento
			receivers: { type: DataTypes.JSON }, // receptores
			projekt: { type: DataTypes.BOOLEAN, defaultValue: false } // borrador
			// sn (clave externa)
		},
		{}
	)
}
