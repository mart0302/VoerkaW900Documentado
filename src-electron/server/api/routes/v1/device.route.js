const express = require('express')
const { validate, encode } = require('../../middlewares')
const controller = require('../../controllers/device.controller')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')
const {
	authorizeDevices,
	upgradeDevices,
	listDevices,
	removeDevices,
	updateDevice,
	createDevice
} = require('../../validations/device.validation')

const router = express.Router()

router.param('id', controller.load)

// 获取设备
router
	.route('/:id')
	.get(controller.get)
	.patch(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(updateDevice), controller.update)
	.delete(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), controller.remove)

// 获取设备列表
router
	.route('/')
	.post(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(createDevice), controller.create)
	.get(validate(listDevices), controller.list)
	.delete(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(removeDevices), controller.removeList)

router.route('/:id/action/:action').post(authorize(), encode, controller.execute)
// 属性变更
router.route('/:id/attrs').post(authorize(), controller.attrs)
// 设备认证
router
	.route('/authorize')
	.post(authorize(ADMIN, [ROUTES.DeviceDiscover, ROUTES.Device]), validate(authorizeDevices), controller.authorize)

// 设备升级
router
	.route('/upgrade')
	.post(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(upgradeDevices), controller.upgrade)

module.exports = router
