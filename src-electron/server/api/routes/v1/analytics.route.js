const express = require('express')
const { validate } = require('../../middlewares')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/analytics.controller')
const { callDuration, callResult, callStatistics, alarmStatistics } = require('../../validations/analytics.validation')

const router = express.Router()

// análisis de duración de llamada
router.route('/callDuration').post(authorize(), validate(callDuration), controller.callDuration)

// análisis de resultado de llamada
router.route('/callResult').post(authorize(), validate(callResult), controller.callResult)

// estadísticas de llamadas
router.route('/callStatistics').post(authorize(), validate(callStatistics), controller.callStatistics)

// estadísticas de alarmas
router.route('/alarmStatistics').post(authorize(), validate(alarmStatistics), controller.alarmStatistics)

module.exports = router
