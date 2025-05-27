const Sequelize = require('sequelize')

const config = appPath.loadSequelizeConfig(process.env.SEQUELIZE_DB_TYPE)

// process.env.SEQUELIZE_DB_TYPE = default significa que la base de datos de destino está en el directorio de inicialización de datos, es decir, actualmente solo se ejecutan los archivos semilla
// process.env.SEQUELIZE_DB_TYPE = user significa que la base de datos de destino está en el directorio del usuario, es decir, actualmente está en ejecución normal

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
