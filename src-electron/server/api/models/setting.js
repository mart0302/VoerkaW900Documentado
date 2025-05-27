'use strict'
const { Model, DataTypes } = require('sequelize')

module.exports = sequelize => {
	class Setting extends Model {}

	Setting.init(
		{
			// clave
			key: { type: DataTypes.STRING, primaryKey: true },
			// todos los valores
			value: { type: DataTypes.JSON },
			// descripción
			description: { type: DataTypes.STRING }
		},
		{
			sequelize,
			modelName: 'Setting'
		}
	)
	return Setting
}
