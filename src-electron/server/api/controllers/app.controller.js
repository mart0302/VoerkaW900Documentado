const fs = require('fs')
const path = require('path')

// Directorio .dat
const LICENSE_DIR = appPath.resolve.data(process.env.LICENSE_DIR)
// Archivo de licencia
const LICENSE_FILE = path.resolve(LICENSE_DIR, process.env.LICENSE_NAME)

// Obtener si la aplicación está autorizada
exports.isValid = async (req, res, next) => {
	return res.json({
		...$licenseValidResult,
		sn: $$SN
	})
}

// Verificar activamente si está autorizado
// [DESCONTINUADO]: Ya se implementó la verificación automática después de cargar la licencia
exports.checkValid = async (req, res, next) => {
	try {
		// Verificar licencia
		await $watcher.checkLicense()

		return res.json({
			...$licenseValidResult,
			sn: $$SN
		})
	} catch (error) {
		return next(error)
	}
}

// Guardar licencia
exports.saveLicense = async (req, res, next) => {
	const { license } = req.body
	try {
		fs.writeFileSync(LICENSE_FILE, license, 'utf8')

		// Retorno
		// Debido a que chokdir tiene un debounce de 1s, el resultado de la verificación 
		// después de cambiar el archivo toma un tiempo
		// Esta interfaz solo es responsable de sobrescribir la licencia, 
		// si la licencia es válida o no, el frontend debe verificarlo por sí mismo con isValid
		return res.json({
			sn: $$SN
		})
	} catch (error) {
		return next(error)
	}
}
