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

// Caché key-value
exports.useKVCache = function useCache({ max = 200, life = 60 * 60 * 1000 } = {}) {
	// Pool de caché
	const caches = {}

	// Limpiar caché
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

	// Obtener de la caché
	function get(key) {
		// Limpiar caché primero
		cleanCache()
		// Luego obtener
		const hit = caches[key]
		if (!hit || hit.expired < Date.now()) {
			delete caches[key]
			return undefined
		} else {
			return hit.value
		}
	}

	// Establecer caché
	function set(key, value = undefined) {
		if (value) {
			// Recalcular tiempo
			caches[key] = { expired: Date.now() + life, value }
		} else {
			delete caches[key]
		}
	}

	// Consulta
	return {
		get,
		set
	}
}

// Generar token
exports.genToken = function ({ id, type = RES_TYPE_USER }) {
	const payload = {
		exp: moment().add(jwtExpirationDays, 'days').unix(),
		iat: moment().unix(),
		sub: id,
		type
	}
	return jwt.encode(payload, jwtSecret)
}

// Convierte una cadena en un array de números
function parseArrayNum(str) {
	return str
		.split(',')
		.map(item => Number(item))
		.filter(item => item !== NaN)
}
exports.parseArrayNum = parseArrayNum

// Convierte una cadena en una consulta de tiempo
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
	// isEmpty no puede comprobar Symbol
	return empty ? undefined : query
}
