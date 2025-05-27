const httpStatus = require('http-status')
const expressValidation = require('express-validation')
const APIError = require('../utils/APIError')
const { env } = require('../../config/vars')

/**
 * Manejador de errores. Envía el stacktrace solo durante el desarrollo
 * @public
 */
const handler = (err, req, res, next) => {
	let message = err.message || httpStatus[err.status]
	if (err.message && err.message.startsWith('error.')) {
		message = req.__(err.message) || message
	}
	const response = {
		code: err.status,
		message: message,
		errors: err.errors,
		stack: err.stack
	}

	if (env !== 'development') {
		delete response.stack
	}

	res.status(err.status)
	res.json(response)
}
exports.handler = handler

/**
 * Si el error no es una instancia de APIError, convertirlo.
 * @public
 */
exports.converter = (err, req, res, next) => {
	let convertedError = err

	// La validación de datos no ha pasado
	if (err instanceof expressValidation.ValidationError) {
		convertedError = new APIError({
			message: 'error.validate',
			errors: err.errors,
			status: err.status,
			stack: err.stack
		})
	} else if (!(err instanceof APIError)) {
		convertedError = new APIError({
			message: err.message,
			status: err.status,
			stack: err.stack
		})
	}

	return handler(convertedError, req, res)
}

/**
 * Captura error 404 y lo envía al manejador de errores
 * @public
 */
exports.notFound = (req, res, next) => {
	const err = new APIError({
		message: 'error.not_found',
		status: httpStatus.NOT_FOUND
	})
	return handler(err, req, res)
}
