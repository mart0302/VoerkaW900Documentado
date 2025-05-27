const express = require('express')
const { validate } = require('../../middlewares')
const controller = require('../../controllers/setting.controller')
const { ADMIN } = require('../../../config/constant')
const { authorize } = require('../../middlewares/auth')
const { updateSetting, createSetting } = require('../../validations/setting.validation')

const router = express.Router()

router.param('id', controller.load)

router.route('/:id').get(controller.get).patch(validate(updateSetting), controller.update)

// 获取全部
router.route('/').get(controller.list).post(validate(createSetting), controller.create)

module.exports = router
