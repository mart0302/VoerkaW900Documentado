/* 表排班 */
const { DataTypes } = require('sequelize')

module.exports = sequelize => {
	return sequelize.define(
		'ShiftScheduler',
		{
			type: { type: DataTypes.STRING },
			date: { type: DataTypes.NUMBER },
			start: { type: DataTypes.NUMBER },
			end: { type: DataTypes.NUMBER },
			type: { type: DataTypes.STRING }, //  资源类型
			users: { type: DataTypes.JSON }, // 排班人员
			nodeId: { type: DataTypes.NUMBER }, // 绑定节点
			// 以下数据仅做保留，其实没有用
			image: { type: DataTypes.STRING },
			createdBy: { type: DataTypes.JSON, defaultValue: {} }
		},
		{}
	)
}
