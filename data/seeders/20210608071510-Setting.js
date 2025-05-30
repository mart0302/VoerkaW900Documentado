'use strict'
const deviceTypes = require('../../src-electron/server/langs/setting/device.types.json')
const transactionResult = require('../../src-electron/server/langs/setting/transaction.result.json')
const transactionStatus = require('../../src-electron/server/langs/setting/transaction.status.json')
const eventCode = require('../../src-electron/server/langs/setting/event.code.json')
const BUILD_CONFIG = require('../build.config.json')
module.exports = {
	up: async (queryInterface, Sequelize) => {
		/**
		 * Add seed commands here.
		 *
		 * Example:
		 * await queryInterface.bulkInsert('People', [{
		 *   name: 'John Doe',
		 *   isBetaMember: false
		 * }], {});
		 */
		await queryInterface.bulkInsert(
			'Settings',
			[
				// 设备类型
				// http://192.168.38.165:8900/rdcenter/voerkadocs/protocols/common/%E8%AE%BE%E5%A4%87%E7%B1%BB%E5%9E%8B%E5%AE%9A%E4%B9%89.html#%E8%AE%BE%E5%A4%87%E7%B1%BB%E5%9E%8B
				// regexp = /<td style="text-align:center">(.*)<\/td> <td style(.*)<code>(.*)<\/code>/; types = {}; document.querySelectorAll("#app > div > div.page > div.content > table:nth-child(4) > tbody > tr").forEach(item => { item = regexp.exec(item.innerHTML); types[item[3]] = item[1]})
				// JSON.stringify(types)
				{
					key: 'device_types',
					value: JSON.stringify(deviceTypes),
					description: 'Device types',
					createdAt: new Date(),
					updatedAt: new Date()
				},
				// 事务结果
				{
					key: 'transaction_result',
					value: JSON.stringify(transactionResult),
					description: 'Transaction Result',
					createdAt: new Date(),
					updatedAt: new Date()
				},
				// 事务状态
				{
					key: 'transaction_status',
					value: JSON.stringify(transactionStatus),
					description: 'Transaction Status',
					createdAt: new Date(),
					updatedAt: new Date()
				},
				// 事件编码
				{
					key: 'event_code',
					value: JSON.stringify(eventCode),
					description: 'Event Code',
					createdAt: new Date(),
					updatedAt: new Date()
				},
				// 呼叫配置
				{
					key: 'call_settings',
					value: JSON.stringify({
						callTimeout: 5 * 60 * 1000,
						callPrecaution: 3 * 60 * 1000,
						alarmTimeout: 60 * 60 * 1000,
						popupTime: 5 * 1000,
						timeoutPush: true
					}),
					description: 'Call Settings',
					createdAt: new Date(),
					updatedAt: new Date()
				},
				{
					key: 'current_language',
					value: JSON.stringify({ lan: BUILD_CONFIG.default }),
					description: 'Language Settings',
					createdAt: new Date(),
					updatedAt: new Date()
				},
				{
					key: 'meeyi_cloud',
					value: JSON.stringify({
						enabled: false,
						server: 'http://42.192.86.185:8888',
						mqtt: '',
						appId: '',
						appSecret: '',
						envName: '',
						session_token: ''
					}),
					description: 'Meeyi cloud Settings',
					createdAt: new Date(),
					updatedAt: new Date()
				}
			],
			{}
		)
	},

	down: async (queryInterface, Sequelize) => {
		/**
		 * Add commands to revert seed here.
		 *
		 * Example:
		 * await queryInterface.bulkDelete('People', null, {});
		 */
		await queryInterface.bulkDelete('Settings', null, {})
	}
}
