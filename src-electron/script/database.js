// Cargar variables de entorno de forma segura
require('dotenv-safe').load({
	path: '.env',  // Archivo que contiene las variables de entorno
	sample: '.env.example'   // Archivo ejemplo que verifica que todas las variables necesarias estén definidas
})

const path = require('path')
appPath = require('../app-paths')
// Requiere módulos del directorio "data"
requireData = appPath.require.data
// Requiere módulos del directorio "api"
requireApi = mod => appPath.require.server(path.join('api', mod))
// Requiere módulos del directorio "config"
requireConfig = mod => appPath.require.server(path.join('config', mod))

// Crear archivo de base de datos
// Se indica que la base de datos debe inicializarse como un archivo local, no en el directorio del usuario
process.env.SEQUELIZE_DB_TYPE = 'default'
const db = require('../server/config/database')
db.sequelize.sync()
