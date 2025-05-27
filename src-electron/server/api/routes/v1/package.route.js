const express = require('express')
const { validate } = require('../../middlewares')
const controller = require('../../controllers/package.controller')
const { createPackage, listPackages } = require('../../validations/package.validation')

const router = express.Router()

router.param('id', controller.load)

router.route('/:id').get(controller.get).delete(controller.remove)

router
	.route('/')
	.post(validate(createPackage), controller.create) // Crear paquete de actualización
	.get(validate(listPackages), controller.list) // Obtener lista de paquetes de actualización

module.exports = router
