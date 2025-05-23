const logger = requireConfig('logger')
const { differenceBy, difference, isEqual, pick, rearg } = require('lodash')
const { Op, QueryTypes } = require('sequelize')
const httpStatus = require('http-status')
const { mergeDeepRight } = require('../utils')
const { MULTIPLE_BIND_DEVICES } = requireConfig('constant')

// 加载 - params id
exports.load = async (req, res, next, id) => {
	try {
		const navigation = await $db.Navigation.findByPk(id)
		if (!navigation) {
			throw $APIError.NotFound()
		}
		req.locals = { navigation: navigation.toJSON() }
		return next()
	} catch (error) {
		return next(error)
	}
}

// 获取节点
exports.get = async (req, res, next) => {
	try {
		const { id } = req.locals.navigation
		const navigation = await $db.Navigation.findNode({
			where: { id }
		})
		return res.json(navigation)
	} catch (error) {
		return next(error)
	}
}

// 批量新增节点
exports.createList = async (req, res, next) => {
	try {
		// 查找复制节点的所有子孙节点，获取名称， 按id排序, 构建pid
		const { id, copyId } = req.body
		const navigation = await $db.Navigation.findByPk(copyId)
		const children = await $db.Navigation.findNodeChildren(navigation.toJSON())
		let newNodesMap = {}
		if (children.length) {
			for (let i = 0; i < children.length; i++) {
				// 构建pid, 创建节点
				const node = children[i].toJSON()
				if (node.pid === copyId) {
					const newNode = await $db.Navigation.createNode({ pid: id, title: node.title })
					newNodesMap[node.id] = { id: newNode.id, title: newNode.title } // 将复制节点子节点id与当前id映射，方便得到正确的父子关系
				} else {
					let pidItem = newNodesMap[node.pid]
					if (pidItem) {
						const newNode = await $db.Navigation.createNode({ pid: pidItem.id, title: node.title })
						newNodesMap[node.id] = { id: newNode.id, title: newNode.title }
					}
				}
			}
		}
		return res.json(navigation)
	} catch (error) {
		if (error.message === 'parent_node_not_found') {
			return next($APIError.BadRequest('error.parent_not_found'))
		}
		return next(error)
	}
}

// 新增
exports.create = async (req, res, next) => {
	try {
		const navigation = await $db.Navigation.createNode(req.body)
		return res.json(navigation)
	} catch (error) {
		if (error.message === 'parent_node_not_found') {
			return next($APIError.BadRequest('error.parent_not_found'))
		}
		return next(error)
	}
}

// 是否强制绑定
async function isUnbind(lastNode, node, deviceUnbindNode) {
	// 判断该节点是否为要绑定的节点
	if (lastNode.id === node.id) {
		// 提示已绑定
		return false
	} else {
		// 是否强绑
		if (!deviceUnbindNode) {
			// 是否强制绑定,  提示已绑定

			return false
		} else {
			// 解绑
			return true
		}
	}
}
//获取组地址ID
function getId(groups) {
	for (let i = 0; i < 10; i++) {
		if (!groups[i].path) {
			return groups[i].id
		}
	}
}
function getBoradcastAddr(groups, parent, node) {
	const isExistAddr = groups.filter(item => item.netAddr == parent.broadcastAddr)
	if (!isExistAddr.length) {
		id = getId(groups)
		groups = groups.filter(item => item.id !== id)
		groups = groups.concat([
			{ id, netAddr: parent.broadcastAddr, path: node.path ? node.path + '/' + node.id : node.id }
		])
	}
	return groups
}
//构造groups
async function getGroups(groups, node) {
	groups = getBoradcastAddr(groups, node, node)
	const path = node.path.split('/')
	const nodes = await $db.Navigation.findAll({
		where: { id: { [Op.in]: path } }
	})
	nodes.map(parent => {
		groups = getBoradcastAddr(groups, parent, node)
	})
	// 配置单播地址
	id = getId(groups)
	groups = groups.filter(item => item.id !== id)
	groups = groups.concat([{ id, netAddr: node.unicastAddr, path: node.path ? node.path + '/' + node.id : node.id }])

	// 按id排序
	groups = groups.sort((a, b) => a.id - b.id)
	return groups
}

