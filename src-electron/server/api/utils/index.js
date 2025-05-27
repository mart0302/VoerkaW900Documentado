const { mergeWith, isArray, cloneDeep, isEmpty } = require('lodash')
const moment = require('moment-timezone')
const jwt = require('jwt-simple')
const { jwtSecret, jwtExpirationDays } = requireConfig('vars')
const { RES_TYPE_USER } = requireConfig('constant')
const { Op } = require('sequelize')

exports.mergeDeepRight = function (object, other) {
	function customizer(objValue, srcValue) {
		if (isArray(objValue)) {
			return srcValue
		}
	}
	return mergeWith(cloneDeep(object), other, customizer)
}

// caché
exports.useCache = function useCache(fetch, { max = 200, life = 3 * 60 * 1000, onUpdate = () => {} } = {}) {
	// grupo de caché
	const caches = {}

	// limpiar caché
	function cleanCache() {
		const hits = Object.entries(caches)
		const nowTime = Date.now()
		if (hits.length > max) {
			hits.forEach(item => {
				const [id, hit] = item
				if (hit.expired < nowTime) {
					delete caches[id]
				}
			})
		}
	}

	// obtener del caché
	async function get(id) {
		const hit = caches[id]
		if (!hit || hit.expired < Date.now()) {
			const value = await fetch(id)
			if (value) {
				caches[id] = { expired: Date.now() + life, value }
				return value
			} else {
				return null
			}
		} else {
			return hit.value
		}
	}

	// establecer caché
	async function set(id, value = null) {
		if (value) {
			// recalcular tiempo
			caches[id] = { expired: Date.now() + life, value }
		} else {
			delete caches[id]
		}
	}

	// mecanismo de actualización
	// hay un problema con el nombre, se optimizará después
	onUpdate(set)

	// consulta
	return async id => {
		// obtener
		const value = await get(id)

		// mantener caché
		cleanCache()

		return value
	}
}

// 缓存 key-value缓存
exports.useKVCache = function useCache({ max = 200, life = 60 * 60 * 1000 } = {}) {
	// 缓存池
	const caches = {}

	// 清理缓存
	function cleanCache() {
		const hits = Object.entries(caches)
		const nowTime = Date.now()
		if (hits.length > max) {
			hits.forEach(item => {
				const [key, hit] = item
				if (hit.expired < nowTime) {
					delete caches[key]
				}
			})
		}
	}

	// 从缓存中获取
	function get(key) {
		// 先清缓存
		cleanCache()
		// 再获取
		const hit = caches[key]
		if (!hit || hit.expired < Date.now()) {
			delete caches[key]
			return undefined
		} else {
			return hit.value
		}
	}

	// 设置缓存
	function set(key, value = undefined) {
		if (value) {
			// 时间重新计算
			caches[key] = { expired: Date.now() + life, value }
		} else {
			delete caches[key]
		}
	}

	// 查询
	return {
		get,
		set
	}
}

// 生成token
exports.genToken = function ({ id, type = RES_TYPE_USER }) {
	const payload = {
		exp: moment().add(jwtExpirationDays, 'days').unix(),
		iat: moment().unix(),
		sub: id,
		type
	}
	return jwt.encode(payload, jwtSecret)
}

// 字符串转数组
function parseArrayNum(str) {
	return str
		.split(',')
		.map(item => Number(item))
		.filter(item => item !== NaN)
}
exports.parseArrayNum = parseArrayNum

// 字符串转时间查询
exports.parseTimeQuyer = function (str) {
	let empty = true
	const query = {}
	const times = parseArrayNum(str)
	if (times[0]) {
		query[Op.gte] = times[0]
		empty = false
	}
	if (times[1]) {
		query[Op.lte] = times[1]
		empty = false
	}
	// isEmpty 判断不了Symbol
	return empty ? undefined : query
}
