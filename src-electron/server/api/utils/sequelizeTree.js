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
                broadcastAddr: 'broadcastAddr',
                unicastAddr: 'unicastAddr',
                children: 'children'
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
                },
                [_t.unicastAddr]: { type: DataTypes.STRING }, // ruta
                [_t.broadcastAddr]: {
                    type: DataTypes.STRING
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

    // obtener hijos del nodo-findOne
    TreeModel.findNodeChildren = async function (node) {
        const _t = TreeModel._tree_options
        // consultar nodos hijos y ensamblar retorno
        const children = await TreeModel.findAll({ where: { [_t.path]: { [Op.like]: `${curPath(node)}%` } } })
        return children
    }

    // crear nodo-create
    TreeModel.createNode = async function (data = {}) {
        const _t = TreeModel._tree_options
        const pid = data[_t.pid]
        let node
        // agregar dirección de notificación y de reenvío
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
                [_t.unicastAddr]: unicastAddr, // dirección de reenvío
                [_t.broadcastAddr]: broadcastAddr // dirección de notificación
            })
        } else {
            // nodo raíz
            node = await TreeModel.create({
                ...data,
                [_t.path]: '',
                [_t.unicastAddr]: unicastAddr, // dirección de reenvío
                [_t.broadcastAddr]: broadcastAddr // dirección de notificación
            })
        }
        return node
    }

    // eliminar nodo-destroy
    TreeModel.destroyNode = async function (options = {}) {
        const _t = TreeModel._tree_options
        // si no se encuentra, devolver tal cual
        const node = await TreeModel.findOne(options)
        if (!node) {
            return node
        }
        // eliminar nodo
        const rows = await TreeModel.destroy(options)
        // eliminar todos sus hijos
        const childrenRows = await TreeModel.destroy({
            ...options,
            where: { [_t.path]: { [Op.like]: `${curPath(node)}%` } }
        })

        return {
            rows,
            childrenRows
        }
    }

    // actualizar nodo-update
    // mover nodo
    TreeModel.updateNode = async function (data = {}, options = {}) {
        const _t = TreeModel._tree_options
        const nodes = []
        data = omit(data, [_t.id, _t.path]) // id y path no se pueden modificar
        // si no se encuentra, devolver tal cual
        let node = await TreeModel.findOne(options)
        if (!node) {
            return node
        }
        // puede que se deba cambiar de posición
        if (_t.pid in data && node[_t.pid] !== data[_t.pid]) {
            // no se permite mover el nodo raíz
            if (!node[_t.path]) {
                throw new Error('root_can_not_move')
            }

            // no se permite mover a la raíz para ser nodo raíz
            if (!data[_t.pid]) {
                throw new Error('node_can_not_be_root')
            }

            // verificar si el destino existe
            const pNode = await TreeModel.findOne({ where: { [_t.id]: data[_t.pid] } })
            if (!pNode) {
                throw new Error('move_target_no_found')
            }

            // obtener todo el subárbol
            const tree = await TreeModel.findNode(options)

            // recalcular el grupo del subárbol
            reCalcTree(tree, pNode, nodes)

            // eliminar todo el subárbol
            await TreeModel.destroyNode(options)

            // volver a crear
            await TreeModel.bulkCreate(nodes)
        }

        // actualizar datos
        const rows = await TreeModel.update(data, { ...options, where: { [_t.id]: node[_t.id] } })
        return { rows }
    }

    /** Métodos utilitarios */
    // concatenar la ruta actual
    function curPath(node = {}) {
        const _t = TreeModel._tree_options
        const path = node[_t.path]
        const id = node[_t.id]

        if (!id) {
            return ''
        }
        return path ? `${path}/${id}` : id + ''
    }

    // construir árbol
    // toJSON
    function rebuildTree(node, children = []) {
        node = node.toJSON()
        const _t = TreeModel._tree_options
        // mapear por id
        // id - item
        const idMap = {}
        idMap[String(node[_t.id])] = node
        // mapa de hijos por path
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
        // recorrer por niveles de menor a mayor profundidad y reensamblar los hijos
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

    // recalcular el path del subárbol
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
