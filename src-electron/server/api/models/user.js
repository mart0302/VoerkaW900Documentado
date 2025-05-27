const { Model, DataTypes } = require('sequelize')
const { genToken } = requireApi('utils/index')
const { USER } = requireConfig('constant')
const { omit } = require('lodash')

module.exports = sequelize => {
	class User extends Model {
		// Crear token
		token() {
			return genToken({ id: this.username })
		}

		// Transformación
		// Algunos datos no se pueden devolver al frontend, como la contraseña
		transform() {
			return omit(this.toJSON(), ['password'])
		}
	}

	User.init(
		{
			resourceType: { type: DataTypes.STRING },
			username: { type: DataTypes.STRING, primaryKey: true }, // Nombre de usuario
			password: { type: DataTypes.STRING }, // Contraseña
			decryptPassword: { type: DataTypes.STRING }, // Contraseña descifrada
			role: { type: DataTypes.STRING, defaultValue: USER }, // Rol del usuario
			menus: { type: DataTypes.STRING }, // Permisos del usuario
			type: { type: DataTypes.STRING },
			age: { type: DataTypes.INTEGER },
			fullname: { type: DataTypes.STRING },
			sex: { type: DataTypes.INTEGER },
			address: { type: DataTypes.STRING },
			email: { type: DataTypes.STRING },
			mphone: { type: DataTypes.STRING },
			avatar: { type: DataTypes.STRING }, // URL del avatar
			path: { type: DataTypes.STRING }, // Múltiples paths separados por comas
			createdBy: {
				type: DataTypes.JSON,
				defaultValue: {}
			},
			code: { type: DataTypes.STRING },
			description: { type: DataTypes.STRING },
			birthplace: { type: DataTypes.STRING },
			certType: { type: DataTypes.STRING }, // Tipo de documento
			certNo: { type: DataTypes.STRING }, // Número de documento
			status: { type: DataTypes.BOOLEAN, defaultValue: true },
			deptId: { type: DataTypes.INTEGER }, // ID del departamento al que pertenece
			postId: { type: DataTypes.INTEGER }, // ID del puesto
			remarks: { type: DataTypes.STRING }
		},
		{
			sequelize,
			modelName: 'User'
		}
	)
	return User
}
