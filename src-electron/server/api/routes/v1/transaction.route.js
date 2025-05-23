const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/transaction.controller')
const { handleTransactions, removeTransactions, listTransactions } = require('../../validations/transaction.validation')

const router = express.Router()

router.param('id', controller.load)

// 获取\更新\删除
router
	.route('/:id')
	.get(controller.get)
	.patch(controller.update)
	.delete(authorize(ADMIN, [ROUTES.CallEvent, ROUTES.Record]), controller.remove)

// 处理事务
router.route('/:id/handle').post(validate(handleTransactions), controller.handle)

// 获取列表\批量删除\创建
router
	.route('/')
	.post(controller.create)
	.get(validate(listTransactions), controller.list)
	.delete(authorize(ADMIN, [ROUTES.CallEvent, ROUTES.Record]), validate(removeTransactions), controller.removeList)

module.exports = router
