'use strict'
const { Model, DataTypes } = require('sequelize')

module.exports = sequelize => {
	class Setting extends Model {}

	Setting.init(
		{
			// llave
			key: { type: DataTypes.STRING, primaryKey: true },
			// valores
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
