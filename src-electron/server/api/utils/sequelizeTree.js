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
	// init方法重写
	const init = TreeModel.init
	TreeModel.init = function (attributes, options) {
		let { tree = {}, indexes } = options
		// 处理参数
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

		// 索引添加path
		if (!indexes) {
			options.indexes = []
			indexes = options.indexes
		}
		indexes.push({ fields: [_t.path] })

		// 实际初始化
		return init.call(
			TreeModel,
			{
				...attributes,
				[_t.path]: { type: DataTypes.STRING }, // 路径
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
				[_t.unicastAddr]: { type: DataTypes.STRING }, // 路径
				[_t.broadcastAddr]: {
					type: DataTypes.STRING
				}
			},
			options
		)
	}

	// 获取节点-findOne
	TreeModel.findNode = async function (options = {}) {
		const _t = TreeModel._tree_options
		// 未找到直接原样返回
		const node = await TreeModel.findOne(options)
		if (!node) {
			return node
		}
		// 查询子节点，并组装返回
		const { level = -1 } = options.tree || {} // level < 0 代表获取全部子节点
		const children = await TreeModel.findAll({ where: { [_t.path]: { [Op.like]: `${curPath(node)}%` } } })
		return rebuildTree(node, children)
	}

	// 获取节点-findOne
	TreeModel.findNodeChildren = async function (node) {
		const _t = TreeModel._tree_options
		// 查询子节点，并组装返回
		const children = await TreeModel.findAll({ where: { [_t.path]: { [Op.like]: `${curPath(node)}%` } } })
		return children
	}

	// 创建节点-create
	TreeModel.createNode = async function (data = {}) {
		const _t = TreeModel._tree_options
		const pid = data[_t.pid]
		let node
		// 新增通知地址、转发地址
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
				[_t.unicastAddr]: unicastAddr, // 转发地址
				[_t.broadcastAddr]: broadcastAddr // 通知地址
			})
		} else {
			// 根节点
			node = await TreeModel.create({
				...data,
				[_t.path]: '',
				[_t.unicastAddr]: unicastAddr, // 转发地址
				[_t.broadcastAddr]: broadcastAddr // 通知地址
			})
		}
		return node
	}

	// 删除节点-destroy
	TreeModel.destroyNode = async function (options = {}) {
		const _t = TreeModel._tree_options
		// 未找到直接原样返回
		const node = await TreeModel.findOne(options)
		if (!node) {
			return node
		}
		// 删除节点
		const rows = await TreeModel.destroy(options)
		// 删除其所有子节点
		const childrenRows = await TreeModel.destroy({
			...options,
			where: { [_t.path]: { [Op.like]: `${curPath(node)}%` } }
		})

		return {
			rows,
			childrenRows
		}
	}

	// 更新节点-update
	// moveNode
	TreeModel.updateNode = async function (data = {}, options = {}) {
		const _t = TreeModel._tree_options
		const nodes = []
		data = omit(data, [_t.id, _t.path]) // id、path不允许修改
		// 未找到直接原样返回
		let node = await TreeModel.findOne(options)
		if (!node) {
			return node
		}
		// 有可能要改动位置
		if (_t.pid in data && node[_t.pid] !== data[_t.pid]) {
			// 根节点不允许移动
			if (!node[_t.path]) {
				throw new Error('root_can_not_move')
			}

			// 不允许移动到根下成为根节点
			if (!data[_t.pid]) {
				throw new Error('node_can_not_be_root')
			}

			// 检查要移动到的位置存在不存在
			const pNode = await TreeModel.findOne({ where: { [_t.id]: data[_t.pid] } })
			if (!pNode) {
				throw new Error('move_target_no_found')
			}

			// 获取整棵子树
			const tree = await TreeModel.findNode(options)

			// 重新计算整棵子树的group
			reCalcTree(tree, pNode, nodes)

			// 删除整棵子树
			await TreeModel.destroyNode(options)

			// 重新创建
			await TreeModel.bulkCreate(nodes)
		}

		// 更新数据
		const rows = await TreeModel.update(data, { ...options, where: { [_t.id]: node[_t.id] } })
		return { rows }
	}

	/** 工具方法 */
	// 拼接当前的路径
	function curPath(node = {}) {
		const _t = TreeModel._tree_options
		const path = node[_t.path]
		const id = node[_t.id]

		if (!id) {
			return ''
		}
		return path ? `${path}/${id}` : id + ''
	}

	// 构造树
	// toJSON
	function rebuildTree(node, children = []) {
		node = node.toJSON()
		const _t = TreeModel._tree_options
		// 归纳映射
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
		// 按层级由浅及深遍历映射重新组装children
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

	// 重新计算子树的path
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
