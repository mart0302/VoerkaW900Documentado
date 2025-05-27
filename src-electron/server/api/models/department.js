const { Model, DataTypes } = require('sequelize')
const useTreeModel = require('../utils/sequelizeDept')

module.exports = (sequelize, { User }) => {
	class Department extends Model {}
	useTreeModel(Department)

	Department.init(
		{
			type: { type: DataTypes.STRING },
			title: { type: DataTypes.STRING }, // Título en español
			description: { type: DataTypes.STRING }, // Descripción del departamento
			logo: { type: DataTypes.STRING },
			open: {
				type: DataTypes.BOOLEAN,
				defaultValue: true
			},
			leader: {
				// Líder
				type: DataTypes.STRING,
				references: {
					model: User,
					key: 'username'
				},
				onDelete: 'SET NULL' // Al eliminar el dispositivo, este campo se establecerá como null, es decir, se desvinculará automáticamente
			},
			orderNumber: {
				type: DataTypes.INTEGER,
				defaultValue: 0
			}, // Orden de visualización
			related: {
				// Recursos relacionados, espacio reservado para futuras extensiones, [{type: 'keyMap', id: 1}, { type: 'user', id: 1 }]
				// Tipos e IDs dinámicos, no se puede implementar directamente la consulta de clave externa, no usar a menos que sea absolutamente necesario
				type: DataTypes.JSON,
				defaultValue: []
			},
			createdBy: {
				type: DataTypes.JSON,
				defaultValue: {}
			},
			phone: { type: DataTypes.STRING },
			email: { type: DataTypes.STRING }
		},
		{
			sequelize,
			modelName: 'Department',
			indexes: [{ fields: ['leader'] }]
		}
	)
	return Department
}
