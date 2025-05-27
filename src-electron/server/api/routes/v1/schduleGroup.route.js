const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/schduleGroup.controller')
const { createGroup, updateGroup, removeGroup, listGroup } = require('../../validations/schduleGroup.validation')

const router = express.Router()

router.param('id', controller.load)

// obtener/actualizar/eliminar
router
	.route('/:id')
	.get(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), controller.get)
	.patch(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), validate(updateGroup), controller.update)
	.delete(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), controller.remove)

// obtener lista/eliminar en lote/crear
router
	.route('/')
	.post(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), validate(updateGroup), controller.create)
	.get(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), validate(listGroup), controller.list)
	.delete(authorize(ADMIN, [ROUTES.Resource, ROUTES.Shift]), validate(removeGroup), controller.removeList)

module.exports = router
