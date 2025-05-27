const validate = require('express-validation')
const { pick, padStart } = require('lodash')
const multer = require('multer')
const { CMD } = require('../../config/protocols')
const { encodeMessage } = require('../../../utils.js')

// Middleware de filtrado y validación de datos
exports.validate = schema => (req, res, next) => {
	// Si query es una cadena vacía, significa que no se consulta este dato, se elimina
	Object.keys(req.query).forEach(key => {
		if (req.query[key].trim() === '') {
			delete req.query[key]
		}
	})
	// Filtra los datos, si no están definidos en el schema, no se pasan al siguiente middleware
	req.body = pick(req.body, Object.keys(schema.body || {}))
	// Si hay error, se lanza
	validate(schema)(req, res, next)
}

// Middleware de carga multer
const getMulter = options => {
	const upload = multer(options).single('file')

	const { limits = {} } = options
	const { fileSize = 200 * 1024, files = 1 } = limits

	let maxSize = Math.floor(fileSize / 1024)
	maxSize = maxSize > 1024 ? Math.floor(fileSize / 1024) + 'MB' : maxSize + 'KB'

	return (req, res, next) => {
		upload(req, res, error => {
			if (error) {
				if (error.message === 'File too large') {
					return next($APIError.BadRequest(req.__('error.upload_file_too_large', maxSize)))
				} else if (error.message === 'Too many files') {
					return next($APIError.BadRequest(req.__('error.upload_too_many_files', files)))
				}
			}
			next(error)
		})
	}
}

// Segunda encapsulación del middleware de carga
exports.upload = options => {
	const { types, maxSize, destination } = options
	const typesArr = types.split(',')
	return getMulter({
		dest: destination,
		limits: { fileSize: maxSize, files: 1 },
		fileFilter(req, file, cb) {
			const { mimetype } = file
			if (!mimetype || !typesArr.some(item => mimetype.indexOf(item) > -1)) {
				return cb($APIError.BadRequest(req.__('error.upload_file_type_error', types)))
			}
			return cb(null, true)
		}
	})
}

// Middleware de codificación
exports.encode = (req, res, next) => {
	const data = req.body
	const { action } = req.params
	if (!action || typeof action !== 'string') {
		throw $APIError.BadRequest('error.action_error')
	}
	if (['wireless_watch_transparent', 'wireless_transmitter_transparent'].indexOf(action) == -1) {
		next()
	} else {
		let { cmd } = data
		if (!CMD[cmd]) {
			throw $APIError.BadRequest('error.action_error')
		}
		$log.info('encode device, action++++++++++++++', data, action)
		let message = encodeMessage(data)
		req.body = { message }
		next()
	}
}
// Verificación de certificado y activación de software
exports.activated = (req, res, next) => {
	if ($licenseValidResult.result) {
		next()
	} else {
		next(new $APIError.Forbidden())
	}
}
