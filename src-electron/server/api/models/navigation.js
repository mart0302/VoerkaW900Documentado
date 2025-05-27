const { Model, DataTypes } = require('sequelize')
const useTreeModel = require('../utils/sequelizeTree')
const { INTERCOM_PUSH_TYPE } = requireConfig('constant')

module.exports = (sequelize, { Device }) => {
	class Navigation extends Model {}
	useTreeModel(Navigation)

	Navigation.init(
		{
			title: { type: DataTypes.STRING }, // Título en español
			device: {
				// device no necesita consulta de clave externa, así que se define directamente la clave externa en lugar de usar "relación"
				type: DataTypes.STRING,
				references: {
					model: Device,
					key: 'sn'
				},
				onDelete: 'SET NULL' // Al eliminar el dispositivo, este campo se establecerá como null, es decir, se desvinculará automáticamente
			},
			related: {
				// Recursos relacionados, espacio reservado para futuras extensiones, [{type: 'keyMap', id: 1}, { type: 'user', id: 1 }]
				// Tipos e IDs dinámicos, no se puede implementar directamente la consulta de clave externa, no usar a menos que sea absolutamente necesario
				type: DataTypes.JSON,
				defaultValue: []
			},
			subscription: { type: DataTypes.BOOLEAN, defaultValue: false }, // Si está suscrito a MeiYiYun
			intercom: { type: DataTypes.STRING, defaultValue: null }, // Si la función de intercomunicador está habilitada, este campo será el sn de la puerta de enlace, si no está habilitada será null
			pushType: { type: DataTypes.STRING, defaultValue: INTERCOM_PUSH_TYPE.ALL } // Tipo de envío de voz del intercomunicador; 0: todos, 1: mensajes de llamada, 2: mensajes de notificación
		},
		{
			sequelize,
			modelName: 'Navigation',
			indexes: [{ fields: ['device'] }]
		}
	)
	return Navigation
}
