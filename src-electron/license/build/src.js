// 密码 ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓
const password = '********';
// 密码 ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑

// 源码本码区 ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓ ↓↓↓↓↓↓↓↓
// maincodebegin
require('bytenode')
const ms = require('ms')
const fs = require('fs')
const path = require('path')
const openpgp = require('openpgp')
const crypto = require('crypto')
const querystring = require('querystring')

const DEFAULT_CHECK_INTERVAL = 600000

const EVENTS = {
	started: 'started',
	valid: 'valid',
	invalid: 'invalid',
	checked: 'checked',
	stopped: 'stopped',
	error: 'error'
}

const SET_DATA = Symbol('setData')
const SET_DURA = Symbol('setDuration')
const CHK_DURA = Symbol('checkDuration')
const CALLBACK = Symbol('callback')

function paddingLeft(str, wid) {
	return ' '.repeat(Math.floor((wid - String(str).length) / 2))
}
function paddingRight(str, wid) {
	return ' '.repeat(Math.ceil((wid - String(str).length) / 2))
}

class DataDirEmptyError extends Error {
	constructor() {
		super('data directory is required')
	}
}
class LicenseEmptyError extends Error {
	constructor() {
		super('license is required')
	}
}
class publicKeyEmptyError extends Error {
	constructor() {
		super('public key is required')
	}
}
class paramsRequiredError extends Error {
	constructor(params) {
		params = Array.isArray(params) ? params : [params]
		super(`parameters <${params.join(',')}> is required`)
	}
}
class paramsIllegalError extends Error {
	constructor(params) {
		params = Array.isArray(params) ? params : [params]
		super(`parameters <${JSON.stringify(params)}> is illegal`)
	}
}

class LicenseAheadofBeginDateError extends Error {
	constructor() {
		super('license is ahead of begin date')
	}
}

class LicenseInvalidError extends Error {
	constructor(message) {
		message = message instanceof Error ? message.message : message
		message ? super(`license is invalid: ${message}`) : super('license is invalid')
	}
}
class LicenseOutofDateError extends Error {
	constructor() {
		super('license is out of date')
	}
}
class SystemTimeAbnormalError extends Error {
	constructor() {
		super('system time is abnormal')
	}
}
class DataAbnormalError extends Error {
	constructor(message) {
		message ? super(`data is abnormal: ${message}`) : super('data is abnormal')
	}
}

class DeviceNotInLicensedListError extends Error {
	constructor(sn) {
		super(`device <${sn}> not in licensed list`)
	}
}
class DeviceTypeNotInLicensedListError extends Error {
	constructor(type) {
		super(`device type <${type}> not in licensed list`)
	}
}

class VoerkaLicenseWatcher {
	constructor({
		license,
		publicKey,
		device,
		dataDir,
		checkInterval = DEFAULT_CHECK_INTERVAL,
		debug = false,
		enableSystemTimeCheck = true
	} = {}) {
		if (!dataDir) throw new DataDirEmptyError()
		if (!license) throw new LicenseEmptyError()
		if (!publicKey) throw new publicKeyEmptyError()

		this.valid = false
		this.licensePassed = false
		this.license = license
		this.publicKey = publicKey
		this.device = device || {}
		this.dataFile = path.join(dataDir, '.dat')
		this.checking = false
		this.checkInterval = checkInterval
		this.checkIntervalId = null
		this.callbacks = {
			[EVENTS.started]: [],
			[EVENTS.valid]: [],
			[EVENTS.invalid]: [],
			[EVENTS.checked]: [],
			[EVENTS.stopped]: [],
			[EVENTS.error]: []
		}
		this.running = false
		this.debug = debug
		this.enableSystemTimeCheck = enableSystemTimeCheck
	}

	async start() {
		if (this.running) return
		this.running = true
		// 监听事件
		this.on(EVENTS.valid, () => (this.valid = true))
		this.on(EVENTS.invalid, e => {
			this.valid = false
			this.licenseInvalidError = e
		})
		// 检查授权码
		this.licensePassed = await this.checkLicense()
		this[CALLBACK](EVENTS.started)
		// 检查并校正参数合法性
		if (!Number.isInteger(this.checkInterval) || this.checkInterval < 0) {
			this.checkInterval = DEFAULT_CHECK_INTERVAL
		}
		// 不断检查生效时长
		;(async function check() {
			this.checking = true
			await this[CHK_DURA]()
			this.checking = false
			this.checkIntervalId = setTimeout(check.bind(this), this.checkInterval)
		}.call(this))
	}

