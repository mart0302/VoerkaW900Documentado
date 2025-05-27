const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const controller = require('../../controllers/user.controller')
const { authorize } = require('../../middlewares/auth')
const { listUsers, removeUsers } = require('../../validations/user.validation')

const router = express.Router()

/**
 * Cargar usuario cuando se accede a una ruta API con parámetro userId
 */
router.param('id', controller.load)

router
	.route('/:id')
	.get(controller.get)
	.patch(authorize(ADMIN, [ROUTES.User, ROUTES.Resource]), controller.update)

router
	.route('/')
	.get(validate(listUsers), controller.list)
	.delete(authorize(ADMIN, [ROUTES.User, ROUTES.Resource]), validate(removeUsers), controller.removeList)

router.route('/:id/resetPassword').patch(authorize(ADMIN, [ROUTES.User, ROUTES.Resource]), controller.resetPassword)

module.exports = router
