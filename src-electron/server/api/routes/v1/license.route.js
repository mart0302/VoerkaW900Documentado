/**
 * Autorización de dispositivos, temporalmente en desuso
 */
const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')
const controller = require('../../controllers/license.controller')
const { createLicense, listLicense } = require('../../validations/license.validation')

const router = express.Router()

router.param('id', controller.load)

router.route('/:id').get(authorize(ADMIN), controller.get).delete(authorize(ADMIN), controller.remove)

router
	.route('/')
	.post(authorize(ADMIN), validate(createLicense), controller.create) // Crear licencia
	.get(authorize(ADMIN), validate(listLicense), controller.list) // Obtener lista de licencias de dispositivos

module.exports = router
