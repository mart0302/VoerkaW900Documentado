const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/app.controller')
const { saveLicense } = require('../../validations/app.validation')

const router = express.Router()

// Verificar si la aplicación está autorizada
router.route('/isValid').get(controller.isValid)

// Guardar licencia
router.route('/saveLicense').post(authorize(ADMIN, [ROUTES.License]), validate(saveLicense), controller.saveLicense)

module.exports = router