// 多绑设备,如果允许绑定则返回新的attrs，否则返回false
async function isMultiple(node, attrs, counts) {
	let currentBind = attrs.groups.filter(item => item.path)
	if (currentBind.length && node.id === 1) return false
	if (currentBind.length === counts) {
		// 如果当前绑定节点刚好达到最大绑定数目，则返回提示信息
		return false
	} else {
		// 判断要绑的节点是否符合绑定规则
		let i = 0
		while (i !== currentBind.length) {
			let currentPath = currentBind[i].path
			let path = node.path ? node.path + '/' + node.id : node.id
			if (
				currentPath == 1 ||
				(path !== currentPath && (path.indexOf(currentPath) !== -1 || currentPath.indexOf(path) !== -1))
			) {
				// 如果要绑的节点已在已绑节点的分支上，则提示错误
				return false
			} else {
				i++
			}
		}
		// 返回attrs.groups
		attrs.groups = await getGroups(attrs.groups, node)
		return attrs
	}
}

// 判断资源是否可绑,不可绑:返回false,可绑返回true
async function isBindable(id, node, deviceUnbindNode) {
	// 判断设备是否可多绑
	let data = await $db.Device.findByPk(id)
	// 说明绑定资源类型不是设备
	if (!data) return true
	let { type, attrs } = data
	let isMultiplBindDevice = MULTIPLE_BIND_DEVICES[type]
	// 多绑设备:一个分支只允许绑一个;随意绑定
	if (
		isMultiplBindDevice &&
		((isMultiplBindDevice.mode && isMultiplBindDevice.mode == attrs.mode) || !isMultiplBindDevice.mode)
	) {
		if (isMultiplBindDevice.method == 'brunch') {
			return await isMultiple(node, attrs, isMultiplBindDevice.counts)
		} else if (isMultiplBindDevice.method == 'all') {
			return true
		}
	} else {
		// 1.从主设备上查找是否绑定该设备
		let lastNode = await $db.Navigation.findOne({ where: { device: id } })
		if (lastNode) {
			// 如果已绑定
			let isBinded = await isUnbind(lastNode, node, deviceUnbindNode)
			// 解绑
			if (isBinded) await $db.Navigation.update({ device: null }, { where: { device: id }, individualHooks: true })
			return isBinded
		} else {
			// 2.从关联资源上查找是否绑定该设备
			let lastNode = await $db.sequelize.query(
				`SELECT Navigations.id, related FROM Navigations, json_each(Navigations.related) WHERE json_valid(Navigations.related) AND json_extract(json_each.value, '$.id') = '${id}'`,
				{
					type: QueryTypes.SELECT
				}
			)
			if (!lastNode.length) {
				// 无绑定节点
				return true
			} else {
				lastNode = lastNode[0]
				let isBinded = await isUnbind(lastNode, node, deviceUnbindNode)
				// 解绑
				let related = JSON.parse(lastNode.related).filter(item => item.id !== id)
				if (isBinded) await $db.Navigation.update({ related }, { where: { id: lastNode.id }, individualHooks: true })
				return isBinded
			}
		}
	}
}

