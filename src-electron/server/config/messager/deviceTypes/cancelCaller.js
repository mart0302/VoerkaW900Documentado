// 处理消息
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require('@voerka/messager')
const { Op } = require('sequelize')
const i18n = require('../../i18n')

i18n.init

module.exports = ({ dbUtils, messager }) => {
	/**
	 *  获取这条消息路径上的所有未处理事务
	 * @param {*} param0
	 * @returns { [{nodeId, nodePath, sn}] } devices
	 */
	async function findNodeTransaction(id) {
		// 找出路径上的所有节点
		const node = await $db.Navigation.findByPk(id)
		const path = node.path ? node.path + '/' + id : id
		$log.info('【cancelCaller】findNodeTransaction+++++++++++', path)
		const transactions = await $db.Transaction.findAll({
			where: { group: { [Op.like]: `${path}%` }, status: TRANSACTION_STATUS.PROGRESSING }
		})
		// 返回
		return transactions
	}

	// 接收消息
	return async ({ topic, message, domain, device }) => {
		/** 不管是按键几，全当做是取消 1 */
		/** 1.查找该设备所在节点下的 */
		// 通过 device.nodeId查找节点，找到节点的path,通过path 搜索所有事务中status ==1的，即未处理的事务
		const transactions = await findNodeTransaction(device.nodeId)
		// 遍历事务，将事务处理掉
		for (let i = 0, len = transactions.length; i < len; i++) {
			let transaction = transactions[i]
			// 构造mqtt消息，通知服务器,该事务已处理；同时转发到设备，通知转发设备该消息已处理
			// 国际化
			const lan = await $db.Setting.findByPk('current_language')
			i18n.setLocale(lan.value.lan)
			message = i18n.__('cancel')
			const { sn, title, type } = device
			await $messager.handleEntityTransaction(transaction, {
				result: TRANSACTION_RESULT.COMPLETED,
				progress: 100,
				remarks: message,
				path: transaction.path,
				message,
				handler: { sn, title, type }
			})
			// $messager.handleEntityTransaction： 更新数据库=>将触发资源变更事件，影响前端展现效果
		}
	}
}
