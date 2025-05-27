// Procesando mensajes
const {
    RESPONSE_CODE,
    MESSAGE_TYPE,
    EVENT_CODE,
    TRANSACTION_STATUS,
    TRANSACTION_RESULT,
} = require("@voerka/messager");
const { isEmpty } = require("lodash");
const { Op } = require("sequelize");
const { useKVCache } = requireApi("utils/index");

// Tipo de dispositivo
const TYPE = "wlcallerhost";

module.exports = ({ dbUtils, messager }) => {
    // tid - { msgId, devices: ['xxxx', 'xxx'] }
    const tidCache = useKVCache({ life: 60 * 30 * 1000 }); // Si la modificación hace que la transacción se borre después de más de 30 segundos, no se podrá encontrar la transacción correspondiente.

    // Agregar un mensaje a nx1led (nx1led ejecuta la acción de agregar mensaje)
    function addMessage({ path, message, domain, msgId, devices = [] } = {}) {
        // Ejecutar una acción
        devices.forEach((device) => {
            const { sn, nodePath, nodeId } = device;
            const prefix = [nodePath, nodeId].join("/");
            const trim = prefix.split("/").filter((item) => !!item).length;
            // Mensaje mostrado: 1. No incluye la posición actual de la barra, solo muestra la subposición; 2. Si la subposición aún excede 3 cuadrículas, mantenga solo 3 cuadrículas
            let messages = `${prunePath(path, { trim, keep: 3 })} ${
                message.message
            }`;
            messager.postAction(
                {
                    to: sn,
                    sid: true,
                    domain,
                },
                {
                    action: "add",
                    msgId,
                    ...message,
                    content: messages,
                }
            );
        });
    }

    // Eliminar mensaje
    function removeMessage({ domain, msgId, devices = [] } = {}) {
        // Ejecutar una acción
        devices.forEach((device) => {
            const { sn } = device;
            messager.postAction(
                {
                    to: sn,
                    sid: true,
                    domain,
                },
                {
                    action: "remove",
                    msgId,
                }
            );
        });
    }

    /**
     *  Obtener todos los dispositivos nx1led en esta ruta de mensajes
     * @param {*} param0
     * @returns { [{nodeId, nodePath, sn}] } devices
     */
    async function findNodeDevices({ group, type }) {
        $log.info("wlcallerhost findNodeDevices+++++++++++++++++", group, type);
        const ids = group.split("/").map((item) => parseInt(item));
        // Encuentra todos los nodos en la ruta
        const nodes = await $db.Navigation.findAll({
            where: { id: { [Op.in]: ids } },
        });
        // Encuentra el dispositivo con dispositivos enlazados en el nodo
        // Porque el nodo solo tiene el número de serie del dispositivo, no el tipo de dispositivo; Al diseñarlo, debido a que usamos sqlite, para poder usar simplemente la clave externa, no le pusimos el tipo de dispositivo, por lo que se desperdició una consulta más.
        let sns = nodes.map((item) => item.device).filter((item) => item);
        $log.info("wlcallerhost findNodeDevices================", sns, nodes);
        // Descubra los recursos vinculados al nodo
        nodes.map((item) => {
            if (item.related.length) {
                item.related.map((resource) => {
                    if (resource.type !== "keyMap") sns.push(resource.id);
                });
            }
        });
        const devices = await $db.Device.findAll({
            where: { sn: { [Op.in]: sns }, type },
        });

        // Asamblea [{nodeId, nodePath, sn}]
        const res = [];
        nodes.forEach((item) => {
            const { device: sn, related } = item;
            if (sn) {
                const device = devices.find((i) => i.sn === sn);
                if (device) {
                    res.push({
                        nodeId: item.id,
                        nodePath: item.path,
                        sn: device.sn,
                        attrs: device.attrs,
                    });
                }
            }
            // Encuentra el dispositivo entre los recursos asociados
            if (related.length) {
                related.forEach((resource) => {
                    if (resource.type !== "keyMap") {
                        const device = devices.find(
                            (i) => i.sn === resource.id
                        );
                        if (device) {
                            res.push({
                                nodeId: item.id,
                                nodePath: item.path,
                                sn: device.sn,
                                attrs: device.attrs,
                            });
                        }
                    }
                });
            }
        });
        // devolver
        return res;
    }

    // Recibir mensajes
    return async ({ topic, message, domain, device }) => {
        const { payload = {}, type, tid } = message;
        const { code, result } = payload;
        /** Manejar 80000 eventos de llamadas comerciales y agregarlos a la pantalla de la barra */
        if (type === MESSAGE_TYPE.EVENTS) {
            switch (Number(code)) {
                // Llamada de negocios
                case EVENT_CODE.APPLICATION_CALL:
                    const { group, path } = payload;
                    // Comprueba si hay caché
                    const tidItem = tidCache.get(tid);
                    // Con caché
                    if (tidItem) {
                        const { msgId, devices } = tidItem;
                        // Ejecutar la acción de visualización
                        addMessage({
                            path,
                            message: payload,
                            domain,
                            msgId,
                            devices,
                        });
                    } else {
                        // Obtener todos los dispositivos wlcallerhost en esta ruta de mensajes
                        const devices = await findNodeDevices({
                            group,
                            type: TYPE,
                        });
                        if (!devices) break;
                        $log.info(
                            "wlcallerhost message+++++++++++++++++",
                            devices
                        );
                        // Utilice el sn del buscapersonas como msgId para evitar que el mensaje de la pantalla LED se conserve debido al reinicio del dispositivo
                        const msgId = tid;
                        // Configuración del almacenamiento en caché
                        tidCache.set(tid, { msgId, devices });
                        // Ejecutar la acción de visualización
                        addMessage({
                            path,
                            message: payload,
                            domain,
                            msgId,
                            devices,
                        });
                    }
                    break;
                default:
                    break;
            }
        } else if (type === MESSAGE_TYPE.ALARMS) {
            // Alertas
        }

        /** La transacción finaliza, elimine la barra de visualización */
        if (tid && result >= TRANSACTION_RESULT.COMPLETED) {
            const tidItem = tidCache.get(tid);
            // Si no lo puede encontrar, no podrá cancelar la visualización del mensaje. Solo puedes seleccionar el dispositivo para realizar la acción: Borrar todo
            if (tidItem) {
                const { msgId, devices } = tidItem;
                removeMessage({ domain, msgId, devices });
                // 清除缓存
                tidCache.set(tid);
            }
        }
    };
};

/**
 * mantener indica cuántas celdas mantener detrás
 * El recorte indica cuántas celdas se eliminan de la superficie de la tarjeta
 *Retirar primero y luego conservar.
 *
 * @param {*} path
 * @param { { keep, trim } } param1
 * @returns
 */
function prunePath(path, { trim = 0, keep = 3 }) {
    return path
        .split("/")
        .filter((item) => !!item)
        .slice(trim)
        .slice(-keep)
        .join("/");
}
