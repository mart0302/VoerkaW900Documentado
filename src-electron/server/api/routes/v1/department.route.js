const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')
const controller = require('../../controllers/department.controller')
const { createDepartment, updateDepartment, listDepartment } = require('../../validations/department.validation')

const router = express.Router()

router.param('id', controller.load)

router.route('/list').get(authorize(ADMIN, [ROUTES.Department, ROUTES.User, ROUTES.Resource]), controller.getList)

router
	.route('/query')
	.get(authorize(ADMIN, [ROUTES.Department, ROUTES.Resource]), validate(listDepartment), controller.getQuery)
// obtener departamento
router
	.route('/:id')
	.get(authorize(ADMIN, [ROUTES.Department, ROUTES.User, ROUTES.Resource, ROUTES.Shift]), controller.get)
	.patch(authorize(ADMIN, [ROUTES.Department, ROUTES.Resource]), validate(updateDepartment), controller.update)
	.delete(authorize(ADMIN, [ROUTES.Department, ROUTES.Resource]), controller.remove)

// crear departamento
router
	.route('/')
	.post(authorize(ADMIN, [ROUTES.Department, ROUTES.Resource]), validate(createDepartment), controller.create)

module.exports = router
