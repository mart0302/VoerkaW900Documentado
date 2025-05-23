const { Model, DataTypes } = require('sequelize')
const useTreeModel = require('../utils/sequelizeTree')
const { INTERCOM_PUSH_TYPE } = requireConfig('constant')

module.exports = (sequelize, { Device }) => {
	class Navigation extends Model {}
	useTreeModel(Navigation)

	Navigation.init(
		{
			title: { type: DataTypes.STRING }, // 中文标题
			device: {
				// device并不需要外键查询，所以直接定义外键，而不是用“关联”
				type: DataTypes.STRING,
				references: {
					model: Device,
					key: 'sn'
				},
				onDelete: 'SET NULL' // 删除设备的时候会将本字段设置位null，就是自动解绑
			},
			related: {
				// 关联资源，为以后的扩展留空间， [{type: 'keyMap', id: 1}, { type: 'user', id: 1 }]
				// 动态的类型与id，无法直接实现外键查询，非不得已不使用
				type: DataTypes.JSON,
				defaultValue: []
			},
			subscription: { type: DataTypes.BOOLEAN, defaultValue: false }, // 是否订阅美一云
			intercom: { type: DataTypes.STRING, defaultValue: null }, // 是否开启对讲机功能，如果开启，该字段为网关sn， 如果没开启则为null
			pushType: { type: DataTypes.STRING, defaultValue: INTERCOM_PUSH_TYPE.ALL } // 对讲语音推送类型；0：全部，1： 呼叫消息， 2：通知消息
		},
		{
			sequelize,
			modelName: 'Navigation',
			indexes: [{ fields: ['device'] }]
		}
	)
	return Navigation
}
