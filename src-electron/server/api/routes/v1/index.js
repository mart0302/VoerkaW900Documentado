const express = require('express')

const router = express.Router()
const { activated } = require('../../middlewares')

/**
 * GET v1/status
 */
router.get('/status', (req, res) => res.send('OK'))

// api
router.use('/app', require('./app.route'))
router.use('/auth', require('./auth.route'))
router.use('/user', require('./user.route'))
router.use('/file', require('./file.route'))
router.use('/device', activated, require('./device.route'))
router.use('/package', activated, require('./package.route'))
router.use('/setting', require('./setting.route'))
router.use('/navigation', activated, require('./navigation.route'))
router.use('/keyMap', activated, require('./keyMap.route'))
router.use('/event', activated, require('./event.route'))
router.use('/transaction', activated, require('./transaction.route'))
router.use('/analytics', activated, require('./analytics.route'))
router.use('/notifications', activated, require('./notifications.route'))
// router.use('/license', activated, require('./license.route'))
router.use('/department', activated, require('./department.route'))
router.use('/position', activated, require('./position.route'))
router.use('/scheduleGroup', activated, require('./schduleGroup.route'))
router.use('/shiftScheduler', activated, require('./shiftScheduler.route'))
router.use('/ttsAudio', activated, require('./ttsAudio.route'))

module.exports = router
