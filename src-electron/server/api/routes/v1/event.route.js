const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/event.controller')
const { removeEvents, listEvents, handleAlarm } = require('../../validations/event.validation')

const router = express.Router()

router.param('id', controller.load)

// 获取\更新\删除
router
	.route('/:id')
	.get(authorize(), controller.get)
	.patch(authorize(ADMIN, [ROUTES.DeviceEvent, ROUTES.Alarm, ROUTES.Record]), controller.update)
	.delete(authorize(ADMIN, [ROUTES.DeviceEvent, ROUTES.Alarm, ROUTES.Record]), controller.remove)

// 处理事务
router.route('/:id/handle').post(validate(handleAlarm), controller.handle)

// 获取列表\批量删除\创建
router
	.route('/')
	.post(authorize(ADMIN, [ROUTES.DeviceEvent, ROUTES.Alarm, ROUTES.Record]), controller.create)
	.get(authorize(), validate(listEvents), controller.list)
	.delete(
		authorize(ADMIN, [ROUTES.DeviceEvent, ROUTES.Alarm, ROUTES.Record]),
		validate(removeEvents),
		controller.removeList
	)

module.exports = router
