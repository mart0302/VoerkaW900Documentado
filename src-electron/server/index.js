const path = require('path')
const { Op } = require('sequelize')
appPath = require('../app-paths')
// require config目录下的模块
requireData = appPath.require.data
// require api目录下的模块
requireApi = mod => appPath.require.server(path.join('api', mod))
// require config目录下的模块
requireConfig = mod => appPath.require.server(path.join('config', mod))

// 配置
const { env } = require('./config/vars')
const logger = require('./config/logger')

// 全局对象
$APIError = require('./api/utils/APIError')
// 加载数据库配置
const Settings = require('./config/settings')
// 创建messager
const createMessager = require('./config/messager/index')

// 全局对象
$db = require('./config/database')
// 全局配置
$settings = new Settings($db)

// 加载express
const app = require('./config/express')

const deviceTypes = require('./langs/setting/device.types.json')
const transactionResult = require('./langs/setting/transaction.result.json')
const transactionStatus = require('./langs/setting/transaction.status.json')
const eventCode = require('./langs/setting/event.code.json')
async function initNavigation() {
	// 允许新增字段
	$db.Navigation.sync({ alter: true }).then(async navigation => {
		// 查询所有数据
		// 判断是否存在转发地址和通知地址，如果不存在更新
		$log.info('navigation init ==============')
		const nodes = await navigation.findAll()
		let newValues = nodes.map(item => {
			const addrs =
				Math.ceil(Math.random() * 255) +
				'.' +
				Math.ceil(Math.random() * 255) +
				'.' +
				Math.ceil(Math.random() * 255) +
				'.'
			if (!item.unicastAddr) {
				item.unicastAddr = addrs + 1
				item.broadcastAddr = addrs + 254
			}
			return item
		})

		await $db.sequelize.transaction(t => {
			return Promise.all(
				newValues.map(value => {
					return navigation.update(
						{ unicastAddr: value.unicastAddr, broadcastAddr: value.broadcastAddr },
						{ where: { id: value.id } }
					)
				})
			)
		})
	})
}
;(async function () {
	// 数据库加载
	await $db.sequelize.sync()
	// 加载settings
	await $settings.load()
	try {
		const hander = await $db.Navigation.findOne({ where: { unicastAddr: { [Op.ne]: null } } })
		$log.info('navigation hander ++++++++++++++ ==============', hander)
		if (!hander) {
			initNavigation()
		}
	} catch (e) {
		// 允许新增字段
		initNavigation()
	}

	try {
		const hander = await $db.Transaction.findOne({ where: { handler: {} } })
	} catch (e) {
		// 新增记录处理设备字段
		// 允许新增字段
		$db.Transaction.sync({ alter: true }).then(async transaction => {
			// 查询所有数据
			// 判断是否存在handler字段
			$log.info('transactions init==========')
			const transactions = await transaction.findAll()
			let newValues = transactions.map(item => {
				if (!item.handler) {
					item.handler = {}
				}
				return item
			})
			await $db.sequelize.transaction(t => {
				return Promise.all(
					newValues.map(value => {
						return transaction.update({ handler: value.handler }, { where: { id: value.id } })
					})
				)
			})
		})
	}
	try {
		const user = await $db.User.findByPk('admin')
	} catch (e) {
		// 允许新增字段
		$db.User.sync({ alter: true }).then(async user => {
			// 为admin管理员设置默认值
			await user.update(
				{
					resourceType: 'internal',
					type: 'user',
					menus: 'all',
					fullname: 'Admin',
					deptId: 1,
					status: true,
					code: 'admin',
					sex: 1,
					postId: 1,
					decryptPassword: '123456'
				},
				{ where: { username: 'admin' } }
			)
		})
	}

	// 查找设备类型，看是否有pl语,如果有则不处理，没有则需要更新Settings数据库
	try {
		const devTypes = await $settings.get('device_types')
		if (!devTypes['pl']) {
			$log.info('==========update init settings==================')
			await $settings.update('device_types', deviceTypes)
			await $settings.update('transaction_result', transactionResult)
			await $settings.update('transaction_status', transactionStatus)
			await $settings.update('event_code', eventCode)
			await $settings.update('current_language', { lan: 'en' }, { description: 'Language Settings' })
		}
	} catch (error) {
		$log.warn('get devices type failed error is:', error.message)
	}

	// 查找美一云配置
	try {
		const meeyiCloud = await $settings.get('meeyi_cloud')
		if (!meeyiCloud) {
			$log.info('==========meeyiCloud init settings==================', meeyiCloud)
			await $settings.update(
				'meeyi_cloud',
				{
					enabled: false,
					server: 'http://42.192.86.185:8888',
					mqtt: '',
					appId: '',
					appSecret: '',
					envName: '',
					session_token: ''
				},
				{ description: 'Meeyi cloud Settings' }
			)
		}
	} catch (error) {
		$log.warn('get meeyiCloud failed error is:', error.message)
	}

	try {
		const hander = await $db.Department.findOne({ where: { id: 1 } })
		if (!hander) {
			$db.Department.create({
				type: 'department',
				id: 1,
				title: 'Root',
				description: '',
				logo: '',
				open: true,
				leader: null,
				orderNumber: 0,
				path: '',
				phone: '',
				email: '',
				related: [{ type: 'user', id: 'admin' }],
				createdAt: new Date(),
				updatedAt: new Date()
			})
		}
	} catch (e) {}
	// 启动mqtt服务之前，先将网络设备在线状态改为离线
	try {
		$log.info('==========get online devices==================')
		await $db.Device.update({ online: false }, { where: { online: true } })
	} catch (error) {
		$log.warn('update devices online failed error is:', error.message)
	}
	// 创建messager
	$messager = createMessager($db)
	// listen to requests
	const { port } = $userConfig

	app.listen(port, () => logger.info(`server started on port ${port} (${env})`))
})()

/**
 * Exports express
 * @public
 */
module.exports = app

// 全局对象注明：
// $db 数据库全局对象
// $discoverService 扫描服务
// $settings 全局配置
// $messager 全局mqtt客户段
// $APIError 错误类
// $watcher 证书监听器
// $$SN 当前软件的序列号（当前软件可以看作是一个设备）
// $licenseValidResult 证书验证结果
// $userConfig 用户配置
// $log 全局日志打印
