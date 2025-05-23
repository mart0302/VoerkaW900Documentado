/**
 * 用于设备证书检测
 */
require('bytenode')
const appPath = require('../app-paths')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const chokidar = require('chokidar')
const { debounce } = require('lodash')

// 证书公钥
const PUBLIC_KEY = require('./public.key')
// 默认证书(防止证书被删除，watcher报错，后面如果实在不想要默认50个，可以直接赋值随机字符串，只要不是空字符串就行)
// const DEFAULT_LICENSE = require('./default.license')
// jsc编译密码
const LICENSE_PWD = process.env.LICENSE_PWD
// .dat目录
const LICENSE_DIR = appPath.resolve.data(process.env.LICENSE_DIR)
// 证书文件
// const LICENSE_FILE = path.resolve(LICENSE_DIR, process.env.LICENSE_NAME)
// jsc文件(监听器src编译之后的结果)
const WATCHER_FILE = require.resolve('./index.jsc')
// 监听器jsc的md5，用于校验监听器是否被改动过
const WATCHER_FILE_MD5 = fs.readFileSync(path.resolve(__dirname, '.md5'), 'utf8')

// 读取证书
function getLicense(file) {
	let data = file
	if (fs.existsSync(file)) {
		data = fs.readFileSync(file, 'utf8') || data
	}
	return data
}

// 获取监听器
module.exports = function getWatcher({ licenseFile, checkInterval = 60 * 1000, sn } = {}) {
	// 先校验证书监视器源码文件是否被篡改，即 MD5 是否匹配
	// 注意：MD5 在使用者的程序中应自行保证不被篡改，例如替换 md5 值为生成该值的函数并立即执行，再将其编译为字节码
	// 如果文件 md5 与提供的 md5 匹配则引入并使用
	if (WATCHER_FILE_MD5 === crypto.createHash('md5').update(fs.readFileSync(WATCHER_FILE)).digest('hex')) {
		const { VoerkaLicenseWatcher } = require(WATCHER_FILE)

		try {
			// 实例化一个 voerka 证书监视器
			const watcher = new VoerkaLicenseWatcher({
				license: getLicense(licenseFile),
				publicKey: PUBLIC_KEY,
				device: { sn },
				dataDir: LICENSE_DIR,
				checkInterval,
				debug: LICENSE_PWD,
				enableSystemTimeCheck: false
			})
			// 监听证书变化，变化后重新赋值给watcher
			chokidar.watch(licenseFile).on(
				'all',
				debounce(() => {
					// 重新检查证书
					watcher.refreshLicense(getLicense(licenseFile))
				}, 1000)
			)
			return watcher
		} catch (e) {
			// 当监视异常时，也就是证书失效时，做点什么
			throw new Error(`create watcher error：${e.message}`)
		}
	} else {
		// voerka 证书监视器文件被篡改时，也就是证书失效时，做点什么
		throw new Error('index.jsc md5 invalid')
	}
}
