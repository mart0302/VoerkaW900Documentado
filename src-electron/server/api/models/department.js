const { Model, DataTypes } = require('sequelize')
const useTreeModel = require('../utils/sequelizeDept')

module.exports = (sequelize, { User }) => {
	class Department extends Model {}
	useTreeModel(Department)

	Department.init(
		{
			type: { type: DataTypes.STRING },
			title: { type: DataTypes.STRING }, // 中文标题
			description: { type: DataTypes.STRING }, // 部门描述
			logo: { type: DataTypes.STRING },
			open: {
				type: DataTypes.BOOLEAN,
				defaultValue: true
			},
			leader: {
				// leader
				type: DataTypes.STRING,
				references: {
					model: User,
					key: 'username'
				},
				onDelete: 'SET NULL' // 删除设备的时候会将本字段设置位null，就是自动解绑
			},
			orderNumber: {
				type: DataTypes.INTEGER,
				defaultValue: 0
			}, // 显示顺序
			related: {
				// 关联资源，为以后的扩展留空间， [{type: 'keyMap', id: 1}, { type: 'user', id: 1 }]
				// 动态的类型与id，无法直接实现外键查询，非不得已不使用
				type: DataTypes.JSON,
				defaultValue: []
			},
			createdBy: {
				type: DataTypes.JSON,
				defaultValue: {}
			},
			phone: { type: DataTypes.STRING },
			email: { type: DataTypes.STRING }
		},
		{
			sequelize,
			modelName: 'Department',
			indexes: [{ fields: ['leader'] }]
		}
	)
	return Department
}