// 编辑
exports.update = async (req, res, next) => {
	const { deviceUnbindNode, deleteRelated } = req.query
	const { navigation } = req.locals
	const { id } = navigation
	let data = req.body
	try {
		/* 此处逻辑较为复杂，所以优先保证可读性 */
		let bindSource = false
		// 1.判断设备是否已绑定节点
		if (data.device) {
			// 1.将设备绑在主设备上
			bindSource = await isBindable(data.device, navigation, deviceUnbindNode)
			if (!bindSource) {
				// 节点已经绑定设备【返回】
				return next(new Error('error.device_has_binded_at_other_node'))
			} else {
				// 3. 如果设备可绑
				// 判断是否多绑，多绑设备需要更新attrs
				if (typeof bindSource === 'boolean') {
					// 更新设备的绑定节点id
					await $db.Device.update({ nodeId: id }, { where: { sn: data.device } })
				} else {
					await $db.Device.update({ nodeId: id, attrs: bindSource }, { where: { sn: data.device } })
				}
			}
		}
		// 关联资源如果是对象直接绑定
		if (data.related) {
			// 找到要更新的资源
			let resource =
				navigation.related.length > data.related.length
					? differenceBy(navigation.related, data.related, 'id')[0]
					: differenceBy(data.related, navigation.related, 'id')[0]
			if (deleteRelated) {
				let device = await $db.Device.findByPk(resource.id)
				let attrs = device ? device.attrs : null
				if (navigation.intercom && navigation.intercom == resource.id) {
					// 如果解绑的设备为对讲机，则关闭节点对讲功能
					data.intercom = null
				}
				if (attrs) {
					// 解绑资源
					if (MULTIPLE_BIND_DEVICES[resource.type] && MULTIPLE_BIND_DEVICES[resource.type].method == 'brunch') {
						let path = navigation.path ? navigation.path + '/' + navigation.id : navigation.id
						attrs.groups = attrs.groups.map(item => {
							if (item.path == path) {
								item.path = ''
								item.netAddr = '000.000.000.000'
							}
							return item
						})
						await $db.Device.update({ nodeId: null, attrs }, { where: { sn: resource.id } })
					} else {
						await $db.Device.update({ nodeId: null }, { where: { sn: resource.id } })
					}
				}
				// 解绑用户
				let user = await $db.User.findByPk(resource.id)
				if (user) {
					let path = user.path
						.split(',')
						.filter(pid => pid != id)
						.join(',')
					await $db.User.update({ path }, { where: { username: resource.id } })
				}
			} else {
				// 2. 将设备绑定在关联资源上
				bindSource = await isBindable(resource.id, navigation, deviceUnbindNode)
				if (!bindSource) {
					// 节点已经绑定设备【返回】
					return next(new Error('error.device_has_binded_at_other_node'))
				} else {
					// 3. 如果设备可绑
					// 更新设备的绑定节点id
					// 判断是否多绑，多绑设备需要更新attrs
					if (typeof bindSource === 'boolean') {
						// 更新设备的绑定节点id
						await $db.Device.update({ nodeId: id }, { where: { sn: resource.id } })
					} else {
						await $db.Device.update({ nodeId: id, attrs: bindSource }, { where: { sn: resource.id } })
					}
				}
			}
		}
		// device === null or device === undefined
		if (data.device === null) {
			// 节点解绑设备
			let device = await $db.Device.findByPk(navigation.device)
			if (navigation.intercom && navigation.intercom == navigation.device) {
				// 如果解绑的设备为对讲机，则关闭节点对讲功能
				data.intercom = null
			}
			let attrs = device ? device.attrs : null
			let type = device ? device.type : null
			// 如果找到设备, 防止因删除设备没有解绑成功，导致设备资源找不到问题
			if (type) {
				if (MULTIPLE_BIND_DEVICES[type] && MULTIPLE_BIND_DEVICES[type].method == 'brunch') {
					let path = navigation.path ? navigation.path + '/' + navigation.id : navigation.id
					attrs.groups = attrs.groups.map(item => {
						if (item.path == path) {
							item.path = ''
							item.netAddr = '000.000.000.000'
						}
						return item
					})
					await $db.Device.update({ nodeId: null, attrs }, { where: { sn: navigation.device } })
				} else {
					// 设备nodeId设置null
					// 无逻辑：null 替换 此前的设备
					await $db.Device.update({ nodeId: null }, { where: { sn: navigation.device } })
				}
			}
		}
		if (data.intercom || data.intercom === null) {
			const intercomSn = data.intercom || navigation.intercom
			if (intercomSn) {
				let device = await $db.Device.findByPk(intercomSn)
				let attrs = device ? device.attrs : null
				attrs.intercom = data.intercom ? true : false
				await $db.Device.update({ attrs }, { where: { sn: intercomSn } })
			}
		}
		// mergeDeep
		data = mergeDeepRight(navigation, data)
		// 更新数据库
		const result = await $db.Navigation.updateNode(data, { where: { id }, individualHooks: true })
		// 返回
		return res.json(result)
	} catch (error) {
		return next(error)
	}
}

