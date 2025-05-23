const { Model, DataTypes } = require('sequelize')
const { genToken } = requireApi('utils/index')
const { USER } = requireConfig('constant')
const { omit } = require('lodash')

module.exports = sequelize => {
	class User extends Model {
		// 创建token
		token() {
			return genToken({ id: this.username })
		}

		// 转换
		// 返回给前端，有些数据是不能返回的，比如password
		transform() {
			return omit(this.toJSON(), ['password'])
		}
	}

	User.init(
		{
			resourceType: { type: DataTypes.STRING },
			username: { type: DataTypes.STRING, primaryKey: true }, // 用户名
			password: { type: DataTypes.STRING }, // 密码
			decryptPassword: { type: DataTypes.STRING }, // 密码
			role: { type: DataTypes.STRING, defaultValue: USER }, // 用户角色
			menus: { type: DataTypes.STRING }, // 用户权限
			type: { type: DataTypes.STRING },
			age: { type: DataTypes.INTEGER },
			fullname: { type: DataTypes.STRING },
			sex: { type: DataTypes.INTEGER },
			address: { type: DataTypes.STRING },
			email: { type: DataTypes.STRING },
			mphone: { type: DataTypes.STRING },
			avatar: { type: DataTypes.STRING }, // 头像url
			path: { type: DataTypes.STRING }, // 以逗号,隔开，多个path
			createdBy: {
				type: DataTypes.JSON,
				defaultValue: {}
			},
			code: { type: DataTypes.STRING },
			description: { type: DataTypes.STRING },
			birthplace: { type: DataTypes.STRING },
			certType: { type: DataTypes.STRING }, // 证件类型
			certNo: { type: DataTypes.STRING }, // 证件号
			status: { type: DataTypes.BOOLEAN, defaultValue: true },
			deptId: { type: DataTypes.INTEGER }, // 所属部门id
			postId: { type: DataTypes.INTEGER }, // 岗位id,
			remarks: { type: DataTypes.STRING }
		},
		{
			sequelize,
			modelName: 'User'
		}
	)
	return User
}
