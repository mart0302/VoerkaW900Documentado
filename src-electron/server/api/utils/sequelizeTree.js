const { Model, DataTypes, Op } = require('sequelize')
const { mergeDeepRight } = require('./index')
const { omit, padStart } = require('lodash')

const STRATEGYS = {
	ADJACENCY_LIST: 'adjacency_list',
	PATH_ENUMERATIONS: 'path_enumerations',
	NESTED_SETS: 'nested_sets',
	CLOSURE_TABLE: 'closure_table'
}
module.exports = function useTreeModel(TreeModel) {
	// Sobrescribir método init
	const init = TreeModel.init
	TreeModel.init = function (attributes, options) {
		let { tree = {}, indexes } = options
		// Procesar parámetros
		const _t = mergeDeepRight(
			{
				strategy: STRATEGYS.PATH_ENUMERATIONS,
				path: 'path',
				id: 'id',
				pid: 'pid',
				broadcastAddr: 'broadcastAddr',
				unicastAddr: 'unicastAddr',
				children: 'children'
			},
			tree
		)
		TreeModel._tree_options = _t

		// Agregar índice para path
		if (!indexes) {
			options.indexes = []
			indexes = options.indexes
		}
		indexes.push({ fields: [_t.path] })

		// Inicialización real
		return init.call(
			TreeModel,
			{
				...attributes,
				[_t.path]: { type: DataTypes.STRING }, // Ruta
				[_t.pid]: {
					type: DataTypes.VIRTUAL,
					get() {
						const path = this[_t.path]
						if (path) {
							const pid = path.split('/').pop()
							return isNaN(pid) ? 0 : Number(pid)
						} else {
							return 0
						}
					}
				},
				[_t.unicastAddr]: { type: DataTypes.STRING }, // Dirección unicast
				[_t.broadcastAddr]: {
					type: DataTypes.STRING
				}
			},
			options
		)
	}

	// Obtener nodo - findOne
	TreeModel.findNode = async function (options = {}) {
		const _t = TreeModel._tree_options
		// Si no se encuentra, devolver tal cual
		const node = await TreeModel.findOne(options)
		if (!node) {
			return node
		}
		// Consultar nodos hijos y ensamblar respuesta
		const { level = -1 } = options.tree || {} // level < 0 significa obtener todos los nodos hijos
		const children = await TreeModel.findAll({ where: { [_t.path]: { [Op.like]: `${curPath(node)}%` } } })
		return rebuildTree(node, children)
	}

	// Obtener nodo - findOne
	TreeModel.findNodeChildren = async function (node) {
		const _t = TreeModel._tree_options
		// Consultar nodos hijos y ensamblar respuesta
		const children = await TreeModel.findAll({ where: { [_t.path]: { [Op.like]: `${curPath(node)}%` } } })
		return children
	}

	// Crear nodo - create
	TreeModel.createNode = async function (data = {}) {
		const _t = TreeModel._tree_options
		const pid = data[_t.pid]
		let node
		// Agregar dirección de notificación y dirección de reenvío
		const addr =
			Math.ceil(Math.random() * 255) + '.' + Math.ceil(Math.random() * 255) + '.' + Math.ceil(Math.random() * 255) + '.'
		const broadcastAddr = addr + 254
		const unicastAddr = addr + 1
		if (pid) {
			const pNode = await TreeModel.findByPk(pid)
			if (!pNode) {
				throw new Error('parent_node_not_found')
			}
			node = await TreeModel.create({
				...data,
				[_t.path]: curPath(pNode),
				[_t.unicastAddr]: unicastAddr, // Dirección de reenvío
				[_t.broadcastAddr]: broadcastAddr // Dirección de notificación
			})
		} else {
			// Nodo raíz
			node = await TreeModel.create({
				...data,
				[_t.path]: '',
				[_t.unicastAddr]: unicastAddr, // Dirección de reenvío
				[_t.broadcastAddr]: broadcastAddr // Dirección de notificación
			})
		}
		return node
	}

	// Eliminar nodo - destroy
	TreeModel.destroyNode = async function (options = {}) {
		const _t = TreeModel._tree_options
		// Si no se encuentra, devolver tal cual
		const node = await TreeModel.findOne(options)
		if (!node) {
			return node
		}
		// Eliminar nodo
		const rows = await TreeModel.destroy(options)
		// Eliminar todos sus nodos hijos
		const childrenRows = await TreeModel.destroy({
			...options,
			where: { [_t.path]: { [Op.like]: `${curPath(node)}%` } }
		})

		return {
			rows,
			childrenRows
		}
	}

	// Actualizar nodo - update
	// moveNode
	TreeModel.updateNode = async function (data = {}, options = {}) {
		const _t = TreeModel._tree_options
		const nodes = []
		data = omit(data, [_t.id, _t.path]) // id y path no se pueden modificar
		// Si no se encuentra, devolver tal cual
		let node = await TreeModel.findOne(options)
		if (!node) {
			return node
		}
		// Posible cambio de posición
		if (_t.pid in data && node[_t.pid] !== data[_t.pid]) {
			// El nodo raíz no se puede mover
			if (!node[_t.path]) {
				throw new Error('root_can_not_move')
			}

			// No se permite mover a la raíz para convertirse en nodo raíz
			if (!data[_t.pid]) {
				throw new Error('node_can_not_be_root')
			}

			// Verificar si existe la posición de destino
			const pNode = await TreeModel.findOne({ where: { [_t.id]: data[_t.pid] } })
			if (!pNode) {
				throw new Error('move_target_no_found')
			}

			// Obtener todo el subárbol
			const tree = await TreeModel.findNode(options)

			// Recalcular el grupo para todo el subárbol
			reCalcTree(tree, pNode, nodes)

			// Eliminar todo el subárbol
			await TreeModel.destroyNode(options)

			// Recrear
			await TreeModel.bulkCreate(nodes)
		}

		// Actualizar datos
		const rows = await TreeModel.update(data, { ...options, where: { [_t.id]: node[_t.id] } })
		return { rows }
	}

	/** Métodos de utilidad */
	// Concatenar la ruta actual
	function curPath(node = {}) {
		const _t = TreeModel._tree_options
		const path = node[_t.path]
		const id = node[_t.id]

		if (!id) {
			return ''
		}
		return path ? `${path}/${id}` : id + ''
	}

	// Construir árbol
	// toJSON
	function rebuildTree(node, children = []) {
		node = node.toJSON()
		const _t = TreeModel._tree_options
		// Mapeo de resumen
		// id - item
		const idMap = {}
		idMap[String(node[_t.id])] = node
		// path - children map
		const pcMap = {}
		children.forEach(child => {
			child = child.toJSON()
			idMap[String(child[_t.id])] = child

			const path = child[_t.path]
			if (!pcMap[path]) {
				pcMap[path] = []
			}
			const pc = pcMap[path]
			pc.push(child)
		})
		// Recorrer el mapeo por niveles de superficial a profundo para reensamblar children
		// pathList = [ "1", "1/2", "1/3", "1/3/6" ]
		const pathList = Object.keys(pcMap).sort((a, b) => a.split('/').length - b.split('/').length)
		pathList.forEach(path => {
			const lastId = path.split('/').pop()
			if (idMap[lastId]) {
				idMap[lastId][_t.children] = pcMap[path].map(item => idMap[item[_t.id]])
			}
		})
		return node
	}

	// Recalcular path del subárbol
	function reCalcTree(tree, pNode, list = []) {
		const _t = TreeModel._tree_options

		tree[_t.path] = curPath(pNode)

		list.push(omit(tree, [_t.children]))

		const children = tree[_t.children]
		if (children && children.length) {
			children.forEach(child => {
				reCalcTree(child, tree, list)
			})
		}
	}
}
