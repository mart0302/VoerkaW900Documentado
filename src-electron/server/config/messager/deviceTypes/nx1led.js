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
const TYPE = "nx1led";

module.exports = ({ dbUtils, messager }) => {
    // El dispositivo dice que no puede entrar en conflicto con 999, así que simplemente comience desde 1000
    let id = 1000;
    // tid - { msgId, devices: ['xxxx', 'xxx'] }
    const tidCache = useKVCache({ life: 60 * 30 * 1000 });

    // Obtenga la configuración del LED y construya el cuerpo del mensaje
    function getAttrs(attrs) {
        if (isEmpty(attrs)) return attrs;
        let { speak, chordName, soundReminder, reminderMethod } = attrs;
        if (soundReminder && reminderMethod === "chord") {
            speak = false;
        } else if (soundReminder && reminderMethod === "voiceBroadcast") {
            chordName = 0;
            speak = true;
        } else if (!soundReminder) {
            chordName = 0;
            speak = false;
        }
        return { ...attrs, speak, chordName };
    }
    // Agregar un mensaje a nx1led (nx1led ejecuta la acción de agregar mensaje)
    function addMessage({
        path,
        message,
        domain,
        msgId,
        automaticpinout = 0,
        chordName = 1,
        chordPreset = false,
        devices = [],
        lan,
    } = {}) {
        // Ejecutar una acción
        devices.forEach((device) => {
            const { sn, nodePath, nodeId, attrs } = device;
            const prefix = [nodePath, nodeId].join("/");
            const trim = prefix.split("/").filter((item) => !!item).length;
            // Mensaje mostrado: 1. No incluye la posición actual de la barra, solo muestra la subposición; 2. Si la subposición aún excede 3 cuadrículas, mantenga solo 3 cuadrículas
            let messages = `${prunePath(path, { trim, keep: 3 })} ${message}`;
            if (lan?.value?.lan == "pl") {
                // Resuelve el problema de que la pantalla LED no puede mostrar el polaco normalmente. Los valores de código ASCII mayores a 127 deben convertirse a Unicode
                let escapeMsg = "";
                for (let i = 0; i < messages.length; i++) {
                    let char = messages[i];
                    if (char.charCodeAt(0) > 127) {
                        char =
                            char === "Ó"
                                ? "%u01A0"
                                : char === "ó"
                                ? "%u01A1"
                                : escape(char);
                    }
                    escapeMsg += char;
                }
                messages = escapeMsg;
            }
            // Configurar el cuerpo del mensaje
            let attrsPayload = getAttrs(
                chordPreset
                    ? Object.assign(attrs, { automaticpinout, chordName })
                    : attrs
            );
            messager.postAction(
                {
                    to: sn,
                    sid: true,
                    domain,
                },
                {
                    action: "add",
                    level: 3, // level 1-5, Mientras no sea 1, está bien, como se muestra en el documento del dispositivo nx1led
                    content: [messages],
                    msgId,
                    ...attrsPayload,
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
        const ids = group.split("/").map((item) => parseInt(item));
        // Encuentra todos los nodos en la ruta
        const nodes = await $db.Navigation.findAll({
            where: { id: { [Op.in]: ids } },
        });
        // Encuentra el dispositivo con dispositivos enlazados en el nodo
        // Porque el nodo solo tiene el número de serie del dispositivo, no el tipo de dispositivo; Al diseñarlo, debido a que usamos sqlite, para poder usar simplemente la clave externa, no le pusimos el tipo de dispositivo, por lo que se desperdició una consulta más.
        let sns = nodes.map((item) => item.device).filter((item) => item);
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
                    const { path, message, group, device } = payload;
                    // Comprueba si hay caché
                    const tidItem = tidCache.get(tid);
                    const lan = await $db.Setting.findByPk("current_language");
                    console.log("--------tidItem---------", tidItem);
                    // Con caché
                    if (tidItem) {
                        const { msgId, devices } = tidItem;
                        // Ejecutar la acción de visualización
                        addMessage({
                            lan,
                            path,
                            message,
                            domain,
                            msgId,
                            devices,
                        });
                    } else {
                        // Obtener todos los dispositivos nx1led en esta ruta de mensajes
                        const devices = await findNodeDevices({
                            group,
                            type: TYPE,
                        });
                        // Utilice el sn del buscapersonas como msgId para evitar que el mensaje de la pantalla LED se conserve debido al reinicio del dispositivo
                        const msgId = parseInt(device.sn, 16);
                        // Configuración del almacenamiento en caché
                        tidCache.set(tid, { msgId, devices });
                        // Ejecutar la acción de visualización
                        addMessage({
                            lan,
                            path,
                            message,
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

        /** La transacción se completa y se retira la barra de visualización. */
        if (tid && result >= TRANSACTION_RESULT.COMPLETED) {
            const tidItem = tidCache.get(tid);
            // Si no lo puede encontrar, no podrá cancelar la visualización del mensaje. Solo puedes seleccionar el dispositivo para realizar la acción: Borrar todo
            if (tidItem) {
                const { msgId, devices } = tidItem;
                removeMessage({ domain, msgId, devices });
                // Limpiar la caché
                tidCache.set(tid);
            }
        }
    };
};

/**
 * mantener indica cuántas celdas mantener
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
