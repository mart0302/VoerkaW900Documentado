const { DataTypes } = require('sequelize')

module.exports = sequelize => {
	return sequelize.define(
		'Device',
		{
			sn: { type: DataTypes.STRING, primaryKey: true }, // [Propiedad] Número de serie del dispositivo
			parent: { type: DataTypes.STRING }, // [Propiedad] Número de serie del dispositivo padre
			type: { type: DataTypes.STRING }, // [Propiedad] Tipo de dispositivo
			title: { type: DataTypes.STRING }, // [Propiedad] Nombre del dispositivo
			version: { type: DataTypes.STRING }, // [Propiedad] Versión del firmware
			networks: { type: DataTypes.JSON }, // [Propiedad] Red
			mqtt: { type: DataTypes.JSON }, // [Propiedad] mqtt, { broker, username, password, domain }
			location: { type: DataTypes.JSON }, // [Propiedad] Ubicación de instalación, { label, long, lati }
			// Los siguientes datos se mantienen solo como reserva, realmente no se usan
			source: { type: DataTypes.STRING }, // [Propiedad]
			model: { type: DataTypes.STRING }, // [Propiedad]
			wifi: { type: DataTypes.JSON }, // [Propiedad] { ap: WIFI_AP, enable: WIFI_Enable, password: WIFI_Password, secret: WIFI_Secret }
			authorized: { type: DataTypes.BOOLEAN }, // [Propiedad]
			configPort: { type: DataTypes.NUMBER }, // [Propiedad]
			header: { type: DataTypes.STRING }, // [Propiedad]
			// Campos nuevos
			workerID: { type: DataTypes.NUMBER }, // [Propiedad] Identifica la máquina, usado para generar tid, generalmente sin problemas, 0-1023
			online: { type: DataTypes.BOOLEAN }, // [Estado] Estado en línea del dispositivo, no se nombró como status para facilitar consultas, sin aplicación más profunda
			nodeId: { type: DataTypes.NUMBER }, // [Propiedad] ID del nodo vinculado al dispositivo actual
			// Campos personalizados del dispositivo
			attrs: { type: DataTypes.JSON, defaultValue: {} }, // Propiedades adicionales según tipo de dispositivo
			status: { type: DataTypes.JSON, defaultValue: {} } // Estados adicionales según tipo de dispositivo
		},
		{}
	)
}
