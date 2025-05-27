const { Model, DataTypes, Op } = require('sequelize')
const { mergeDeepRight } = require('./index')
const { omit } = require('lodash')

const STRATEGYS = {
	ADJACENCY_LIST: 'adjacency_list',
	PATH_ENUMERATIONS: 'path_enumerations',
	NESTED_SETS: 'nested_sets',
	CLOSURE_TABLE: 'closure_table'
}
module.exports = function useTreeModel(TreeModel) {
	// método init sobrescrito
	const init = TreeModel.init
	TreeModel.init = function (attributes, options) {
		let { tree = {}, indexes } = options
		// procesar parámetros
		const _t = mergeDeepRight(
			{
				strategy: STRATEGYS.PATH_ENUMERATIONS,
				path: 'path',
				id: 'id',
				pid: 'pid',
				children: 'children',
				orderNumber: 'orderNumber'
			},
			tree
		)
		TreeModel._tree_options = _t

		// agregar índice path
		if (!indexes) {
			options.indexes = []
			indexes = options.indexes
		}
		indexes.push({ fields: [_t.path] })

		// inicialización real
		return init.call(
			TreeModel,
			{
				...attributes,
				[_t.path]: { type: DataTypes.STRING }, // ruta
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
				}
			},
			options
		)
	}

	// obtener nodo-findOne
	TreeModel.findNode = async function (options = {}) {
		const _t = TreeModel._tree_options
		// si no se encuentra, devolver tal cual
		const node = await TreeModel.findOne(options)
		if (!node) {
			return node
		}
		// consultar nodos hijos y ensamblar retorno
		const { level = -1 } = options.tree || {} // level < 0 significa obtener todos los nodos hijos
		const children = await TreeModel.findAll({ where: { [_t.path]: { [Op.like]: `${curPath(node)}%` } } })
		return rebuildTree(node, children)
	}

	// Crear nodo
	TreeModel.createNode = async function (data = {}) {
		const _t = TreeModel._tree_options
		const pid = data[_t.pid]
		let node
		if (pid) {
			const pNode = await TreeModel.findByPk(pid)
			if (!pNode) {
				throw new Error('parent_node_not_found')
			}
			// Consultar nodos hijos y ensamblar retorno
			const children = await TreeModel.findAll({ where: { [_t.path]: { [Op.like]: `${curPath(pNode)}%` } } })

			// Modificar número de orden, si hay hijos con número de orden mayor o igual, se mueven hacia atrás
			const { orderNumber } = data
			const nodes = rebuildTree(pNode, children)
			if (nodes?.children?.length) {
				const conflict = nodes.children.filter(child => child.orderNumber == orderNumber)
				if (conflict.length) {
					nodes.children.map(child => {
						if (child.orderNumber >= orderNumber) {
							TreeModel.update({ orderNumber: child.orderNumber + 1 }, { where: { [_t.id]: child[_t.id] } })
						}
					})
				}
			}
			node = await TreeModel.create({
				...data,
				[_t.path]: curPath(pNode)
			})
		} else {
			// Nodo raíz
			node = await TreeModel.create({
				...data,
				[_t.path]: ''
			})
		}
		return node
	}

	// Eliminar nodo
	TreeModel.destroyNode = async function (options = {}) {
		const _t = TreeModel._tree_options
		// Si no se encuentra, devolver tal cual
		const node = await TreeModel.findOne(options)
		if (!node) {
			return node
		}
		// Actualizar orderNumber de los hermanos
		const sameRows = await TreeModel.findAll({
			where: { [_t.path]: node[_t.path], orderNumber: { [Op.gte]: node.orderNumber } }
		})
		if (sameRows.length) {
			sameRows.map(row => {
				TreeModel.update({ orderNumber: row.orderNumber - 1 }, { where: { [_t.id]: row[_t.id] } })
			})
		}
		// Eliminar nodo
		const rows = await TreeModel.destroy(options)
		// Eliminar todos sus hijos
		const childrenRows = await TreeModel.destroy({
			...options,
			where: { [_t.path]: { [Op.like]: `${curPath(node)}%` } }
		})

		return {
			rows,
			childrenRows
		}
	}

	// Actualizar nodo
	// Mover nodo
	TreeModel.updateNode = async function (data = {}, options = {}) {
		const _t = TreeModel._tree_options
		const nodes = []
		data = omit(data, [_t.id, _t.path]) // id y path no se pueden modificar
		// Si no se encuentra, devolver tal cual
		let node = await TreeModel.findOne(options)
		if (!node) {
			return node
		}
		// Puede que se deba cambiar de posición
		if (_t.pid in data && node[_t.pid] !== data[_t.pid]) {
			// No se permite mover el nodo raíz
			if (!node[_t.path]) {
				throw new Error('root_can_not_move')
			}

			// No se permite mover a la raíz para ser nodo raíz
			if (!data[_t.pid]) {
				throw new Error('node_can_not_be_root')
			}

			// Verificar si el destino existe
			const pNode = await TreeModel.findOne({ where: { [_t.id]: data[_t.pid] } })
			if (!pNode) {
				throw new Error('move_target_no_found')
			}
			// Obtener todo el subárbol
			const tree = await TreeModel.findNode(options)

			// Recalcular el grupo del subárbol
			reCalcTree(tree, pNode, nodes)

			// Eliminar todo el subárbol
			await TreeModel.destroyNode(options)

			// Volver a crear
			await TreeModel.bulkCreate(nodes)
		}
		// Actualizar número de orden
		if (_t.orderNumber in data && data[_t.pid]) {
			const pNode = await TreeModel.findByPk(data[_t.pid])
			// Consultar nodos hijos y ensamblar retorno
			const children = await TreeModel.findAll({ where: { [_t.path]: { [Op.like]: `${curPath(pNode)}%` } } })

			// Modificar número de orden, si hay hijos con número de orden mayor o igual, se mueven hacia atrás
			const { orderNumber, id } = data
			const pNodes = rebuildTree(pNode, children)
			if (pNodes?.children?.length) {
				const conflict = pNodes.children.filter(child => child.orderNumber == orderNumber && child.id !== node[_t.id])
				if (conflict.length) {
					pNodes.children.map(child => {
						if (child.orderNumber >= orderNumber) {
							TreeModel.update({ orderNumber: child.orderNumber + 1 }, { where: { [_t.id]: child[_t.id] } })
						}
					})
				}
			}
		}

		// Actualizar datos
		const rows = await TreeModel.update(data, { ...options, where: { [_t.id]: node[_t.id] } })
		return { rows }
	}

	/** Métodos utilitarios */
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
		// Mapear por id
		// id - item
		const idMap = {}
		idMap[String(node[_t.id])] = node
		// Mapa de hijos por path
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
		// Recorrer por niveles de menor a mayor profundidad y reensamblar los hijos
		// pathList = [ "1", "1/2", "1/3", "1/3/6" ]
		const pathList = Object.keys(pcMap).sort((a, b) => a.split('/').length - b.split('/').length)
		pathList.forEach(path => {
			const lastId = path.split('/').pop()
			idMap[lastId][_t.children] = pcMap[path]
				.map(item => idMap[item[_t.id]])
				.sort((a, b) => a.orderNumber - b.orderNumber)
		})

		return node
	}

	// Recalcular el path del subárbol
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
