/**
 * Autorización de dispositivos, temporalmente en desuso
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
		// Verificar si existe el directorio destino, crearlo si no existe
		if (!fse.existsSync(licensePath)) {
			fse.mkdirsSync(licensePath)
		}
		// Archivo de licencia
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
				// Registrar monitor de licencia del dispositivo
				installDeviceLicenseWatcher({ sn: id, licenseFile: path.join(licensePath, id + '.license') })
			} catch (error) {
				// Error 409
				$log.info('create license error:', error)
				throw $APIError.Conflict()
			}
		}
		return res.json(licenses)
		// Retornar
		// Debido a que chokidar tiene un debounce de 1s, el resultado de la validación tarda un tiempo después de cambiar el archivo
		// Esta interfaz solo se encarga de sobrescribir la licencia, el frontend debe verificar por sí mismo si la licencia es válida
	} catch (error) {
		return next(error)
	}
}

exports.list = async (req, res, next) => {
	try {
		let { limit, offset, ...query } = req.query
		// Consulta personalizada para parámetros especiales
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
		// Primero eliminar el registro de la base de datos
		await $db.License.destroy({
			where: { sn },
			individualHooks: true
		})
		// Eliminar archivo
		fse.removeSync(path.join(licensePath, sn + '.license'))
		return res.json(license)
	} catch (error) {
		return next(error)
	}
}

// Eliminación del registro de licencia
$db.License.addHook('afterDestroy', async (license, options) => {
	const { sn } = license
	// Eliminar archivo de licencia
	// Eliminar archivo
	fse.removeSync(path.join(licensePath, sn + '.license'))
})
