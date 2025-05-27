const express = require('express')
const morgan = require('morgan')
const bodyParser = require('body-parser')
const compress = require('compression')
const methodOverride = require('method-override')
const cors = require('cors')
const helmet = require('helmet')
const passport = require('passport')
const routes = require('../api/routes/v1')
const { logs } = require('./vars')
const strategies = require('./passport')
const error = require('../api/middlewares/error')
const i18n = require('./i18n')

/**
 * Instancia de Express
 * @public
 */
const app = express()

// hacer pública la carpeta de datos del usuario
app.use(express.static(appPath.dataDir))

// hacer pública la carpeta web public (no es útil en entorno de desarrollo, pero proporciona la ejecución web en producción)
app.use(express.static(appPath.publicDir))

// registro de solicitudes. dev: consola | producción: archivo
app.use(morgan(logs))

// analizar parámetros del body y adjuntarlos a req.body
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

// compresión gzip
app.use(compress())

// permite usar verbos HTTP como PUT o DELETE
// en lugares donde el cliente no los soporta
app.use(methodOverride())

// asegurar aplicaciones configurando varias cabeceras HTTP
app.use(helmet())

// habilitar CORS - Compartición de Recursos de Origen Cruzado
app.use(cors())

// habilitar autenticación
app.use(passport.initialize())
passport.use('jwt', strategies.jwt)

// internacionalización
app.use(i18n.init)

// montar rutas de api v1
app.use('/api/v1', routes)

// todas las interfaces de tipo voerka devuelven 200 ok
app.use('/apps', (req, res, next) => {
	return res.json({ OK: true })
})

// si el error no es una instancia de APIError, convertirlo
app.use(error.converter)

// capturar 404 y enviar al manejador de errores
app.use(error.notFound)

// manejador de errores, envía stacktrace solo durante desarrollo
app.use(error.handler)

module.exports = app
