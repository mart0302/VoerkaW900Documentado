const { DataTypes } = require('sequelize')
const { EVENT_TYPE } = requireConfig('constant')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

// Método de inicialización
module.exports = sequelize => {
	return sequelize.define(
		'Event',
		{
			id: { type: DataTypes.STRING, primaryKey: true }, // ID del evento
			type: { type: DataTypes.STRING, defaultValue: EVENT_TYPE.EVENT }, // Si es evento o alarma
			code: { type: DataTypes.NUMBER },
			message: { type: DataTypes.STRING },
			remarks: { type: DataTypes.STRING }, // Observaciones
			location: { type: DataTypes.JSON },
			level: { type: DataTypes.NUMBER, defaultValue: 1 }, // 1-5, 5 es el más grave
			// Información del dispositivo
			group: { type: DataTypes.STRING },
			path: { type: DataTypes.STRING },
			// Información original
			originalPayload: { type: DataTypes.JSON },
			triggerTime: { type: DataTypes.DATE, defaultValue: new Date() },
			receiveTime: { type: DataTypes.DATE, defaultValue: new Date() },
			// Exclusivo para alarmas
			handleTime: { type: DataTypes.DATE },
			status: { type: DataTypes.NUMBER, defaultValue: TRANSACTION_STATUS.PROGRESSING },
			result: { type: DataTypes.NUMBER, defaultValue: TRANSACTION_RESULT.HANDLING },
			userId: { type: DataTypes.STRING } // user.username, no es una clave externa obligatoria
			// tid (clave externa)
			// sn (clave externa)
		},
		{
			indexes: [{ fields: ['type'] }, { fields: ['code'] }, { fields: ['path'] }]
		}
	)
}
