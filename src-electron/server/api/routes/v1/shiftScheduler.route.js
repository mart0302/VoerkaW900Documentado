const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/shiftScheduler.controller')
const { updateShift, removeShift, listShift, syncShift } = require('../../validations/shiftScheduler.validation')

const router = express.Router()

router.param('id', controller.load)

// Obtener/Actualizar/Eliminar
router
	.route('/:id')
	.get(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), controller.get)
	.patch(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), validate(updateShift), controller.update)
	.delete(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), controller.remove)

// Obtener lista/Eliminar múltiples/Crear
router
	.route('/')
	.post(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), validate(updateShift), controller.create)
	.get(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), validate(listShift), controller.list)
	.delete(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), validate(removeShift), controller.removeList)

router
	.route('/syncLastWeek')
	.post(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), validate(syncShift), controller.syncLastWeek)

module.exports = router
