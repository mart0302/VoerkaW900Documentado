const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/event.controller')
const { removeEvents, listEvents, handleAlarm } = require('../../validations/event.validation')

const router = express.Router()

router.param('id', controller.load)

// Obtener/Actualizar/Eliminar
router
	.route('/:id')
	.get(authorize(), controller.get)
	.patch(authorize(ADMIN, [ROUTES.DeviceEvent, ROUTES.Alarm, ROUTES.Record]), controller.update)
	.delete(authorize(ADMIN, [ROUTES.DeviceEvent, ROUTES.Alarm, ROUTES.Record]), controller.remove)

// Procesar transacción
router.route('/:id/handle').post(validate(handleAlarm), controller.handle)

// Obtener lista/Eliminar múltiples/Crear
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
