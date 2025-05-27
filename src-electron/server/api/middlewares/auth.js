/**
 * TODO: Autorización de API backend según el menú del usuario
 */
// Middleware de permisos de roles de usuario
const passport = require('passport')
const { ROLES } = require('../../config/constant')
const { intersection } = require('lodash')

const handleJWT = (req, res, next, roles, paths) => async (err, user, info) => {
	let apiError = $APIError.Unauthorized()
	// Convertir directamente la cadena en array
	typeof roles === 'string' && (roles = [roles])
	const menus = user.menus ? user.menus.split(',') : []
	let isAuthorize = false
	// Si el menú está dentro de los permisos del usuario
	if (intersection(menus, paths).length > 0) {
		isAuthorize = true
	}
	// Si el rol no está en roles, devolver 403
	if (!isAuthorize && user && !roles.includes(user.role)) {
		apiError = $APIError.Forbidden()
		return next(apiError)
	} else if (err || !user) {
		return next(err || apiError)
	}

	req.user = user

	return next()
}

exports.authorize =
	(roles = ROLES, paths = []) =>
	(req, res, next) =>
		passport.authenticate('jwt', { session: false }, handleJWT(req, res, next, roles, paths))(req, res, next)
