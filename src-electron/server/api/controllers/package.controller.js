const httpStatus = require('http-status')
const { Op } = require('sequelize')
const fs = require('fs-extra')
const path = require('path')
const { upload: uploadConfig } = requireConfig('vars')
const { package: packageConfig } = uploadConfig
const { destination } = packageConfig
const packagesPath = appPath.resolve.data(destination)

exports.load = async (req, res, next, id) => {
	try {
		const package = await $db.Package.findByPk(id)
		if (!package) {
			throw $APIError.NotFound()
		}
		req.locals = { package }
		return next()
	} catch (error) {
		return next(error)
	}
}

exports.get = (req, res) => res.json(req.locals.package)

exports.create = async (req, res, next) => {
	try {
		let package
		try {
			package = await $db.Package.create(req.body)
		} catch (error) {
			// Error 409: Conflicto
			throw $APIError.Conflict()
		}
		res.status(httpStatus.CREATED)
		return res.json(package)
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

		const { count: total, rows: data } = await $db.Package.findAndCountAll({
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
	const { package } = req.locals
	const { id } = package
	try {
		// Primero eliminar el registro de la base de datos
		await $db.Package.destroy({
			where: { id }
		})
		// Eliminar archivos
		fs.removeSync(path.join(packagesPath, id))
		fs.removeSync(path.join(packagesPath, id + '.zip'))
		return res.json(package)
	} catch (error) {
		return next(error)
	}
}
