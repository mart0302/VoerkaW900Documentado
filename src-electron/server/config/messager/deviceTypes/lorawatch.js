// Procesamiento de mensajes: Los relojes y buscapersonas Lora son dispositivos que no pertenecen a la red y necesitan reenviar mensajes a través de una puerta de enlace.
const {
    MESSAGE_TYPE,
    EVENT_CODE,
    TRANSACTION_RESULT,
} = require("@voerka/messager");
const { uniq } = require("lodash");
const { Op } = require("sequelize");
const { useKVCache } = requireApi("utils/index");
const { encodeMessage, decodeMessage } = require("../../../../utils.js");
const { whereEq } = require("ramda");
const i18n = require("../../i18n");

i18n.init;

// Tipo de dispositivo
const TYPE = "lora_watch";

module.exports = ({ dbUtils, messager }) => {
    // El número de paquete del lado del dispositivo solo puede ser entre 0 y 255
    let id = 0;
    let gaptime = {};
    // tid - { msgId, devices: ['xxxx', 'xxx'] }
    const tidCache = useKVCache({ life: 60 * 30 * 1000 });

    // Agregar un mensaje a LoraWatch (LoraWatch ejecuta la acción de agregar mensaje)
    async function addMessage({
        path,
        message,
        domain,
        msgId,
        devices = [],
    } = {}) {
        // Ejecutar una acción
        $log.info(
            "【lorawatch】 addMessage+++++++++++++",
            path,
            message,
            domain,
            msgId,
            devices
        );
        // devices.forEach(async device => {
        const lan = await $db.Setting.findByPk("current_language");
        for (let i = 0; i < devices.length; i++) {
            let device = devices[i];
            $log.info("setTimeout addMessage------", device.sn);
            const { sn, nodePath, nodeId, parent } = device;
            let timestamp = gaptime[sn]
                ? new Date().getTime() - gaptime[sn]
                : 0;
            const prefix = [nodePath, nodeId].join("/");
            const trim = prefix.split("/").filter((item) => !!item).length;
            if (message == "timeout") {
                // Internacionalización
                i18n.setLocale(lan.value.lan);
                message = i18n.__(message);
            }
            // Mensaje mostrado: 1. No incluye la posición actual de la barra, solo muestra la subposición; 2. Si la subposición aún excede 3 cuadrículas, solo conserve 3 cuadrículas
            let messages = `${prunePath(path, { trim, keep: 3 })} ${message}`;
            const sid = messager._sid;
            if (gaptime[sn] && timestamp < 4 * 1000) {
                await messager._takeARest(4 * 1000);
            }
            // Garantizado enviar el primero inmediatamente
            gaptime[sn] = new Date().getTime();
            // Configurar el cuerpo del mensaje
            messager.postAction(
                {
                    to: sn,
                    sid: true,
                    domain,
                },
                {
                    action: "wireless_watch_transparent",
                    message: encodeMessage({
                        ...device,
                        msgId,
                        messages,
                        cmd: "SEND_MESSAGE",
                        lan,
                    }),
                }
            );
            await messager._takeARest(2000);
            messager.getActionAnswer(sid); // Respuesta clara
        }
        // })
    }

    // Configurar la identificación y frecuencia de la red de vigilancia

    /**
     * Obtener todos los dispositivos Lora Watch en esta ruta de mensajes
     * @param {*} param0
     * @returns { [{nodeId, nodePath, sn}] } devices
     */
    async function findNodeDevices({ group, type }) {
        const ids = group.split("/").map((item) => parseInt(item));
        // Encuentra todos los nodos en la ruta
        const nodes = await $db.Navigation.findAll({
            where: { id: { [Op.in]: ids } },
        });
        // Encuentre dispositivos de vigilancia y de enlace con reenvío en cada nodo

        // Solo cuando dos dispositivos están vinculados al nodo al mismo tiempo, el reenvío
        // Descubra los dispositivos que tienen dispositivos enlazados en el nodo
        //Porque el nodo solo tiene el número de serie del dispositivo, no el tipo de dispositivo; Al diseñarlo, debido a que usamos sqlite, para poder usar simplemente la clave externa, no le pusimos el tipo de dispositivo, por lo que se desperdició una consulta más.
        let sns = [];
        // Descubra los recursos vinculados al nodo
        nodes.map((item) => {
            if (item.related.length) {
                item.related.map((resource) => {
                    if (
                        resource.type == type ||
                        resource.type == "nx1_wlcall_gateway"
                    )
                        sns.push(resource.id);
                });
            }
            if (item.device) sns.push(item.device);
        });

        const devices = await $db.Device.findAll({
            where: {
                sn: { [Op.in]: sns },
                [Op.or]: [{ type }, { type: "nx1_wlcall_gateway" }],
            },
        });
        $log.info("devices==========", sns, devices.length);
        // Asamblea [{nodeId, nodePath, sn}]
        let res = [];
        nodes.forEach((item) => {
            const { device: sn, related } = item;
            // Encuentra el dispositivo entre los recursos asociados
            if (related.length) {
                let transfers = related.filter(
                    (device) =>
                        device.type === type ||
                        device.type == "nx1_wlcall_gateway"
                );
                if (sn) {
                    const dev = devices.find((i) => i.sn === sn);
                    if (
                        dev &&
                        (dev.type === type || dev.type == "nx1_wlcall_gateway")
                    ) {
                        transfers.push({ id: sn, type: dev.type });
                    }
                }
                transfers = uniq(transfers);
                $log.info("transfers==========", transfers);
                if (transfers.length >= 2) {
                    let gateways = transfers.filter(
                        (device) => device.type === "nx1_wlcall_gateway"
                    );
                    if (gateways.length) {
                        gateways.forEach((gateway) => {
                            const device = devices.find(
                                (i) => i.sn === gateway.id
                            );
                            if (device) {
                                // Cumplir con las condiciones de reenvío
                                res.push({
                                    nodeId: item.id,
                                    nodePath: item.path,
                                    sn: device.sn,
                                    attrs: device.attrs,
                                    unicastAddr: item.unicastAddr,
                                });
                            }
                        });
                    }
                }
            }
        });
        // devolver
        return { devices: res };
    }

    // Recibir mensajes
    return async ({ topic, message, domain, device }) => {
        const { payload = {}, type, tid } = message;
        const { code, result } = payload;
        /** Procesar 80000 eventos de llamadas comerciales y agregarlos a la pantalla de la barra */
        if (type === MESSAGE_TYPE.EVENTS) {
            switch (Number(code)) {
                // Llamada de negocios
                case EVENT_CODE.APPLICATION_CALL:
                    const { path, message, group, device } = payload;
                    // Comprueba si hay caché
                    const tidItem = tidCache.get(tid);
                    // Con caché
                    if (tidItem) {
                        const { devices } = tidItem;
                        // Por lo tanto, se debe garantizar que msgId sea diferente del anterior.
                        const msgId = id++;
                        if (id === 255) id = 0;
                        // Ejecutar la acción de visualización
                        addMessage({ path, message, domain, msgId, devices });
                    } else {
                        // Obtener todos los dispositivos lorawatch en esta ruta de mensajes
                        const { devices } = await findNodeDevices({
                            group,
                            type: TYPE,
                        });
                        // msgId es el número de paquete, que va de 0 a 255. Si el número de paquete es el mismo que el que se muestra actualmente en el reloj, el mensaje se ignorará y no se podrá mostrar.
                        // Por lo tanto, se debe garantizar que msgId sea diferente del anterior.
                        const msgId = id++;
                        if (id === 255) id = 0;
                        // Configuración del almacenamiento en caché
                        tidCache.set(tid, { msgId, devices });
                        // Ejecutar la acción de visualización
                        addMessage({ path, message, domain, msgId, devices });
                    }
                    break;
                case EVENT_CODE.IO_KEY:
                    const { transparent } = payload;
                    if (transparent) {
                        // // Transmisor con reenvío, desde está fijado en 0000000, obtiene el sn de la puerta de enlace analizando el tema
                        let topics = topic.split("/");
                        const gatewaySn = topics[topics.length - 2];
                        const gateway = await $db.Device.findByPk(gatewaySn);
                        if (gateway) {
                            // descodificación
                            if (transparent.endsWith("OD")) {
                                // Si el paquete termina con OD, significa que el reloj presiona manualmente la tecla para responder al código después de recibir el mensaje.
                            } else {
                                $log.info(
                                    "payload.transparent=====",
                                    transparent
                                );
                                let answerMsgs = decodeMessage(transparent);
                                // Actualizar la frecuencia de los atributos de la puerta de enlace":420,"netId":0
                                if (gateway.attrs.mode !== "transfer") {
                                    answerMsgs.mode = "transfer";
                                }
                                let attrs = { ...gateway.attrs, ...answerMsgs };
                                if (
                                    !whereEq(attrs)(gateway.attrs) ||
                                    !whereEq(gateway.attrs)(attrs)
                                ) {
                                    $log.info(
                                        "answerMsgs=====",
                                        gateway.attrs,
                                        attrs
                                    );
                                    await $db.Device.update(
                                        { attrs },
                                        { where: { sn: gatewaySn } }
                                    );
                                }
                            }
                        }
                    }
                    break;
                default:
                    break;
            }
        } else if (type === MESSAGE_TYPE.ALARMS) {
            // Alertas
        }

        /** La transacción ha terminado, el reloj Lora no tiene la función de quitar la barra de visualización. */
        if (tid && result >= TRANSACTION_RESULT.COMPLETED) {
            const tidItem = tidCache.get(tid);
            // Si no lo puede encontrar, no podrá cancelar la visualización del mensaje. Solo puedes seleccionar el dispositivo para realizar la acción: Borrar todo
            if (tidItem) {
                const { devices } = tidItem;
                const { path, message, group, device } = payload;
                $log.info("TRANSACTION_RESULT==================", payload);
                const msgId = id++;
                if (id === 255) id = 0;
                // Ejecutar la acción de visualización
                addMessage({ path, message, domain, msgId, devices });
                // Limpiar la caché
                tidCache.set(tid);
            }
        }
    };
};

/**
 *mantener indica cuántas celdas mantener detrás
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
