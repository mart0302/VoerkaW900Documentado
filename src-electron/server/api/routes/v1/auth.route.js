const express = require('express')
const { validate } = require('../../middlewares')
const controller = require('../../controllers/auth.controller')
const { authorize } = require('../../middlewares/auth')
const { ADMIN, ROUTES } = require('../../../config/constant')

const { login, register, resetPassword } = require('../../validations/auth.validation')

const router = express.Router()

// Registro
router
	.route('/register')
	.post(authorize(ADMIN, [ROUTES.User, ROUTES.Resource]), validate(register), controller.register)
// Inicio de sesión
router.route('/login').post(validate(login), controller.login)

// Restablecer contraseña
router
	.route('/resetPassword')
	.post(authorize(ADMIN, [ROUTES.Settings]), validate(resetPassword), controller.resetPassword)

module.exports = router
