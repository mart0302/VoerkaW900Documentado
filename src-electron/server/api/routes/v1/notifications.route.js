const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')
const controller = require('../../controllers/notifications.controller')
const {
	listNotices,
	createNotice,
	removeNotices,
	handleNotice,
	publishNotice
} = require('../../validations/notifications.validation')

const router = express.Router()

// procesar transacción
router.route('/send').post(authorize(ADMIN, [ROUTES.Notice]), validate(handleNotice), controller.handle)

// exponer a servicios de terceros
router.route('/publish').post(authorize(ADMIN), validate(publishNotice), controller.publish)
router.route('/test').post(authorize(ADMIN), controller.test)

router.param('id', controller.load)

// obtener/actualizar/eliminar
router
	.route('/:id')
	.get(authorize(ADMIN, [ROUTES.Notice]), controller.get)
	.patch(authorize(ADMIN, [ROUTES.Notice]), controller.update)
	.delete(authorize(ADMIN, [ROUTES.Notice]), controller.remove)

router
	.route('/')
	.post(authorize(ADMIN, [ROUTES.Notice]), validate(createNotice), controller.create) // crear notificación
	.get(authorize(ADMIN, [ROUTES.Notice]), validate(listNotices), controller.list) // obtener lista de notificaciones
	.delete(authorize(ADMIN, [ROUTES.Notice]), validate(removeNotices), controller.removeList)
module.exports = router
