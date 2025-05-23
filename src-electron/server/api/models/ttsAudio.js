const { Model, DataTypes } = require('sequelize')
const { NETWORK } = requireConfig('constant')

module.exports = sequelize => {
	class TtsAudio extends Model {
		// express返回数据自动转换肯定调用了这个方法，重写即可
		toJSON() {
			const { host, port } = $userConfig
			const data = Model.prototype.toJSON.call(this)
			// 将相对路径转为绝对路径
			// 其他资源无所谓，因为前后端端口一致肯定可以获取到，但是升级包的地址是要给设备的，所以必须指明host与port
			data.url = `http://${host}:${port}${data.url}`
			return data
		}
	}

	TtsAudio.init(
		{
			id: { type: DataTypes.STRING, primaryKey: true },
			gatewaySn: { type: DataTypes.STRING },
			description: { type: DataTypes.STRING },
			fileName: { type: DataTypes.STRING },
			fileSize: { type: DataTypes.NUMBER },
			callerSn: { type: DataTypes.STRING },
			path: { type: DataTypes.STRING },
			message: { type: DataTypes.STRING },
			remarks: { type: DataTypes.STRING },
			type: { type: DataTypes.STRING },
			orderId: { type: DataTypes.NUMBER },
			url: {
				type: DataTypes.STRING
				// 会引起调用栈溢出的错误，所以重写了toJSON代替
				// get() {
				// 	const { host, port } = $userConfig
				// 	// 将相对路径转为绝对路径
				// 	return `http://${host}:${port}${this.url}`
				// }
			},
			status: { type: DataTypes.BOOLEAN }
		},
		{
			sequelize,
			modelName: 'TtsAudio'
		}
	)

	return TtsAudio
}
