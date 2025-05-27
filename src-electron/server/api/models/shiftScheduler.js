/* Programación de turnos */
const { DataTypes } = require('sequelize')

module.exports = sequelize => {
	return sequelize.define(
		'ShiftScheduler',
		{
			type: { type: DataTypes.STRING },
			date: { type: DataTypes.NUMBER },
			start: { type: DataTypes.NUMBER },
			end: { type: DataTypes.NUMBER },
			type: { type: DataTypes.STRING }, // Tipo de recurso
			users: { type: DataTypes.JSON }, // Personal programado
			nodeId: { type: DataTypes.NUMBER }, // Nodo vinculado
			// Los siguientes datos se mantienen solo como reserva, en realidad no se usan
			image: { type: DataTypes.STRING },
			createdBy: { type: DataTypes.JSON, defaultValue: {} }
		},
		{}
	)
}
