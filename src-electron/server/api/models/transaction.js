const { Model, DataTypes } = require('sequelize')
const { EVENT_TYPE } = requireConfig('constant')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

// método de inicialización
module.exports = sequelize => {
	class Transaction extends Model {}
	Transaction.init(
		{
			id: { type: DataTypes.STRING, primaryKey: true }, // ID de transacción, generado por algoritmo snowflake, se almacena como string porque puede ser un número grande

			status: { type: DataTypes.NUMBER, defaultValue: TRANSACTION_STATUS.PROGRESSING },
			result: { type: DataTypes.NUMBER, defaultValue: TRANSACTION_RESULT.HANDLING },
			progress: { type: DataTypes.NUMBER, defaultValue: 0 }, // progreso de la transacción
			precaution: { type: DataTypes.BOOLEAN, defaultValue: false },
			startTime: { type: DataTypes.DATE, defaultValue: new Date() },
			completeTime: { type: DataTypes.DATE },
			duration: { type: DataTypes.NUMBER }, // duración (milisegundos), calculada para facilitar estadísticas y mejorar el rendimiento
			// desarrollo de negocio actual: las transacciones pueden ser diversas, pero el frontend necesita filtrar las "transacciones de llamada", por lo que debe registrar el evento inicial y la alarma
			// heredar del primer evento o alarma, solo copia de datos
			type: { type: DataTypes.STRING, defaultValue: EVENT_TYPE.EVENT }, // evento o alarma
			code: { type: DataTypes.NUMBER },
			group: { type: DataTypes.STRING },
			path: { type: DataTypes.STRING },
			remarks: { type: DataTypes.STRING }, // notas, heredadas del último evento
			title: { type: DataTypes.STRING }, // título, heredado del último evento
			originalPayload: { type: DataTypes.JSON }, // información original, heredada del último evento
			// sn (clave externa)
			handler: { type: DataTypes.JSON } // dispositivo de manejo
		},
		{
			sequelize,
			modelName: 'Transaction',
			indexes: [{ fields: ['type'] }, { fields: ['code'] }, { fields: ['path'] }, { fields: ['sn'] }]
		}
	)
	return Transaction
}
