const express = require('express')
const { validate } = require('../../middlewares')
const { authorize } = require('../../middlewares/auth')

const controller = require('../../controllers/analytics.controller')
const { callDuration, callResult, callStatistics, alarmStatistics } = require('../../validations/analytics.validation')

const router = express.Router()

// Análisis de duración de llamadas
router.route('/callDuration').post(authorize(), validate(callDuration), controller.callDuration)

// Análisis de resultados de llamadas
router.route('/callResult').post(authorize(), validate(callResult), controller.callResult)

// Estadísticas de llamadas
router.route('/callStatistics').post(authorize(), validate(callStatistics), controller.callStatistics)

// Estadísticas de alarmas
router.route('/alarmStatistics').post(authorize(), validate(alarmStatistics), controller.alarmStatistics)

module.exports = router
