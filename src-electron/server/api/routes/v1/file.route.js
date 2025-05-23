const express = require('express')
const controller = require('../../controllers/file.controller')
const { authorize } = require('../../middlewares/auth')
const { upload } = require('../../middlewares')
const { upload: uploadConfig } = requireConfig('vars')

const { image: imageConfig, package: packageConfig, audio: audioConfig, temps } = uploadConfig

// 路由
const router = express.Router()

// 上传图片
router.route('/image').post(
	authorize(),
	upload({
		...imageConfig,
		destination: appPath.resolve.data(temps)
	}),
	controller.image
)

// 上传安装包
router.route('/package').post(
	authorize(),
	upload({
		...packageConfig,
		destination: appPath.resolve.data(temps)
	}),
	controller.package
)

// 上传安装包
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
