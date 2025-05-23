const { sha1File } = requireApi('utils/crypto')
const fs = require('fs-extra')
const path = require('path')
const logger = requireConfig('logger')
const { upload: uploadConfig } = requireConfig('vars')
const extract = require('extract-zip')

const { image: imageConfig, package: packageConfig, audio: audioConfig } = uploadConfig

// 图片上传
exports.image = async (req, res, next) => {
	const { destination } = imageConfig
	const destPath = appPath.resolve.data(destination)

	const { path: oldPath } = req.file
	if (!fs.existsSync(oldPath)) {
		// 500错误
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
		// 500错误
		return next(new Error('error.upload_error'))
	}
}

// 安装包上传
exports.package = async (req, res, next) => {
	const { destination } = packageConfig
	const destPath = appPath.resolve.data(destination)

	const { path: oldPath } = req.file
	if (!fs.existsSync(oldPath)) {
		// 500错误
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
			// 移动到packages文件夹下
			fs.renameSync(oldPath, newPath)
			// 解压缩
			try {
				await extract(newPath, { dir: zipPath })
			} catch (error) {
				return next($APIError.BadRequest('error.extract_package'))
			}
		}
		// TODO: 处理没有info.json
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
		// 500错误
		return next(new Error('error.upload_error'))
	}
}

// 音频上传
exports.audio = async (req, res, next) => {
	const { destination } = audioConfig
	const destPath = appPath.resolve.data(destination)

	const { path: oldPath, originalname } = req.file
	if (!fs.existsSync(oldPath)) {
		// 500错误
		return next(new Error('error.upload_error'))
	}
	try {
		const newPath = path.join(destPath, originalname)
		// 判断目标目录是否存在，不存在需创建
		if (!fs.existsSync(destPath)) {
			fs.mkdirsSync(destPath)
		}
		if (fs.existsSync(newPath)) {
			fs.unlinkSync(oldPath)
		} else {
			// 移动到audios文件夹下
			fs.renameSync(oldPath, newPath)
		}
		return res.json({ url: '' })
	} catch (error) {
		logger.error('upload audio error:' + error.message)
		// 500错误
		return next(new Error('error.upload_error'))
	}
}

// 获取音频列表
exports.getAudios = async (req, res, next) => {
	const { destination } = audioConfig
	const destPath = appPath.resolve.data(destination)
	if (!fs.existsSync(destPath)) {
		// 500错误
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
		// 500错误
		return next(new Error('error.get_audios_error'))
	}
}
