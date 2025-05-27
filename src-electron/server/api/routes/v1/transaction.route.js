const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/transaction.controller')
const { handleTransactions, removeTransactions, listTransactions } = require('../../validations/transaction.validation')

const router = express.Router()

router.param('id', controller.load)

// obtener/actualizar/eliminar
router
	.route('/:id')
	.get(controller.get)
	.patch(controller.update)
	.delete(authorize(ADMIN, [ROUTES.CallEvent, ROUTES.Record]), controller.remove)

// obtener lista/eliminar en lote/crear
router
	.route('/')
	.post(controller.create)
	.get(validate(listTransactions), controller.list)
	.delete(authorize(ADMIN, [ROUTES.CallEvent, ROUTES.Record]), validate(removeTransactions), controller.removeList)

// procesar transacción
router.route('/:id/handle').post(validate(handleTransactions), controller.handle)

module.exports = router
