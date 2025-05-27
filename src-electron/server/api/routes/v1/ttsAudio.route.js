/**
 * Autorización de dispositivo, temporalmente en desuso
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
// 	.post(authorize(ADMIN),  controller.create) // crear certificado
// 	.get(authorize(ADMIN),  controller.list) // obtener lista de certificados de dispositivo

module.exports = router
