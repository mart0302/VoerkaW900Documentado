/* 表排班组 */
const { DataTypes } = require('sequelize')

module.exports = sequelize => {
	return sequelize.define(
		'ScheduleGroup',
		{
			type: { type: DataTypes.STRING },
			start: { type: DataTypes.DATE, defaultValue: new Date() },
			end: { type: DataTypes.DATE, defaultValue: new Date() },
			type: { type: DataTypes.STRING }, //  资源类型
			ranges: { type: DataTypes.JSON }, // 排班时间范围
			nodeId: { type: DataTypes.NUMBER }, // 绑定节点
			// 以下数据仅做保留，其实没有用
			image: { type: DataTypes.STRING },
			createdBy: { type: DataTypes.JSON, defaultValue: {} }
		},
		{}
	)
}
