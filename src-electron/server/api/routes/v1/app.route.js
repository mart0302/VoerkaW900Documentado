const express = require('express')
const { validate } = require('../../middlewares')
const { ADMIN, ROUTES } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/app.controller')
const { saveLicense } = require('../../validations/app.validation')

const router = express.Router()

// 获取应用是否授权
router.route('/isValid').get(controller.isValid)

// 保存证书
router.route('/saveLicense').post(authorize(ADMIN, [ROUTES.License]), validate(saveLicense), controller.saveLicense)

module.exports = router
