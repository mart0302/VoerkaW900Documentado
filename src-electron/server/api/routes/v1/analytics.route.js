const express = require('express')
const { validate } = require('../../middlewares')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/analytics.controller')
const { callDuration, callResult, callStatistics, alarmStatistics } = require('../../validations/analytics.validation')

const router = express.Router()

// 呼叫时长分析
router.route('/callDuration').post(authorize(), validate(callDuration), controller.callDuration)

// 呼叫结果分析
router.route('/callResult').post(authorize(), validate(callResult), controller.callResult)

// 呼叫统计
router.route('/callStatistics').post(authorize(), validate(callStatistics), controller.callStatistics)

// 告警统计
router.route('/alarmStatistics').post(authorize(), validate(alarmStatistics), controller.alarmStatistics)

module.exports = router
