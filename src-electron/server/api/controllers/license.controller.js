/**
 * 设备授权，暂时弃用
 */
const { Op } = require('sequelize')
const path = require('path')
const fs = require('fs')
const fse = require('fs-extra')
const { installDeviceLicenseWatcher } = require('../../config/licenses')
const { upload: uploadConfig } = requireConfig('vars')
const { license: licenseConfig } = uploadConfig
const { destination } = licenseConfig
const licensePath = appPath.resolve.data(destination)

exports.load = async (req, res, next, id) => {
	try {
		const license = await $db.License.findOne({ where: { sn: id } })
		if (!license) {
			throw $APIError.NotFound()
		}
		req.locals = { license }
		return next()
	} catch (error) {
		return next(error)
	}
}

exports.get = (req, res) => res.json(req.locals.license)

exports.create = async (req, res, next) => {
	try {
		const { id, license } = req.body
		const device = await $db.Device.findByPk(id)
		if (!device) {
			throw $APIError.NotFound()
		}
		$log.info('destPath====', licensePath)
		// 判断目标目录是否存在，不存在需创建
		if (!fse.existsSync(licensePath)) {
			fse.mkdirsSync(licensePath)
		}
		// 证书文件
		fs.writeFileSync(path.join(licensePath, id + '.license'), license, 'utf8')
		$log.info('fs.writeFileSync========')
		let licenses = await $db.License.findOne({ where: { sn: id } })
		if (!licenses) {
			try {
				licenses = await $db.License.create({
					sn: id,
					url: `/${destination}/${id}.license`,
					type: device.type,
					fileName: id + '.license'
				})
				// 注册设备证书监听
				installDeviceLicenseWatcher({ sn: id, licenseFile: path.join(licensePath, id + '.license') })
			} catch (error) {
				// 409
				$log.info('create license error:', error)
				throw $APIError.Conflict()
			}
		}
		return res.json(licenses)
		// 返回
		// 因为chokdir有防抖1s，更换文件要隔一段时间才能得到验证结果，如果这面等待有点不妥
		// 此接口只负责覆盖证书，至于证书是否ok，需要前端自行isValid
	} catch (error) {
		return next(error)
	}
}

exports.list = async (req, res, next) => {
	try {
		let { limit, offset, ...query } = req.query
		//  特别参数的定制查询
		const qry = {}
		query.type && (qry.type = { [Op.eq]: query.type })

		const { count: total, rows: data } = await $db.License.findAndCountAll({
			limit,
			offset,
			where: qry,
			order: [['updatedAt', 'DESC']]
		})

		return res.json({
			limit,
			offset,
			total,
			data
		})
	} catch (error) {
		return next(error)
	}
}

exports.remove = async (req, res, next) => {
	const { license } = req.locals
	const { sn } = license
	try {
		// 先删除数据库记录
		await $db.License.destroy({
			where: { sn },
			individualHooks: true
		})
		// 删除文件
		fse.removeSync(path.join(licensePath, sn + '.license'))
		return res.json(license)
	} catch (error) {
		return next(error)
	}
}

// 证书记录删除
$db.License.addHook('afterDestroy', async (license, options) => {
	const { sn } = license
	// 删除证书文件
	// 删除文件
	fse.removeSync(path.join(licensePath, sn + '.license'))
})
