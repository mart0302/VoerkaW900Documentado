const express = require('express')
const controller = require('../../controllers/file.controller')
const { authorize } = require('../../middlewares/auth')
const { upload } = require('../../middlewares')
const { upload: uploadConfig } = requireConfig('vars')

const { image: imageConfig, package: packageConfig, audio: audioConfig, temps } = uploadConfig

// Rutas
const router = express.Router()

// Subir imagen
router.route('/image').post(
	authorize(),
	upload({
		...imageConfig,
		destination: appPath.resolve.data(temps)
	}),
	controller.image
)

// Subir paquete de instalación
router.route('/package').post(
	authorize(),
	upload({
		...packageConfig,
		destination: appPath.resolve.data(temps)
	}),
	controller.package
)

// Subir audio
router.route('/audio').post(
	authorize(),
	upload({
		...audioConfig,
		destination: appPath.resolve.data(temps)
	}),
	controller.audio
)

router.route('/audio').get(authorize(), controller.getAudios)

module.exports = router
