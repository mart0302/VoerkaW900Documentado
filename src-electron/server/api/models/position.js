const { DataTypes } = require('sequelize')

module.exports = sequelize => {
	return sequelize.define(
		'Position',
		{
			type: { type: DataTypes.STRING },
			title: { type: DataTypes.STRING }, // Título en español
			description: { type: DataTypes.STRING }, // Descripción del puesto
			code: { type: DataTypes.STRING },
			open: {
				type: DataTypes.BOOLEAN,
				defaultValue: true
			},
			orderNumber: {
				type: DataTypes.INTEGER
			}, // Orden de visualización
			createdBy: {
				type: DataTypes.JSON,
				defaultValue: {}
			},
			remark: { type: DataTypes.STRING }
		},
		{}
	)
}
