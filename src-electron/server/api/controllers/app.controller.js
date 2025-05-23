const fs = require('fs')
const path = require('path')

// .dat目录
const LICENSE_DIR = appPath.resolve.data(process.env.LICENSE_DIR)
// 证书文件
const LICENSE_FILE = path.resolve(LICENSE_DIR, process.env.LICENSE_NAME)

// 获取应用是否授权
exports.isValid = async (req, res, next) => {
	return res.json({
		...$licenseValidResult,
		sn: $$SN
	})
}

// 主动检查是否授权
// 【弃用】：已经实现上传证书后自动检查
exports.checkValid = async (req, res, next) => {
	try {
		// 检查证书
		await $watcher.checkLicense()

		return res.json({
			...$licenseValidResult,
			sn: $$SN
		})
	} catch (error) {
		return next(error)
	}
}

// 保存证书
exports.saveLicense = async (req, res, next) => {
	const { license } = req.body
	try {
		fs.writeFileSync(LICENSE_FILE, license, 'utf8')

		// 返回
		// 因为chokdir有防抖1s，更换文件要隔一段时间才能得到验证结果，如果这面等待有点不妥
		// 此接口只负责覆盖证书，至于证书是否ok，需要前端自行isValid
		return res.json({
			sn: $$SN
		})
	} catch (error) {
		return next(error)
	}
}
