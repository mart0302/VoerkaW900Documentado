'use strict'
const { Model, DataTypes } = require('sequelize')

module.exports = sequelize => {
	class Setting extends Model {}

	Setting.init(
		{
			// key
			key: { type: DataTypes.STRING, primaryKey: true },
			// 所有的值
			value: { type: DataTypes.JSON },
			// 描述
			description: { type: DataTypes.STRING }
		},
		{
			sequelize,
			modelName: 'Setting'
		}
	)
	return Setting
}
