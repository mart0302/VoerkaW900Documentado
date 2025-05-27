const { Model, DataTypes } = require('sequelize')
const { NETWORK } = requireConfig('constant')

module.exports = sequelize => {
	class Package extends Model {
		// express devuelve datos que automáticamente llaman a este método, solo hay que sobrescribirlo
		toJSON() {
			const { host, port } = $userConfig
			const data = Model.prototype.toJSON.call(this)
			// Convertir rutas relativas a absolutas
			// Para otros recursos no importa, ya que con puertos coincidentes entre frontend y backend seguramente se podrán obtener,
			// pero la dirección del paquete de actualización es para el dispositivo, así que host y port deben especificarse
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
				// Causará un error de desbordamiento de pila, así que se reescribió toJSON en su lugar
				// get() {
				// 	const { host, port } = $userConfig
				// 	// Convertir ruta relativa a absoluta
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
