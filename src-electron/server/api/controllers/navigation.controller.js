const logger = requireConfig('logger')
const { differenceBy, difference, isEqual, pick, rearg } = require('lodash')
const { Op, QueryTypes } = require('sequelize')
const httpStatus = require('http-status')
const { mergeDeepRight } = require('../utils')
const { MULTIPLE_BIND_DEVICES } = requireConfig('constant')

// Cargar - parámetro id
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

// Obtener nodo
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

// Crear múltiples nodos
exports.createList = async (req, res, next) => {
	try {
		// Buscar todos los nodos descendientes del nodo a copiar, obtener nombres, ordenar por id, construir pid
		const { id, copyId } = req.body
		const navigation = await $db.Navigation.findByPk(copyId)
		const children = await $db.Navigation.findNodeChildren(navigation.toJSON())
		let newNodesMap = {}
		if (children.length) {
			for (let i = 0; i < children.length; i++) {
				// Construir pid, crear nodo
				const node = children[i].toJSON()
				if (node.pid === copyId) {
					const newNode = await $db.Navigation.createNode({ pid: id, title: node.title })
					newNodesMap[node.id] = { id: newNode.id, title: newNode.title } // Mapear el id del nodo hijo copiado con el id actual para obtener la relación padre-hijo correcta
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

// Crear nuevo
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

// Verificar si se debe desvincular
async function isUnbind(lastNode, node, deviceUnbindNode) {
	// Verificar si este nodo es el nodo a vincular
	if (lastNode.id === node.id) {
		// Indicar que ya está vinculado
		return false
	} else {
		// Verificar si es vinculación forzada
		if (!deviceUnbindNode) {
			// Si no es vinculación forzada, indicar que ya está vinculado
			return false
		} else {
			// Desvincular
			return true
		}
	}
}

// Obtener ID de grupo
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

// Construir grupos
async function getGroups(groups, node) {
	groups = getBoradcastAddr(groups, node, node)
	const path = node.path.split('/')
	const nodes = await $db.Navigation.findAll({
		where: { id: { [Op.in]: path } }
	})
	nodes.map(parent => {
		groups = getBoradcastAddr(groups, parent, node)
	})
	// Configurar dirección unicast
	id = getId(groups)
	groups = groups.filter(item => item.id !== id)
	groups = groups.concat([{ id, netAddr: node.unicastAddr, path: node.path ? node.path + '/' + node.id : node.id }])

	// Ordenar por id
	groups = groups.sort((a, b) => a.id - b.id)
	return groups
}

// Vinculación múltiple de dispositivos, si se permite la vinculación retorna los nuevos attrs, si no retorna false
async function isMultiple(node, attrs, counts) {
	let currentBind = attrs.groups.filter(item => item.path)
	if (currentBind.length && node.id === 1) return false
	if (currentBind.length === counts) {
		// Si el número actual de nodos vinculados alcanza el máximo permitido, retornar mensaje de aviso
		return false
	} else {
		// Verificar si el nodo a vincular cumple con las reglas de vinculación
		let i = 0
		while (i !== currentBind.length) {
			let currentPath = currentBind[i].path
			let path = node.path ? node.path + '/' + node.id : node.id
			if (
				currentPath == 1 ||
				(path !== currentPath && (path.indexOf(currentPath) !== -1 || currentPath.indexOf(path) !== -1))
			) {
				// Si el nodo a vincular ya está en la rama de un nodo vinculado, mostrar error
				return false
			} else {
				i++
			}
		}
		// Retornar attrs.groups
		attrs.groups = await getGroups(attrs.groups, node)
		return attrs
	}
}

// Verificar si el recurso se puede vincular, si no se puede retorna false, si se puede retorna true
async function isBindable(id, node, deviceUnbindNode) {
	// Verificar si el dispositivo permite múltiples vinculaciones
	let data = await $db.Device.findByPk(id)
	// Indica que el tipo de recurso a vincular no es un dispositivo
	if (!data) return true
	let { type, attrs } = data
	let isMultiplBindDevice = MULTIPLE_BIND_DEVICES[type]
	// Dispositivo de múltiples vinculaciones: solo se permite una vinculación por rama; vinculación libre
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
		// 1. Buscar en el dispositivo principal si está vinculado este dispositivo
		let lastNode = await $db.Navigation.findOne({ where: { device: id } })
		if (lastNode) {
			// Si ya está vinculado
			let isBinded = await isUnbind(lastNode, node, deviceUnbindNode)
			// Desvincular
			if (isBinded) await $db.Navigation.update({ device: null }, { where: { device: id }, individualHooks: true })
			return isBinded
		} else {
			// 2. Buscar en recursos relacionados si está vinculado este dispositivo
			let lastNode = await $db.sequelize.query(
				`SELECT Navigations.id, related FROM Navigations, json_each(Navigations.related) WHERE json_valid(Navigations.related) AND json_extract(json_each.value, '$.id') = '${id}'`,
				{
					type: QueryTypes.SELECT
				}
			)
			if (!lastNode.length) {
				// Sin nodo vinculado
				return true
			} else {
				lastNode = lastNode[0]
				let isBinded = await isUnbind(lastNode, node, deviceUnbindNode)
				// Desvincular
				let related = JSON.parse(lastNode.related).filter(item => item.id !== id)
				if (isBinded) await $db.Navigation.update({ related }, { where: { id: lastNode.id }, individualHooks: true })
				return isBinded
			}
		}
	}
}

// Editar
exports.update = async (req, res, next) => {
	const { deviceUnbindNode, deleteRelated } = req.query
	const { navigation } = req.locals
	const { id } = navigation
	let data = req.body
	try {
		/* Esta lógica es bastante compleja, por lo que priorizamos la legibilidad */
		let bindSource = false
		// 1. Verificar si el dispositivo ya está vinculado a un nodo
		if (data.device) {
			// 1. Vincular el dispositivo como dispositivo principal
			bindSource = await isBindable(data.device, navigation, deviceUnbindNode)
			if (!bindSource) {
				// El nodo ya tiene un dispositivo vinculado [Retornar]
				return next(new Error('error.device_has_binded_at_other_node'))
			} else {
				// 3. Si el dispositivo se puede vincular
				// Verificar si es vinculación múltiple, los dispositivos de vinculación múltiple necesitan actualizar attrs
				if (typeof bindSource === 'boolean') {
					// Actualizar el id del nodo vinculado al dispositivo
					await $db.Device.update({ nodeId: id }, { where: { sn: data.device } })
				} else {
					await $db.Device.update({ nodeId: id, attrs: bindSource }, { where: { sn: data.device } })
				}
			}
		}
		// Si el recurso relacionado es un objeto, vincularlo directamente
		if (data.related) {
			// Encontrar el recurso a actualizar
			let resource =
				navigation.related.length > data.related.length
					? differenceBy(navigation.related, data.related, 'id')[0]
					: differenceBy(data.related, navigation.related, 'id')[0]
			if (deleteRelated) {
				let device = await $db.Device.findByPk(resource.id)
				let attrs = device ? device.attrs : null
				if (navigation.intercom && navigation.intercom == resource.id) {
					// Si el dispositivo a desvincular es un intercomunicador, desactivar la función de intercomunicación del nodo
					data.intercom = null
				}
				if (attrs) {
					// Desvincular recurso
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
				// Desvincular usuario
				let user = await $db.User.findByPk(resource.id)
				if (user) {
					let path = user.path
						.split(',')
						.filter(pid => pid != id)
						.join(',')
					await $db.User.update({ path }, { where: { username: resource.id } })
				}
			} else {
				// 2. Vincular el dispositivo en recursos relacionados
				bindSource = await isBindable(resource.id, navigation, deviceUnbindNode)
				if (!bindSource) {
					// El nodo ya tiene un dispositivo vinculado [Retornar]
					return next(new Error('error.device_has_binded_at_other_node'))
				} else {
					// 3. Si el dispositivo se puede vincular
					// Actualizar el id del nodo vinculado al dispositivo
					// Verificar si es vinculación múltiple, los dispositivos de vinculación múltiple necesitan actualizar attrs
					if (typeof bindSource === 'boolean') {
						// Actualizar el id del nodo vinculado al dispositivo
						await $db.Device.update({ nodeId: id }, { where: { sn: resource.id } })
					} else {
						await $db.Device.update({ nodeId: id, attrs: bindSource }, { where: { sn: resource.id } })
					}
				}
			}
		}
		// device === null o device === undefined
		if (data.device === null) {
			// Desvincular dispositivo del nodo
			let device = await $db.Device.findByPk(navigation.device)
			if (navigation.intercom && navigation.intercom == navigation.device) {
				// Si el dispositivo a desvincular es un intercomunicador, desactivar la función de intercomunicación del nodo
				data.intercom = null
			}
			let attrs = device ? device.attrs : null
			let type = device ? device.type : null
			// Si se encuentra el dispositivo, evitar el problema de que la desvinculación no se complete debido a la eliminación del dispositivo y no se pueda encontrar el recurso del dispositivo
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
					// Establecer nodeId del dispositivo como null
					// Sin lógica: null reemplaza al dispositivo anterior
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
		// Actualizar base de datos
		const result = await $db.Navigation.updateNode(data, { where: { id }, individualHooks: true })
		// Retornar
		return res.json(result)
	} catch (error) {
		return next(error)
	}
}

// Obtener dispositivos de intercomunicación disponibles a partir de una lista
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

// Al eliminar un nodo, actualizar el estado de vinculación del dispositivo
$db.Navigation.addHook('afterDestroy', async (node, options) => {
	const { device, related, id, path } = node
	// Cambiar dirección de grupo
	// Primero desvincular
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
				// Eliminar registro de configuración de teclas
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
	// Si el nodo tiene recursos relacionados que no son de vinculación múltiple
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

// La actualización del estado de vinculación del dispositivo al actualizar un nodo es compleja, por lo que no se implementa usando hooks
// Porque se necesita beforeUpdate\afterUpdate, ¡pero beforeUpdate no puede obtener los datos antiguos!
// Idea de implementación:
// 1. Si el nodo no tenía dispositivo vinculado antes, afterUpdate actualiza el estado de vinculación del dispositivo
// 2. Si el nodo tenía dispositivo vinculado antes, beforeUpdate establece el nodeId del "dispositivo antiguo" como null; afterUpdate actualiza el estado de vinculación del "nuevo dispositivo"
// 3. Si el nodo tenía dispositivo vinculado antes y luego se cancela la vinculación, igual que 2
// 4. Si el nodo tenía usuario vinculado antes, primero actualizar el path del usuario, luego eliminar

// Eliminar
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
