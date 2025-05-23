const Sequelize = require('sequelize')

const config = appPath.loadSequelizeConfig(process.env.SEQUELIZE_DB_TYPE)

// process.env.SEQUELIZE_DB_TYP = default 代表目标数据库为初始化数据目录下数据库，即当前只是脚本跑种子文件
// process.env.SEQUELIZE_DB_TYP = user 代表目标数据库为用户目录下的数据库，即当前是正常运行

if (!process.env.SEQUELIZE_DB_TYPE && $userConfig.sequelizeLogging) {
	const logger = require('./logger')
	config.logging = msg => {
		logger.info('[sequelize]', msg)
	}
}

const db = {}
const sequelize = new Sequelize(config.database, config.username, config.password, config)

const models = requireApi('models/index')(sequelize)
Object.assign(db, models)

db.sequelize = sequelize

module.exports = db
