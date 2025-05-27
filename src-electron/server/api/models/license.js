/**
 * Autorización de dispositivos, temporalmente en desuso
 */
const { Model, DataTypes } = require('sequelize')

module.exports = (sequelize, { Device }) => {
	class License extends Model {
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
