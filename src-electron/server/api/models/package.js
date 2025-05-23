const { Model, DataTypes } = require('sequelize')
const { NETWORK } = requireConfig('constant')

module.exports = sequelize => {
	class Package extends Model {
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

	Package.init(
		{
			id: { type: DataTypes.STRING, primaryKey: true },
			apps: { type: DataTypes.JSON },
			date: { type: DataTypes.STRING },
			description: { type: DataTypes.STRING },
			fileName: { type: DataTypes.STRING },
			fileSize: { type: DataTypes.NUMBER },
			hardware: { type: DataTypes.STRING },
			md5: { type: DataTypes.STRING },
			models: { type: DataTypes.JSON },
			remarks: { type: DataTypes.STRING },
			type: { type: DataTypes.STRING },
			version: { type: DataTypes.STRING },
			url: {
				type: DataTypes.STRING
				// 会引起调用栈溢出的错误，所以重写了toJSON代替
				// get() {
				// 	const { host, port } = $userConfig
				// 	// 将相对路径转为绝对路径
				// 	return `http://${host}:${port}${this.url}`
				// }
			},
			versions: { type: DataTypes.JSON }
		},
		{
			sequelize,
			modelName: 'Package'
		}
	)

	return Package
}
