/**
 * Ajuste del módulo de registro del servidor, integración unificada con el registro de electron 2021.7.24 por scl
 *
 * Nota: Si necesita separar el servidor para ejecutarlo de forma independiente, consulte los commits anteriores y restaure
 */
// const log = require('electron-log')
const log = $log

const levels = ['error', 'warn', 'info', 'verbose', 'debug', 'silly']

const logger = levels.reduce((t, key) => {
	t[key] = (...params) => {
		return log[key]('[server]', ...params)
	}
	return t
}, {})

module.exports = logger
