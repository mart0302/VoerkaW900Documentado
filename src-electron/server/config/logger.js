/**
 * 调整server日志模块，统一接入electron日志 2021.7.24 by scl
 *
 * 注: 如果要分离出server单独运行，请查阅之前的commit，还原即可
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
