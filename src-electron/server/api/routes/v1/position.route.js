const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/position.controller')
const { removePositions, listPositions } = require('../../validations/position.validation')

const router = express.Router()

router.param('id', controller.load)

// Obtener/Actualizar/Eliminar
router
	.route('/:id')
	.get(authorize(ADMIN, [ROUTES.Position, ROUTES.Resource]), controller.get)
	.patch(authorize(ADMIN, [ROUTES.Position, ROUTES.Resource]), controller.update)
	.delete(authorize(ADMIN, [ROUTES.Position, ROUTES.Resource]), controller.remove)

// Obtener lista/Eliminar múltiples/Crear
router
	.route('/')
	.post(authorize(ADMIN, [ROUTES.Position, ROUTES.Resource]), controller.create)
	.get(authorize(ADMIN, [ROUTES.Position, ROUTES.User, ROUTES.Resource]), validate(listPositions), controller.list)
	.delete(authorize(ADMIN, [ROUTES.Position, ROUTES.Resource]), validate(removePositions), controller.removeList)

module.exports = router
