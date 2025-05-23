const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')
const controller = require('../../controllers/navigation.controller')
const {
	createNavigation,
	createNavigations,
	updateNavigation,
	getIntercomDevice
} = require('../../validations/navigation.validation')

const router = express.Router()

router.param('id', controller.load)

// 获取导航节点
router
	.route('/:id')
	.get(controller.get)
	.patch(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(updateNavigation), controller.update)
	.delete(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), controller.remove)

// 创建导航节点
router
	.route('/')
	.post(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(createNavigation), controller.create)
	.patch(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(createNavigations), controller.createList)

router
	.route('/getIntercomDevice')
	.post(
		authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]),
		validate(getIntercomDevice),
		controller.getIntercomDevice
	) // 获取通知列表

module.exports = router
