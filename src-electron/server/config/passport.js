// express解析Bearer Token
// 理论上也是中间件，但是普遍且在路由之前，所以沿随模板使用
const JwtStrategy = require('passport-jwt').Strategy
const { ExtractJwt } = require('passport-jwt')
const { jwtSecret } = require('./vars')
const { RES_TYPE_DEVICE } = require('./constant')

const jwtOptions = {
	secretOrKey: jwtSecret,
	jwtFromRequest: ExtractJwt.fromAuthHeaderWithScheme('Bearer')
}

const jwt = async (payload, done) => {
	try {
		const { type, sub } = payload
		if (type === RES_TYPE_DEVICE) {
			// 设备类型
			const device = await $db.Device.findByPk(sub)
			if (device)
				return done(null, {
					...device.toJSON(),
					role: RES_TYPE_DEVICE
				})
		} else {
			const user = await $db.User.findByPk(sub)
			if (user) return done(null, user.toJSON())
		}
		return done(null, false)
	} catch (error) {
		return done(error, false)
	}
}

exports.jwt = new JwtStrategy(jwtOptions, jwt)
