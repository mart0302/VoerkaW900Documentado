const { Model, DataTypes } = require('sequelize')
const { NETWORK } = requireConfig('constant')

module.exports = sequelize => {
	class TtsAudio extends Model {
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
				// Causará un error de desbordamiento de pila, así que se reescribió toJSON en su lugar
				// get() {
				// 	const { host, port } = $userConfig
				// 	// Convertir ruta relativa a absoluta
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
