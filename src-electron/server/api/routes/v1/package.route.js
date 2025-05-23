const express = require('express')
const { validate } = require('../../middlewares')
const controller = require('../../controllers/package.controller')
const { createPackage, listPackages } = require('../../validations/package.validation')

const router = express.Router()

router.param('id', controller.load)

router.route('/:id').get(controller.get).delete(controller.remove)

router
	.route('/')
	.post(validate(createPackage), controller.create) // 创建升级包
	.get(validate(listPackages), controller.list) // 获取升级包列表

module.exports = router
