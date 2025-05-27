// Procesando mensajes
const {
    RESPONSE_CODE,
    MESSAGE_TYPE,
    EVENT_CODE,
    TRANSACTION_RESULT,
} = require("@voerka/messager");
const { isEmpty } = require("lodash");
const { INTERCOM_PUSH_TYPE } = requireConfig("constant");
const fs = require("fs-extra");
const { Op } = require("sequelize");
const { useKVCache } = requireApi("utils/index");
const { upload: uploadConfig } = requireConfig("vars");
const { tts: ttsConfig } = uploadConfig;
const { destination } = ttsConfig;
const ttsPath = appPath.resolve.data(destination);

// Tipo de dispositivo
const TYPE = "nx1_wlcall_gateway"; //'intercom'

module.exports = ({ dbUtils, messager }) => {
    // El dispositivo dice que no puede entrar en conflicto con 999, así que simplemente comience desde 1000
    let id = 1000;
    // tid - { msgId, devices: ['xxxx', 'xxx'] }
    const tidCache = useKVCache({ life: 60 * 30 * 1000 });

    // Agregar un mensaje a nx1led (nx1led ejecuta la acción de agregar mensaje)
    function addWavFile({
        callerSn,
        path,
        message,
        domain,
        msgId,
        devices = [],
    } = {}) {
        // Ejecutar una acción
        devices.forEach(async (device) => {
            const { sn, nodePath, nodeId, attrs } = device;
            const prefix = [nodePath, nodeId].join("/");
            const trim = prefix.split("/").filter((item) => !!item).length;
            // Mensaje mostrado: 1. No incluye la posición actual de la barra, solo muestra la subposición; 2. Si la subposición aún excede 3 cuadrículas, mantenga solo 3 cuadrículas
            let messages = `${prunePath(path, { trim, keep: 3 })} ${message}`;

            const gatewayId = parseInt(sn, 16);
            // Determinar si el directorio de destino existe, si no, crearlo
            if (!fs.existsSync(ttsPath)) {
                fs.mkdirsSync(ttsPath);
            }
            $tts._saveWav(
                messages,
                msgId + gatewayId,
                ttsPath,
                async (code) => {
                    // Paquete de voz sintética 'C:\\Users\\Admin\\AppData\\Roaming\\@voerka\\w900\\Data\\temps\\6751595118430.wav'
                    if (code == 0) {
                        const id = parseInt(msgId + gatewayId) + "";
                        const fileName = `${id}.wav`;
                        const url = `/${destination}/${fileName}`;
                        let ttsAudio = await $db.TtsAudio.findByPk(id);
                        if (!ttsAudio) {
                            // Crear un registro
                            const maxOrderItem = await $db.TtsAudio.findAll({
                                where: { gatewaySn: device.sn },
                                order: [["orderId", "DESC"]],
                            }); // ASC
                            let orderId = 0;
                            if (maxOrderItem.length) {
                                orderId = maxOrderItem[0].orderId + 1;
                            }
                            $db.TtsAudio.create({
                                id,
                                gatewaySn: device.sn,
                                fileName,
                                url,
                                callerSn,
                                path,
                                orderId,
                                message: messages,
                                status: false,
                            });
                        } else {
                            // Actualizar registro
                            $db.TtsAudio.update(
                                { status: false, url: url },
                                { where: { id }, individualHooks: true }
                            );
                        }
                    }
                }
            );
        });
    }

    // Eliminar mensaje
    function removeMessage({ domain, msgId, devices = [] } = {}) {
        // Eliminar el archivo de audio
        // Ejecutar la acción动作
        devices.forEach(async (device) => {
            const { sn } = device;
            const gatewayId = parseInt(sn, 16);
            const id = parseInt(msgId + gatewayId) + "";
            let ttsAudio = await $db.TtsAudio.findByPk(id);
            if (ttsAudio) {
                // Primero elimine el archivo y luego opere la base de datos
                // Eliminar el archivo
                await $db.TtsAudio.destroy({
                    where: { id },
                    individualHooks: true,
                });
            }
        });
    }

    /**
     *  Obtener todos los dispositivos de puerta de enlace en esta ruta de mensajes
     * @param {*} param0
     * @returns { [{nodeId, nodePath, sn}] } devices
     */

    async function findNodeDevices({ group, type }) {
        const ids = group.split("/").map((item) => parseInt(item));
        // Encuentre el nodo del dispositivo con la función de intercomunicación habilitada en la ruta
        const intercomNodes = await $db.Navigation.findAll({
            where: {
                id: { [Op.in]: ids },
                intercom: { [Op.ne]: null },
                pushType: { [Op.ne]: INTERCOM_PUSH_TYPE.NOTICE },
            },
        });
        // Descubra los dispositivos con función de intercomunicación habilitada en el nodo.
        // let intercomNodes = nodes.filter(item => item.intercom)
        const sns = intercomNodes.map((item) => item.intercom);
        // Asamblea [{nodeId, nodePath, sn}]
        let res = [];
        const devices = await $db.Device.findAll({
            where: {
                sn: { [Op.in]: sns },
                [Op.or]: [{ type }, { type: "nx1_wlcall_gateway" }],
            },
        });
        intercomNodes.forEach((item) => {
            const { device: sn, related, intercom } = item;
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
            if (related.length && intercom) {
                related.forEach((resource) => {
                    if (resource.type !== "keyMap") {
                        const device = devices.find(
                            (i) => i.sn === resource.id
                        );
                        if (device && device.sn == intercom) {
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
        const { from: fromDevice, payload = {}, type, tid } = message;
        const { code, result } = payload;
        /** Manejar 80000 eventos de llamadas comerciales y agregarlos a la pantalla de la barra */
        if (type === MESSAGE_TYPE.EVENTS) {
            switch (Number(code)) {
                // Llamada de negocios
                case EVENT_CODE.APPLICATION_CALL:
                    const { path, message, group, device } = payload;
                    // Comprueba si hay caché
                    const tidItem = tidCache.get(tid);
                    // const lan = await $db.Setting.findByPk('current_language')
                    // Con caché
                    if (tidItem) {
                        const { msgId, devices } = tidItem;
                        // Ejecutar la acción de visualización
                        addWavFile({
                            callerSn: device.sn,
                            path,
                            message,
                            domain,
                            msgId,
                            devices,
                        });
                    } else {
                        // Obtener todos los dispositivos de intercomunicación en esta ruta de mensajes
                        const devices = await findNodeDevices({
                            group,
                            type: TYPE,
                        });
                        // Utilice el sn del buscapersonas como msgId para evitar que el mensaje de la pantalla LED se conserve debido al reinicio del dispositivo
                        const msgId = parseInt(device.sn, 16); // No se puede utilizar la notificación
                        // Configuración del almacenamiento en caché
                        tidCache.set(tid, { msgId, devices });
                        // 执行显示动作
                        addWavFile({
                            callerSn: device.sn,
                            path,
                            message,
                            domain,
                            msgId,
                            devices,
                        });
                    }
                    break;
                case RESPONSE_CODE.OK: // Puede ser un mensaje enviado después de que la puerta de enlace envía el paquete de voz.
                    // Busque la identificación, elimínela y envíe la siguiente notificación del paquete de audio
                    const { id } = payload;
                    const playedAudio = await $db.TtsAudio.findByPk(id);
                    if (playedAudio) {
                        // Estado de actualización
                        await $db.TtsAudio.destroy({
                            where: { id },
                            individualHooks: true,
                        });
                        // await $db.TtsAudio.update({ status: true }, { where: { id }, individualHooks: true })
                    }
                    // Encuentra el próximo paquete de voz y envía una notificación
                    const validAudios = await $db.TtsAudio.findAll({
                        where: { gatewaySn: fromDevice, status: false },
                        order: [["orderId", "ASC"]],
                    }); // ASC
                    if (validAudios.length) {
                        const nextAudio = validAudios[0].toJSON();
                        const { id, url } = nextAudio;
                        $messager.postAction(
                            {
                                to: fromDevice,
                                sid: true,
                                domain: $userConfig.domain,
                            },
                            {
                                action: "intercom",
                                msgId: parseInt(id),
                                url: url,
                            }
                        );
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
                // Limpiar la caché
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
