const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/keyMap.controller')
const { createKeyMap, updateKeyMap, removeKeyMaps, listKeyMaps } = require('../../validations/keyMap.validation')

const router = express.Router()

router.param('id', controller.load)

// obtener/actualizar/eliminar
router
	.route('/:id')
	.get(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), controller.get)
	.patch(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(updateKeyMap), controller.update)
	.delete(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), controller.remove)

// obtener lista/eliminar múltiples/crear
router
	.route('/')
	.post(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(createKeyMap), controller.create)
	.get(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(listKeyMaps), controller.list)
	.delete(authorize(ADMIN, [ROUTES.DeviceManage, ROUTES.Device]), validate(removeKeyMaps), controller.removeList)

module.exports = router
