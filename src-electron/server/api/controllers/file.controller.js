const { sha1File } = requireApi('utils/crypto')
const fs = require('fs-extra')
const path = require('path')
const logger = requireConfig('logger')
const { upload: uploadConfig } = requireConfig('vars')
const extract = require('extract-zip')

const { image: imageConfig, package: packageConfig, audio: audioConfig } = uploadConfig

// Subida de imágenes
exports.image = async (req, res, next) => {
	const { destination } = imageConfig
	const destPath = appPath.resolve.data(destination)

	const { path: oldPath } = req.file
	if (!fs.existsSync(oldPath)) {
		// Error 500
		return next(new Error('error.upload_error'))
	}
	try {
		const fileSha1 = await sha1File(oldPath)
		const fileName = `${fileSha1}.jpg`
		const newPath = path.join(destPath, fileName)
		if (fs.existsSync(newPath)) {
			fs.unlinkSync(oldPath)
		} else {
			fs.renameSync(oldPath, newPath)
		}
		return res.json({ url: `/${destination}/${fileName}` })
	} catch (error) {
		logger.error('upload image error:' + error.message)
		// Error 500
		return next(new Error('error.upload_error'))
	}
}

// Subida de paquetes
exports.package = async (req, res, next) => {
	const { destination } = packageConfig
	const destPath = appPath.resolve.data(destination)

	const { path: oldPath } = req.file
	if (!fs.existsSync(oldPath)) {
		// Error 500
		return next(new Error('error.upload_error'))
	}
	try {
		const fileSha1 = await sha1File(oldPath)
		const fileName = `${fileSha1}.zip`
		const newPath = path.join(destPath, fileName)
		const zipPath = path.join(destPath, fileSha1)
		const infoPath = path.join(zipPath, 'info.json')
		if (fs.existsSync(newPath)) {
			fs.unlinkSync(oldPath)
		} else {
			// Mover al directorio de paquetes
			fs.renameSync(oldPath, newPath)
			// Descomprimir
			try {
				await extract(newPath, { dir: zipPath })
			} catch (error) {
				return next($APIError.BadRequest('error.extract_package'))
			}
		}
		// TODO: Manejar caso cuando no existe info.json
		if (!fs.existsSync(infoPath)) {
			return next($APIError.BadRequest('error.parse_package'))
		}
		const info = require(infoPath)
		const package = (
			await $db.Package.upsert({
				id: fileSha1,
				url: `/${destination}/${fileSha1}/${info.fileName}`,
				...info
			})
		)[0]
		return res.json(package)
	} catch (error) {
		logger.error('upload package error:' + error.message)
		// Error 500
		return next(new Error('error.upload_error'))
	}
}

// Subida de audio
exports.audio = async (req, res, next) => {
	const { destination } = audioConfig
	const destPath = appPath.resolve.data(destination)

	const { path: oldPath, originalname } = req.file
	if (!fs.existsSync(oldPath)) {
		// Error 500
		return next(new Error('error.upload_error'))
	}
	try {
		const newPath = path.join(destPath, originalname)
		// Verificar si existe el directorio destino, crearlo si no existe
		if (!fs.existsSync(destPath)) {
			fs.mkdirsSync(destPath)
		}
		if (fs.existsSync(newPath)) {
			fs.unlinkSync(oldPath)
		} else {
			// Mover al directorio de audios
			fs.renameSync(oldPath, newPath)
		}
		return res.json({ url: '' })
	} catch (error) {
		logger.error('upload audio error:' + error.message)
		// Error 500
		return next(new Error('error.upload_error'))
	}
}

// Obtener lista de audios
exports.getAudios = async (req, res, next) => {
	const { destination } = audioConfig
	const destPath = appPath.resolve.data(destination)
	if (!fs.existsSync(destPath)) {
		// Error 500
		return res.json([])
	}
	try {
		let files = await fs.readdir(destPath)
		if (files.length) {
			files = files.map(fileName => {
				const newPath = path.join(destPath, fileName)
				return { fileName, url: newPath }
			})
		}
		return res.json(files)
	} catch (error) {
		logger.error('get audio list error:' + error.message)
		// Error 500
		return next(new Error('error.get_audios_error'))
	}
}
