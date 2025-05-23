const { DataTypes } = require('sequelize')

module.exports = sequelize => {
	return sequelize.define(
		'Device',
		{
			sn: { type: DataTypes.STRING, primaryKey: true }, // 【属性】设备序列号
			parent: { type: DataTypes.STRING }, // 【属性】 父设备序列号
			type: { type: DataTypes.STRING }, // 【属性】 设备类型
			title: { type: DataTypes.STRING }, // 【属性】 设备名称
			version: { type: DataTypes.STRING }, // 【属性】 固件版本
			networks: { type: DataTypes.JSON }, //【属性】 网络
			mqtt: { type: DataTypes.JSON }, // 【属性】 mqtt, { broker, username, password, domain }
			location: { type: DataTypes.JSON }, // 【属性】 安装位置， { label, long, lati }
			// 以下数据仅做保留，其实没有用
			source: { type: DataTypes.STRING }, // 【属性】
			model: { type: DataTypes.STRING }, // 【属性】
			wifi: { type: DataTypes.JSON }, // 【属性】 { ap: WIFI_AP, enable: WIFI_Enable, password: WIFI_Password, secret: WIFI_Secret },
			authorized: { type: DataTypes.BOOLEAN }, // 【属性】
			configPort: { type: DataTypes.NUMBER }, // 【属性】
			header: { type: DataTypes.STRING }, // 【属性】
			// 新增字段
			workerID: { type: DataTypes.NUMBER }, // 【属性】标识机器，用于生成tid，一般不会出事，0-1023
			online: { type: DataTypes.BOOLEAN }, // 【状态】备在线状态，之所以不写成status，是因为方便查询，无更深层次应用
			nodeId: { type: DataTypes.NUMBER }, // 【属性】当前设备绑定的节点id
			// 设备个性化字段
			attrs: { type: DataTypes.JSON, defaultValue: {} }, // 设备类型的额外属性
			status: { type: DataTypes.JSON, defaultValue: {} } // 设备类型的额外状态
		},
		{}
	)
}
