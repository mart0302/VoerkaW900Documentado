const { DataTypes } = require('sequelize')
const { EVENT_TYPE } = requireConfig('constant')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

// 初始化方法
module.exports = sequelize => {
	return sequelize.define(
		'Event',
		{
			id: { type: DataTypes.STRING, primaryKey: true }, // 事件id
			type: { type: DataTypes.STRING, defaultValue: EVENT_TYPE.EVENT }, // 事件还是告警
			code: { type: DataTypes.NUMBER },
			message: { type: DataTypes.STRING },
			remarks: { type: DataTypes.STRING }, // 备注
			location: { type: DataTypes.JSON },
			level: { type: DataTypes.NUMBER, defaultValue: 1 }, // 1-5, 最严重是5
			// 设备信息
			group: { type: DataTypes.STRING },
			path: { type: DataTypes.STRING },
			// 原始信息
			originalPayload: { type: DataTypes.JSON },
			triggerTime: { type: DataTypes.DATE, defaultValue: new Date() },
			receiveTime: { type: DataTypes.DATE, defaultValue: new Date() },
			// 告警独有
			handleTime: { type: DataTypes.DATE },
			status: { type: DataTypes.NUMBER, defaultValue: TRANSACTION_STATUS.PROGRESSING },
			result: { type: DataTypes.NUMBER, defaultValue: TRANSACTION_RESULT.HANDLING },
			userId: { type: DataTypes.STRING } // user.username, 不是强制性的外键
			// tid(外键)
			// sn(外键)
		},
		{
			indexes: [{ fields: ['type'] }, { fields: ['code'] }, { fields: ['path'] }]
		}
	)
}