	async refreshLicense(newLicense) {
		this.license = newLicense
		this.licensePassed = await this.checkLicense()
		await this[CHK_DURA]()
	}

	async checkLicense() {
		let message = await openpgp.cleartext.readArmored(this.license)
		let publicKeys = (await openpgp.key.readArmored(this.publicKey)).keys

		let verified = await openpgp.verify({ message, publicKeys })
		let { valid } = verified.signatures[0]

		if (valid) {
			this.rawLicenseData = querystring.parse(message.text.replace(/^.*\?/, ''))
			let {
				$version,
				$releasedAt,
				$validBeginAt,
				$validEndAt,
				$validDuration,
				$devices,
				$deviceTypes,
				$deviceNumbers,
				$accountNumbers,
				$useTimes,
				$activationCode,
				$accessTos
			} = this.rawLicenseData
			this.version = $version
			this.releasedAt = new Date(Number($releasedAt))
			this.activationCode = $activationCode
			this.accessTos = $accessTos

			this.validBeginAt = $validBeginAt ? new Date(Number($validBeginAt) || $validBeginAt || 0) : new Date()
			this.validEndAt = $validEndAt ? new Date(Number($validEndAt) || $validEndAt || 0) : new Date('2099-12-31')
			if (Number.isNaN(this.validBeginAt.getTime()) || Number.isNaN(this.validEndAt.getTime())) {
				valid = this[CALLBACK](EVENTS.invalid)
			} else {
				// 如果指定了生效时长，则覆盖生效截止，故重新计算生效截止
				this.validDuration = $validDuration ? ms($validDuration) : this.validEndAt - this.validBeginAt
				this.validEndAt = new Date(this.validBeginAt.getTime() + this.validDuration)
				this.devices = $devices ? $devices.split(',').filter(x => x) : []
				this.deviceTypes = $deviceTypes ? $deviceTypes.split(',').filter(x => x) : []
				let { sn: deviceSn, type: deviceType } = this.device
				if (this.devices.length && !this.devices.includes(deviceSn)) {
					valid = this[CALLBACK](EVENTS.invalid, new DeviceNotInLicensedListError(deviceSn))
				} else if (deviceType && this.deviceTypes.length && !this.deviceTypes.includes(deviceType)) {
					valid = this[CALLBACK](EVENTS.invalid, new DeviceTypeNotInLicensedListError(deviceType))
				}
				$deviceNumbers = Number($deviceNumbers)
				$accountNumbers = Number($accountNumbers)
				$useTimes = Number($useTimes)
				this.deviceNumbers = Number.isInteger($deviceNumbers) ? $deviceNumbers : 0
				this.accountNumbers = Number.isInteger($accountNumbers) ? $accountNumbers : 0
				this.useTimes = Number.isInteger($useTimes) ? $useTimes : 0
			}
			this.licenseData = {
				$version: this.version,
				$releasedAt: this.releasedAt,
				$validBeginAt: this.validBeginAt,
				$validEndAt: this.validEndAt,
				$validDuration: this.validDuration,
				$devices: this.devices,
				$deviceTypes: this.deviceTypes,
				$deviceNumbers: this.deviceNumbers,
				$accountNumbers: this.accountNumbers,
				$useTimes: this.useTimes,
				$activationCode: this.activationCode,
				$accessTos: this.accessTos
			}
			this.genCertificate()
		} else {
			this[CALLBACK](EVENTS.invalid, this.licenseInvalidError || new LicenseInvalidError())
		}

		return !!valid
	}
	genCertificate() {
		let VERSION = this.version
		let RELEASED_AT = this.releasedAt.toLocaleString()
		let VALID_BEGIN_AT = this.validBeginAt.toLocaleString()
		let VALID_END_AT = this.validEndAt.toLocaleDateString()
		let VALID_DURATION = ms(this.validDuration, { long: true, decimal: 2 })
		let CERT_DEVICES = this.devices
		this.certificate = `
        +----------------------+----------------------+
        |                   LICENSE                   |
        |                 CERTIFICATE                 |
        +----------------------+----------------------+
        | VERSION              |${paddingLeft(VERSION, 22)}${VERSION}${paddingRight(VERSION, 22)}|
        +----------------------+----------------------+
        | RELEASED AT          |${paddingLeft(RELEASED_AT, 22)}${RELEASED_AT}${paddingRight(RELEASED_AT, 22)}|
        +----------------------+----------------------+
        | VALID BEGIN AT       |${paddingLeft(VALID_BEGIN_AT, 22)}${VALID_BEGIN_AT}${paddingRight(VALID_BEGIN_AT, 22)}|
        +----------------------+----------------------+
        | VALID END AT         |${paddingLeft(VALID_END_AT, 22)}${VALID_END_AT}${paddingRight(VALID_END_AT, 22)}|
        +----------------------+----------------------+
        `
	}
	async [CHK_DURA]() {
		try {
			if (!this.licensePassed) this[CALLBACK](EVENTS.invalid, this.licenseInvalidError || new LicenseInvalidError())
			else {
				let now = new Date(),
					duration = now - this.validBeginAt
				if (duration < 0) {
					this[CALLBACK](EVENTS.invalid, new LicenseAheadofBeginDateError())
				} else if (now > this.validEndAt) {
					this[CALLBACK](EVENTS.invalid, new LicenseOutofDateError())
				} else if (this.enableSystemTimeCheck) {
					this.validatedDuration = await this.getDuration()
					if (duration < this.validatedDuration) {
						this[CALLBACK](EVENTS.invalid, new SystemTimeAbnormalError())
					} else {
						await this[SET_DURA](duration)
						this[CALLBACK](EVENTS.valid)
					}
				} else {
					this[CALLBACK](EVENTS.valid)
				}
			}
			this[CALLBACK](EVENTS.checked)
		} catch (e) {
			this[CALLBACK](EVENTS.error, e)
			this[CALLBACK](EVENTS.invalid, e)
		}
	}

