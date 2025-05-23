/**
 * TODO：根据用户菜单未后端API授权
 */
// 用户角色权限中间件
const passport = require('passport')
const { ROLES } = require('../../config/constant')
const { intersection } = require('lodash')

const handleJWT = (req, res, next, roles, paths) => async (err, user, info) => {
	let apiError = $APIError.Unauthorized()
	// 字符串直接转成数组
	typeof roles === 'string' && (roles = [roles])
	const menus = user.menus ? user.menus.split(',') : []
	let isAuthorize = false
	// 如果菜单在用户权限之内
	if (intersection(menus, paths).length > 0) {
		isAuthorize = true
	}
	// 如果角色不在roles里面则返回403
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
