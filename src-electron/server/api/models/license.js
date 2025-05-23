/**
 * 设备授权，暂时弃用
 */
const { Model, DataTypes } = require('sequelize')

module.exports = (sequelize, { Device }) => {
	class License extends Model {
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

	License.init(
		{
			fileName: { type: DataTypes.STRING },
			fileSize: { type: DataTypes.NUMBER },
			result: { type: DataTypes.JSON, defaultValue: null },
			remarks: { type: DataTypes.STRING },
			type: { type: DataTypes.STRING },
			message: { type: DataTypes.STRING },
			checked: { type: DataTypes.BOOLEAN },
			url: {
				type: DataTypes.STRING
			}
		},
		{
			sequelize,
			modelName: 'License'
		}
	)
	return License
}
