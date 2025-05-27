/**
 * 设备授权，暂时弃用
 */
const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')
const controller = require('../../controllers/ttsAudio.controller')

const router = express.Router()

// router.param('id', controller.load)

// router.route('/:id').get(authorize(ADMIN), controller.get).delete(authorize(ADMIN), controller.remove)

// router
// 	.route('/')
// 	.post(authorize(ADMIN),  controller.create) // 创建证书
// 	.get(authorize(ADMIN),  controller.list) // 获取设备证书列表

module.exports = router
