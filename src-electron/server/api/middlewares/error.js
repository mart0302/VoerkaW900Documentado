const httpStatus = require('http-status')
const expressValidation = require('express-validation')
const APIError = require('../utils/APIError')
const { env } = require('../../config/vars')

/**
 * Error handler. Send stacktrace only during development
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
 * If error is not an instanceOf APIError, convert it.
 * @public
 */
exports.converter = (err, req, res, next) => {
	let convertedError = err

	// 数据校验没有通过
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
 * Catch 404 and forward to error handler
 * @public
 */
exports.notFound = (req, res, next) => {
	const err = new APIError({
		message: 'error.not_found',
		status: httpStatus.NOT_FOUND
	})
	return handler(err, req, res)
}
