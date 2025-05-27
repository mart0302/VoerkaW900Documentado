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

// Obtener nodo de navegación
router
	.route('/:id')
	.get(controller.get)
	.patch(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(updateNavigation), controller.update)
	.delete(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), controller.remove)

// Crear nodo de navegación
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
	) // Obtener lista de intercomunicadores

module.exports = router
