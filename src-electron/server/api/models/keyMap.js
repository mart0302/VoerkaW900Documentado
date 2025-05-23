const { DataTypes } = require('sequelize')

module.exports = sequelize => {
	return sequelize.define(
		'KeyMap',
		{
			value: { type: DataTypes.JSON, defaultValue: {} }
		},
		{}
	)
}
