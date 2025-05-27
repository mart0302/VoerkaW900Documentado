const httpStatus = require('http-status')

/**
 * @extends Error
 */
class ExtendableError extends Error {
	constructor({ message, errors, status, isPublic, stack }) {
		super(message)
		this.name = this.constructor.name
		this.message = message
		this.errors = errors
		this.status = status
		this.isPublic = isPublic
		this.isOperational = true // This is required since bluebird 4 doesn't append it anymore.
		this.stack = stack
		// Error.captureStackTrace(this, this.constructor.name);
	}
}

/**
 * Clase que representa un error de API.
 * @extends ExtendableError
 */
class APIError extends ExtendableError {
	/**
	 * Crea un error de API.
	 * @param {string} message - Mensaje de error.
	 * @param {number} status - Código de estado HTTP del error.
	 * @param {boolean} isPublic - Si el mensaje debe ser visible para el usuario o no.
	 */
	constructor({ message, errors, stack, status = httpStatus.INTERNAL_SERVER_ERROR, isPublic = false }) {
		super({
			message,
			errors,
			status,
			isPublic,
			stack
		})
	}
}

// 401 usuario no tiene permisos de acceso, necesita autenticación
APIError.Unauthorized = function (message) {
	return new APIError({
		status: httpStatus.UNAUTHORIZED,
		message: message || 'error.unauthorized'
	})
}

// 403 permisos insuficientes
APIError.Forbidden = function (message) {
	return new APIError({
		status: httpStatus.FORBIDDEN,
		message: message || 'error.forbidden'
	})
}

// 404
APIError.NotFound = function (message) {
	return new APIError({
		status: httpStatus.NOT_FOUND,
		message: message || 'error.not_found'
	})
}

// 409 conflicto de recursos
APIError.Conflict = function (message) {
	return new APIError({
		status: httpStatus.CONFLICT,
		message: message || 'error.conflict'
	})
}

// 400 bad request solicitud incorrecta, error del usuario
APIError.BadRequest = function (message) {
	return new APIError({
		status: httpStatus.BAD_REQUEST,
		message: message || 'error.bad_request'
	})
}

// vincular también el status
APIError.STATUS = httpStatus

module.exports = APIError
