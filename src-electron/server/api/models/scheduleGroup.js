/* Grupo de programación de turnos */
const { DataTypes } = require('sequelize')

module.exports = sequelize => {
	return sequelize.define(
		'ScheduleGroup',
		{
			type: { type: DataTypes.STRING },
			start: { type: DataTypes.DATE, defaultValue: new Date() },
			end: { type: DataTypes.DATE, defaultValue: new Date() },
			type: { type: DataTypes.STRING }, // Tipo de recurso
			ranges: { type: DataTypes.JSON }, // Rangos de tiempo para la programación
			nodeId: { type: DataTypes.NUMBER }, // Nodo vinculado
			// Los siguientes datos se mantienen solo como reserva, realmente no se usan
			image: { type: DataTypes.STRING },
			createdBy: { type: DataTypes.JSON, defaultValue: {} }
		},
		{}
	)
}
