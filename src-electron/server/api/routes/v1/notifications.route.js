const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')
const controller = require('../../controllers/notifications.controller')
const {
	listNotices,
	createNotice,
	removeNotices,
	handleNotice,
	publishNotice
} = require('../../validations/notifications.validation')

const router = express.Router()

// 处理事务
router.route('/send').post(authorize(ADMIN, [ROUTES.Notice]), validate(handleNotice), controller.handle)

// 暴露给第三方服务
router.route('/publish').post(authorize(ADMIN), validate(publishNotice), controller.publish)
router.route('/test').post(authorize(ADMIN), controller.test)

router.param('id', controller.load)

// 获取\更新\删除
router
	.route('/:id')
	.get(authorize(ADMIN, [ROUTES.Notice]), controller.get)
	.patch(authorize(ADMIN, [ROUTES.Notice]), controller.update)
	.delete(authorize(ADMIN, [ROUTES.Notice]), controller.remove)

router
	.route('/')
	.post(authorize(ADMIN, [ROUTES.Notice]), validate(createNotice), controller.create) // 创建通知
	.get(authorize(ADMIN, [ROUTES.Notice]), validate(listNotices), controller.list) // 获取通知列表
	.delete(authorize(ADMIN, [ROUTES.Notice]), validate(removeNotices), controller.removeList)
module.exports = router