	async getDuration() {
		if (!this.validatedDuration) this.validatedDuration = (await this.getData()).validatedDuration
		return this.validatedDuration
	}
	async [SET_DURA](value) {
		await this[SET_DATA]({ validatedDuration: value })
		this.validatedDuration = value
	}

	async getData() {
		let _password = this.debug || password
		try {
			let key = crypto.createHash('sha256').update(_password).digest().slice(0, 32)
			let iv = key.slice(0, 16)
			let decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
			let readEncrypedData = fs.readFileSync(this.dataFile)
			let decryptedData = Buffer.concat([decipher.update(readEncrypedData), decipher.final()])
			return JSON.parse(decryptedData.toString())
		} catch (e) {
			throw new DataAbnormalError(e.message)
		}
	}
	async [SET_DATA](update) {
		let _password = this.debug || password
		let key = crypto.createHash('sha256').update(_password).digest().slice(0, 32)
		let iv = key.slice(0, 16)
		let cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
		let data = JSON.stringify(Object.assign(await this.getData(), update))
		let encryptedData = Buffer.concat([cipher.update(data), cipher.final()])
		fs.writeFileSync(this.dataFile, encryptedData, 'utf8')
	}

	on(event, callback) {
		this.callbacks[event] && this.callbacks[event].push(callback)
		return this
	}
	[CALLBACK](event, ...args) {
		this.callbacks[event].forEach(cb => cb(...args))
	}

	async restart() {
		await this.stop()
		await this.start()
	}

	async stop() {
		if (!this.running) return
		clearInterval(this.checkIntervalId)
		this.checking && (await new Promise(resolve => this.on(EVENTS.checked, resolve)))
		this[CALLBACK](EVENTS.stopped)
		this.running = false
	}
}

module.exports = {
	VoerkaLicenseWatcher,
	LicenseEmptyError,
	publicKeyEmptyError,
	paramsRequiredError,
	LicenseAheadofBeginDateError,
	LicenseInvalidError,
	LicenseOutofDateError,
	SystemTimeAbnormalError
}
// maincodeend
// 源码本码区 ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑ ↑↑↑↑↑↑↑↑
