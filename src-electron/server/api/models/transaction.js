const { Model, DataTypes } = require('sequelize')
const { EVENT_TYPE } = requireConfig('constant')
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')

// 初始化方法
module.exports = sequelize => {
	class Transaction extends Model {}
	Transaction.init(
		{
			id: { type: DataTypes.STRING, primaryKey: true }, // 事务id，雪花算法生成，生成的数可能是大数，所以用string存储

			status: { type: DataTypes.NUMBER, defaultValue: TRANSACTION_STATUS.PROGRESSING },
			result: { type: DataTypes.NUMBER, defaultValue: TRANSACTION_RESULT.HANDLING },
			progress: { type: DataTypes.NUMBER, defaultValue: 0 }, // 事务进度
			precaution: { type: DataTypes.BOOLEAN, defaultValue: false },
			startTime: { type: DataTypes.DATE, defaultValue: new Date() },
			completeTime: { type: DataTypes.DATE },
			duration: { type: DataTypes.NUMBER }, // 持续时间（毫秒），顺便算出，方便后面统计，多多少少提高一点性能也好
			// 此次开发业务: 事务可能是多种多样的，但是前端要过滤出“呼叫事务”，所以必须记录事务的开头事件、告警
			// 继承第一个事件或告警，只是数据拷贝
			type: { type: DataTypes.STRING, defaultValue: EVENT_TYPE.EVENT }, // 事件还是告警
			code: { type: DataTypes.NUMBER },
			group: { type: DataTypes.STRING },
			path: { type: DataTypes.STRING },
			remarks: { type: DataTypes.STRING }, // 备注, 继承最后一个事件
			title: { type: DataTypes.STRING }, // 标题，继承最后一个事件
			originalPayload: { type: DataTypes.JSON }, // 原始信息, 继承最后一个事件
			// sn(外键)
			handler: { type: DataTypes.JSON } // 处理设备
		},
		{
			sequelize,
			modelName: 'Transaction',
			indexes: [{ fields: ['type'] }, { fields: ['code'] }, { fields: ['path'] }, { fields: ['sn'] }]
		}
	)
	return Transaction
}