// 通过列表返回可用的网关

exports.getIntercomDevice = async (req, res, next) => {
	try {
		let { intercoms, nodeId } = req.body
		let occupations = []
		for (let i = 0; i < intercoms.length; i++) {
			const navigation = await $db.Navigation.findNode({
				where: { intercom: intercoms[0], id: { [Op.ne]: nodeId } }
			})
			if (navigation) {
				occupations.push(intercoms[0])
			}
		}

		return res.json(intercoms.filter(item => !occupations.includes(item)))
	} catch (error) {
		return next(error)
	}
}

// 节点删除，更新设备的绑定状态
$db.Navigation.addHook('afterDestroy', async (node, options) => {
	const { device, related, id, path } = node
	// 更改组地址
	// 先解绑
	let nodePath = path ? path + '/' + id : id
	if (related.length) {
		related.map(async item => {
			if (item.type === 'lora_watch') {
				let { attrs } = await $db.Device.findByPk(item.id)
				attrs.groups = attrs.groups.map(item => {
					if (item.path == nodePath) {
						item.path = ''
						item.netAddr = '000.000.000.000'
					}
					return item
				})
				await $db.Device.update({ attrs }, { where: { sn: item.id } })
			} else if (item.type === 'keyMap') {
				// 删除按键配置记录
				await $db.KeyMap.destroy({
					where: { id: item.id },
					individualHooks: true
				})
			} else if (item.type === 'user') {
				let { path } = await $db.User.findByPk(item.id)
				path = path
					.split(',')
					.filter(p => p != id)
					.join(',')
				await $db.User.update({ path }, { where: { username: item.id } })
			}
			await $db.Device.update({ nodeId: null }, { where: { sn: item.id, nodeId: id } })
		})
	}
	// 如果节点上关联资源有非多绑
	if (device) {
		let { attrs, type } = await $db.Device.findByPk(device)
		if (type === 'lora_watch') {
			attrs.groups = attrs.groups.map(item => {
				if (item.path == nodePath) {
					item.path = ''
					item.netAddr = '000.000.000.000'
				}
				return item
			})
			await $db.Device.update({ attrs }, { where: { sn: device } })
		}
		$db.Device.update({ nodeId: null }, { where: { sn: device } })
	}
})

// 节点更新，设备的绑定状态更新比较复杂，所以不适用钩子实现
// 因为需要beforeUpdate\afterUpdate, 但是beforeUpdate获取不到旧数据！！！
// 实现思路：
// 1. 节点原先没有绑定设备，afterUpdate更新设备的绑定状态
// 2. 节点原先绑定设备，beforeUpdate更新“旧设备”设nodeId未null；afterUpdate更新“新设备”的绑定状态
// 3. 节点原先绑定设备，后面取消绑定，同2
// 4. 节点原先绑定用户，先更新用户的path,再删除
// 删除
exports.remove = async (req, res, next) => {
	const { navigation } = req.locals
	const { id } = navigation
	try {
		const result = await $db.Navigation.destroyNode({
			where: { id },
			individualHooks: true
		})
		return res.json(result)
	} catch (error) {
		return next(error)
	}
}
