const { Model, DataTypes } = require('sequelize')
const { EVENT_TYPE } = requireConfig('constant')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

// Método de inicialización
module.exports = sequelize => {
	class Transaction extends Model {}
	Transaction.init(
		{
			id: { type: DataTypes.STRING, primaryKey: true }, // ID de transacción, generado por algoritmo snowflake, se almacena como string porque puede ser un número grande

			status: { type: DataTypes.NUMBER, defaultValue: TRANSACTION_STATUS.PROGRESSING },
			result: { type: DataTypes.NUMBER, defaultValue: TRANSACTION_RESULT.HANDLING },
			progress: { type: DataTypes.NUMBER, defaultValue: 0 }, // Progreso de la transacción
			precaution: { type: DataTypes.BOOLEAN, defaultValue: false },
			startTime: { type: DataTypes.DATE, defaultValue: new Date() },
			completeTime: { type: DataTypes.DATE },
			duration: { type: DataTypes.NUMBER }, // Duración (en milisegundos), calculada para facilitar estadísticas posteriores y mejorar un poco el rendimiento
			// Lógica de negocio actual: las transacciones pueden ser de varios tipos, pero el frontend necesita filtrar las "transacciones de llamada",
			// por lo que es necesario registrar el evento o alarma inicial
			// Hereda del primer evento o alarma, solo es una copia de datos
			type: { type: DataTypes.STRING, defaultValue: EVENT_TYPE.EVENT }, // Si es evento o alarma
			code: { type: DataTypes.NUMBER },
			group: { type: DataTypes.STRING },
			path: { type: DataTypes.STRING },
			remarks: { type: DataTypes.STRING }, // Observaciones, hereda del último evento
			title: { type: DataTypes.STRING }, // Título, hereda del último evento
			originalPayload: { type: DataTypes.JSON }, // Información original, hereda del último evento
			// sn (clave externa)
			handler: { type: DataTypes.JSON } // Dispositivo de procesamiento
		},
		{
			sequelize,
			modelName: 'Transaction',
			indexes: [{ fields: ['type'] }, { fields: ['code'] }, { fields: ['path'] }, { fields: ['sn'] }]
		}
	)
	return Transaction
}
