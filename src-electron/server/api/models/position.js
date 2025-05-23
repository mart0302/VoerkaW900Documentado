const { DataTypes } = require('sequelize')

module.exports = sequelize => {
	return sequelize.define(
		'Position',
		{
			type: { type: DataTypes.STRING },
			title: { type: DataTypes.STRING }, // 中文标题
			description: { type: DataTypes.STRING }, // 部门描述
			code: { type: DataTypes.STRING },
			open: {
				type: DataTypes.BOOLEAN,
				defaultValue: true
			},
			orderNumber: {
				type: DataTypes.INTEGER
			}, // 显示顺序
			createdBy: {
				type: DataTypes.JSON,
				defaultValue: {}
			},
			remark: { type: DataTypes.STRING }
		},
		{}
	)
}
