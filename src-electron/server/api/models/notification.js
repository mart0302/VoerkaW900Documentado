const { DataTypes } = require('sequelize')
const { EVENT_TYPE } = requireConfig('constant')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

// 初始化方法
module.exports = sequelize => {
	return sequelize.define(
		'Notification',
		{
			title: { type: DataTypes.STRING },
			from: { type: DataTypes.JSON, defaultValue: { id: 'admin', type: 'user' } },
			to: { type: DataTypes.JSON },
			sendTime: { type: DataTypes.DATE, defaultValue: null }, // 发送时间
			receiveTime: { type: DataTypes.DATE, defaultValue: new Date() }, // 接收时间
			status: { type: DataTypes.NUMBER },
			type: { type: DataTypes.STRING }, // 通知方式：节点/资源
			content: { type: DataTypes.STRING },
			receipt: { type: DataTypes.STRING },
			star: { type: DataTypes.BOOLEAN, defaultValue: false }, // 备注, 继承最后一个事件
			content: { type: DataTypes.STRING }, // 标题，继承最后一个事件
			receivers: { type: DataTypes.JSON }, // 接收者
			projekt: { type: DataTypes.BOOLEAN, defaultValue: false } // 草稿
			// sn(外键)
		},
		{}
	)
}
