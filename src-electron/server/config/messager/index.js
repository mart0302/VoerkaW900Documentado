const {
    default: Messager,
    RESPONSE_CODE,
    MESSAGE_TYPE,
    EVENT_CODE,
    TRANSACTION_STATUS,
    TRANSACTION_RESULT,
} = require("@voerka/messager");

const MQTT = require("mqtt");
const { useCache } = requireApi("utils/index");
const {
    EVENT_TYPE,
    RES_TYPE_KEYMAP,
    KEYMAP_TYPE,
    RES_TYPE_DEVICE,
    CALL_SETTINGS,
} = require("../constant");
const { pick } = require("lodash");
const { genToken } = requireApi("utils/index");
const { Op, QueryTypes } = require("sequelize");
const logger = requireConfig("logger");
const { filter } = require("rxjs/operators");
const { encodeMessage } = require("../../../utils.js");
const moment = require("moment-timezone");

// TODO: En teoría, la asignación de teclas es la lógica del llamador y también debe extraerse a ./deviceTypes/wlcaller
// Lógica del mensaje de procesamiento del tipo de dispositivo
const installNx1ledService = require("./deviceTypes/nx1led");

const installLorawatchService = require("./deviceTypes/lorawatch");

const installCancelCallerService = require("./deviceTypes/cancelCaller");

const installWlcallerhostService = require("./deviceTypes/wlcallerhost");

const installIntercomService = require("./deviceTypes/intercom");

const { mergeDeepRight } = require("../../api/utils");

const installMeeyiCloudService = require("./deviceTypes/meeyiCloud");

// El servidor simula sn, porque el servidor también necesita enviar mensajes, y el mensaje debe tener una fuente, la fuente es el número de serie del dispositivo, asumiendo que el servidor también tiene el número de serie del dispositivo
const SERVER_SN = "w900_server1";

// Mensaje de respuesta a la acción
let actions = {};
module.exports = function createMessager($db) {
    const dbUtils = useDatabase($db);
    const { findDevice, findNodeBySn, findPathNodes, findKeyMapByPath } =
        dbUtils;

    const filterPools = {};
    const filterTimeGap = 5000;
    // Filtrado de eventos de E/S
    const filterIOKeyEvent = (key) => {
        const hit = filterPools[key];
        if (!hit) {
            filterPools[key] = Date.now() + filterTimeGap;
            return true;
        } else {
            if (Date.now() > hit) {
                filterPools[key] = Date.now() + filterTimeGap;
                return true;
            } else {
                return false;
            }
        }
    };

    const $messager = new Messager({
        MQTT,
        master: {
            url: "mqtt://127.0.0.1",
            clientId: SERVER_SN,
            voerka: {
                sn: SERVER_SN,
                domain: $userConfig.domain, // Se explica aquí que el backend solo admite un dominio, no varios dominios al mismo tiempo. Si desea admitir varios dominios, el dominio debe especificarse explícitamente cada vez que se envía un mensaje (TODO)
                subscriptions: ["/voerka/#"],
            },
            defineInSubject(subject) {
                return subject.pipe(
                    filter((item) => {
                        const { message } = item;
                        const { from: sn, payload = {}, type, id } = message;
                        const { code, key } = payload;
                        // Solo eventos de grupo de buscapersonas io
                        if (
                            type === MESSAGE_TYPE.EVENTS &&
                            code === EVENT_CODE.IO_KEY
                        ) {
                            return filterIOKeyEvent(`${sn}_${key}`);
                        } else {
                            return true;
                        }
                    })
                );
            },
        },
    });

    // Registrar procesos de negocio para cada tipo de dispositivo
    const nx1ledOnMsg = installNx1ledService({ dbUtils, messager: $messager });

    const lorawatchOnMsg = installLorawatchService({
        dbUtils,
        messager: $messager,
    });

    const cancelCallerOnMsg = installCancelCallerService({
        dbUtils,
        messager: $messager,
    });

    const wlcallerhostOnMsg = installWlcallerhostService({
        dbUtils,
        messager: $messager,
    });

    const intercomOnMsg = installIntercomService({
        dbUtils,
        messager: $messager,
    });

    const meeyicloudOnMsg = installMeeyiCloudService({
        dbUtils,
        messager: $messager,
    });

    // Distribuir los mensajes recibidos a cada tipo de dispositivo para manejar la lógica especializada
    function dispatchToDeviceTypes({ topic, message, domain, device }) {
        nx1ledOnMsg({ topic, message, domain, device });
        wlcallerhostOnMsg({ topic, message, domain, device });
        meeyicloudOnMsg({ topic, message, domain, device });
        intercomOnMsg({ topic, message, domain, device });
    }

    /** método */
    /**
     * Convertir mensajes IO [incluido el envío de mensajes]
     * Convertir y enviar un mensaje indicando que la conversión se ha completado
     * @return
     */
    async function transformIoMessage({
        ioMessage,
        path,
        keymap,
        device,
        groupId,
    }) {
        const key = ioMessage.payload.key;
        const {
            message = "",
            type = KEYMAP_TYPE.CALL,
            color,
            code,
            level,
        } = parseKeymap(keymap, key);
        // Ruta semántica
        const semanticPath = path
            .map((item) => item.title)
            .reverse()
            .join("/");
        // camino
        const group = path
            .map((item) => item.id)
            .reverse()
            .join("/");

        if (type === KEYMAP_TYPE.ALARM) {
            // Enviar una alerta
            return $messager.postAlarm(
                {
                    tid: true, // Todas las alarmas convertidas crearán nuevas transacciones [se pueden optimizar según el negocio]
                    group,
                    from: device.sn, // El servidor es solo un proxy para convertir mensajes. De hecho, aunque el mensaje lo envía el servidor, el from sigue siendo el sn anterior, lo que resulta conveniente para la escritura de código posterior.
                },
                {
                    type,
                    message,
                    color,
                    group,
                    path: semanticPath,
                    device: pick(device, ["sn", "title"]),
                    code, // Según la definición en la asignación de claves
                    level,
                    progress: 10,
                    result: TRANSACTION_RESULT.HANDLING,
                }
            );
        } else {
            // Código de evento, progreso de la transacción y resultados
            // Llamar a un evento o cancelar una transacción
            const typeRes =
                type === KEYMAP_TYPE.CANCEL // 取消呼叫
                    ? {
                          code: EVENT_CODE.DEVICE_TRANS_PROGRESS,
                          progress: 100,
                          result: TRANSACTION_RESULT.COMPLETED, // El departamento de productos requiere que el botón Cancelar se considere como la finalización de esta llamada.
                          remarks: message,
                          handler: {
                              sn: device.sn,
                              type: device.type,
                              title: device.title,
                          },
                      }
                    : {
                          // llamar
                          code: EVENT_CODE.APPLICATION_CALL,
                          progress: 10,
                          result: TRANSACTION_RESULT.HANDLING,
                      };

            // Si el dispositivo tiene transacciones que no se han completado, se contabilizarán en esta transacción. Si se cancela significa que la transacción acaba de finalizar.
            const transaction = await $db.Transaction.findOne({
                where: {
                    sn: device.sn, // Las transacciones enviadas por el mismo dispositivo se consideran la misma transacción. También puedes utilizar un grupo para que los distintos dispositivos del mismo nodo se consideren como una sola transacción.
                    result: { [Op.lt]: TRANSACTION_RESULT.COMPLETED }, // Transacción no completada
                    code: EVENT_CODE.APPLICATION_CALL, // La hora de inicio es la llamada
                },
            });

            // Si el llamador actual no tiene una transacción, pero envía un evento de tecla de cancelación
            // Ninguno, como cancelar
            if (!transaction && type === KEYMAP_TYPE.CANCEL) {
                return;
            }

            // Envío de eventos
            return $messager.postEvent(
                {
                    tid: transaction ? transaction.id : true,
                    group,
                    from: device.sn, // El servidor es solo un proxy para convertir mensajes. De hecho, aunque el mensaje lo envía el servidor, el from sigue siendo el sn anterior, lo que resulta conveniente para la escritura de código posterior.
                },
                {
                    key,
                    groupId,
                    type,
                    message,
                    color,
                    group,
                    path: semanticPath,
                    device: pick(device, ["sn", "title"]),
                    ...typeRes,
                }
            );
        }
    }

    /**
     * Eventos de almacenamiento (incluidas alarmas) [Operaciones de base de datos, excluyendo el envío de mensajes]
     */
    async function saveDbEvent(msg = {}) {
        const { id, timestamp, from: sn, type, payload = {}, tid } = msg;
        const {
            code,
            message,
            remarks,
            location = {},
            level,
            group,
            path,
            result,
        } = payload;

        // Si hay una transacción involucrada, primero cree/actualice la transacción (de lo contrario, la clave externa del evento informará un error)
        if (tid) {
            const trans = await saveDbTransaction(msg);
            if (!trans) {
                // La transacción ya murió, no es necesario procesarla nuevamente
                return;
            }
        }

        // Crear un evento
        let event = await $db.Event.create({
            id,
            type:
                type === MESSAGE_TYPE.ALARMS
                    ? EVENT_TYPE.ALARM
                    : EVENT_TYPE.EVENT,
            code,
            message,
            remarks,
            location,
            level,
            group,
            path,
            originalPayload: payload,
            triggerTime: new Date(timestamp),
            receiveTime: new Date(),
            handleTime: null,
            result,
            tid,
            sn: sn === SERVER_SN ? null : sn, // Si es un mensajero de servidor, no hay sn, de lo contrario todos los dispositivos que ingresan aquí son dispositivos autenticados
        });

        // Para las alarmas, se realizan implementaciones especiales para 1005-alarma cancelada y 1006-alarma procesada
        // Método de procesamiento de alarmas: 1. Progreso de la transacción (no reconocido) 2. Eventos 1005, 1006
        // Es decir, la alarma está separada de la transacción. La cancelación de la alarma solo reconoce los eventos 1005 y 1006. Una transacción puede tener múltiples alarmas.
        await updateDbAlarm(msg);

        event = event.toJSON();

        return event;
    }

    /**
     * Transacciones de almacenamiento (incluidas actualizaciones) [operaciones de base de datos, excluido el envío de mensajes]
     */
    async function saveDbTransaction(msg = {}) {
        const { timestamp, from: sn, type, payload = {}, tid } = msg;
        const {
            code,
            message,
            group,
            path,
            result,
            progress,
            remarks,
            handler = {},
        } = payload;

        if (!tid) {
            return;
        }
        const { callPrecaution } = $settings.get(CALL_SETTINGS);
        let transaction = await $db.Transaction.findByPk(tid);
        if (!transaction) {
            // No existe, crea una transacción
            transaction = await $db.Transaction.create({
                id: tid,
                title: message,
                originalPayload: payload,
                remarks,
                handler,
                // Caso extremo: debido a razones de red u otros problemas, el mensajero solo recibe un mensaje para esta transacción, y resulta ser el último.
                completeTime:
                    progress >= 100 || result >= 10 ? new Date() : null,
                precaution:
                    Date.now() - timestamp > callPrecaution ? true : false,
                progress: progress || 10, // El valor predeterminado comienza desde 10, de lo contrario comienza desde 0
                result,
                status:
                    progress >= 100 || result >= 10
                        ? TRANSACTION_STATUS.COMPLETED
                        : TRANSACTION_STATUS.PROGRESSING,
                startTime: new Date(timestamp),
                // Los siguientes datos heredan la primera alarma o evento de la transacción
                type:
                    type === MESSAGE_TYPE.EVENTS
                        ? EVENT_TYPE.EVENT
                        : EVENT_TYPE.ALARM,
                code,
                group,
                path,
                sn: sn === SERVER_SN ? null : sn,
            });
        } else {
            // Determinar si la transacción ha muerto y ya no se procesa la transacción completada
            if (transaction.result < TRANSACTION_RESULT.COMPLETED) {
                const { callTimeout } = $settings.get(CALL_SETTINGS);

                // Ya existe, actualizar transacción
                const completeTime =
                    progress >= 100 || result >= 10
                        ? Math.min(
                              new Date(),
                              transaction.startTime.valueOf() + callTimeout
                          )
                        : null;
                await $db.Transaction.update(
                    {
                        title:
                            code === EVENT_CODE.APPLICATION_CALL
                                ? message
                                : transaction.message, // El título se basa en el último mensaje de evento de llamada (no se incluyen la cancelación ni el procesamiento de transacciones)
                        originalPayload: payload, // originalPayload se basa en la última versión
                        remarks, // Observaciones La última versión prevalecerá.
                        handler,
                        path, // Si el nodo ha cambiado cuando se cambia la clave, también es necesario cambiarlo.
                        completeTime, // Independientemente de que sea 1003
                        duration: completeTime
                            ? completeTime - transaction.startTime
                            : null,
                        precaution:
                            Date.now() - transaction.startTime > callPrecaution
                                ? true
                                : false, // Determinar si se ha excedido el tiempo de advertencia según la configuración
                        progress,
                        result,
                        status:
                            progress >= 100 || result >= 10
                                ? TRANSACTION_STATUS.COMPLETED
                                : TRANSACTION_STATUS.PROGRESSING,
                    },
                    { where: { id: tid }, individualHooks: true } // individualHooks=true se puede monitorear en la función de gancho
                );
                transaction = await $db.Transaction.findByPk(tid);
            } else {
                // La transacción ya ha finalizado, lo que indica a la capa externa que ya no es necesario procesarla.
                return false;
            }
        }

        transaction = transaction.toJSON();

        return transaction;
    }

    /**
     * Alerta de actualización [Operación de base de datos, no incluye envío de mensajes]
     * Según el procesamiento del evento antes de una alarma
     * http://192.168.38.165:8900/rdcenter/voerkadocs/protocols/common/Device Event Management.html#Evento de dispositivo (1xxx)
     * @param {*} msg
     */
    async function updateDbAlarm(msg = {}) {
        const { payload = {} } = msg;
        const { code, alarmId, alarmResult, userId, remarks } = payload;

        // No 1005 ni 1006, regresa
        if (
            code !== EVENT_CODE.DEVICE_ALARM_CANCELLED &&
            code !== EVENT_CODE.DEVICE_ALARM_HANDLED
        ) {
            return;
        }
        // Sin alarmId, regresa
        if (!alarmId) {
            return;
        }
        const alarm = await $db.Event.findByPk(alarmId);
        // No encuentro la alarma, regresa
        if (!alarm) {
            return;
        }

        // Alerta de actualización
        const { alarmTimeout } = $settings.get(CALL_SETTINGS);
        await $db.Event.update(
            {
                handleTime: Math.min(
                    new Date(),
                    alarm.triggerTime.valueOf() + alarmTimeout
                ),
                result: alarmResult,
                status: TRANSACTION_STATUS.COMPLETED,
                remarks,
                userId,
            },
            { where: { id: alarmId }, individualHooks: true }
        );
    }

    /**
     * Manejar alertas de entidades
     *
     *Este es un último recurso.
     * Debe escribirse en el controlador, pero debido a que necesitamos manejar tiempos de espera, y el tiempo de espera de la alarma también es una operación compleja que involucra múltiples puntos, se debe considerar la reutilización;
     *Pero ¿el controlador llama al mensajero o el mensajero llama al controlador? Considere si el controlador debe llamar al mensajero
     *
     * @param { id, tid, type, result, group } alarm
     * @param { result, remarks } params
     */
    async function handleEntityAlarm(alarm, params = {}) {
        // Parámetros de procesamiento
        const {
            result,
            remarks = "",
            resultTitle = "",
            syncTransaction,
        } = params;

        // Si no es una alarma, devuelve un error
        if (alarm.type !== EVENT_TYPE.ALARM) {
            throw $APIError.NotFound("error.alarm_not_found");
        }

        // Si se ha procesado la alarma, se devuelve un error.
        if (alarm.result >= TRANSACTION_RESULT.COMPLETED) {
            //La alarma permite que se procese repetidamente
            // lanzar $APIError.NotFound('error.alarm_already_ended')
        }

        // Actualizar los resultados de la alarma
        const { alarmTimeout } = $settings.get(CALL_SETTINGS);
        await $db.Event.update(
            {
                result,
                remarks,
                handleTime: Math.min(
                    new Date(),
                    alarm.triggerTime.valueOf() + alarmTimeout
                ),
                status: TRANSACTION_STATUS.COMPLETED,
            },
            { where: { id: alarm.id } }
        );

        /**
         * Procesamiento de transacciones sincrónicas
         *
         * Originalmente planeé usar el interruptor syncTransaction para permitir que el front-end implemente las siguientes opciones: 1. Procesar alertas y transacciones al mismo tiempo 2. Procesar solo alertas
         * Sin embargo, en la implementación, se encuentra que si se lleva un resultado a cualquier transacción, es imposible distinguir si se está procesando una alarma o una transacción, por lo que generalmente se juzga procesar ambas.
         */
        if (!alarm.tid) {
            throw $APIError.NotFound("error.transaction_not_found");
        }
        // Enviar un mensaje
        // Emitir eventos 1005/1006 (eventos de alarma cancelados/procesados). Este evento también es una transacción y el progreso es 100. El resultado es >= 10. No es simplemente un evento de progreso de transacción, sino 1005/1006.
        const { message, topic } = $messager.handleAlarm(
            {
                w900: { solved: true }, // Dígale al mensajero del servidor que este mensaje ha sido procesado y que no necesita procesarlo nuevamente
                tid: alarm.tid,
                group: alarm.group,
            },
            {
                result,
                resultTitle,
                progress: 100,
                remarks,
                alarmId: alarm.id,
                alarmResult: result,
                alarmCode: alarm.code,
                userId: "", // Los usuarios múltiples posteriores deben especificar el usuario que se procesará y el tiempo de espera predeterminado es el del sistema.
            },
            {
                straight: true, // Dígale al mensajero que este mensaje no espera a que mqtt pase una vez, sino que ingresa directamente a la fase de recepción.
            }
        );
        // Procesando mensajes
        const event = await $messager.saveDbEvent(message);
        if (!event) {
            const transaction = await $db.Transaction.findByPk(alarm.tid);
            await fixTransactionFinished(transaction);
        }
    }

    /**
     * Manejo de asuntos de entidades
     * @param { id, group } transaction
     * @param { result, progress, remarks, message } payload
     */
    async function handleEntityTransaction(transaction, payload = {}) {
        // Enviar mensaje
        let { originalPayload } = transaction;
        if (originalPayload && typeof originalPayload == "string") {
            originalPayload = JSON.parse(originalPayload);
        }
        const origin = originalPayload
            ? {
                  groupId: originalPayload.groupId,
                  type: originalPayload.type,
                  device: originalPayload.device,
              }
            : {};
        const { message, topic } = $messager.setTransactionProgress(
            {
                w900: { solved: true }, // Dígale al mensajero del servidor que este mensaje ha sido procesado y que no necesita procesarlo nuevamente
                tid: transaction.id,
                group: transaction.group,
            },
            {
                ...origin,
                ...payload,
                path: transaction.path,
            },
            {
                straight: true, // Dígale al mensajero que este mensaje no espera a que mqtt pase una vez, sino que va directamente al enlace de recepción, porque ha sido marcado como "procesado" anteriormente, por lo que no tiene mucho sentido aquí.
            }
        );
        // Procesando mensajes
        const event = await $messager.saveDbEvent(message);
        if (!event) {
            await fixTransactionFinished(transaction);
        }
    }

    // Algunas transacciones han finalizado, pero aún se realiza una solicitud para finalizar la transacción, por lo que se utiliza este método
    async function fixTransactionFinished(transaction) {
        // La transacción ha finalizado, pero el usuario intentó finalizarla nuevamente. Esto puede ser un error de datos. Simplemente actualice los datos y no se producirá ningún error.
        const { id, completeTime, result, startTime } = transaction;
        const { callTimeout, callPrecaution } = $settings.get(CALL_SETTINGS);

        let timeFix = {};
        if (!completeTime) {
            // Se corrige el error con la hora de finalización si no hay hora de finalización
            const completeTime = Math.min(
                Date.now(),
                startTime.valueOf() + callTimeout
            );
            timeFix = {
                completeTime,
                duration: completeTime - startTime,
                precaution:
                    completeTime - startTime > callPrecaution ? true : false,
            };
        }
        await $db.Transaction.update(
            {
                ...timeFix,
                progress: 100,
                // Si se alcanza el tiempo de espera, el resultado es un tiempo de espera; de lo contrario, se utiliza el resultado anterior.
                result:
                    timeFix.duration >= callTimeout
                        ? TRANSACTION_RESULT.TIMEOUT
                        : result || TRANSACTION_RESULT.COMPLETED,
                status: TRANSACTION_STATUS.COMPLETED,
            },
            { where: { id }, individualHooks: false } // No es necesario activar eventos de cambio de recursos aquí, solo modificarlos silenciosamente
        );
    }

    // Muchos cambios deben notificarse a todos los dispositivos host
    async function sendHostAttrs(data) {
        // Envío de eventos de cambio de atributos
        const devs = await $db.Device.findAll({
            where: { type: "wlcallerhost" },
        });
        if (devs.length) {
            devs.map((device) => {
                $messager.postAttrs(
                    {
                        to: device.sn,
                        sid: true,
                        domain: device.mqtt.domain || $userConfig.domain,
                    }, // El dominio se puede agregar o no, porque este proyecto es un dominio único.
                    { ...data }
                );
            });
        }
    }

    /**
     * Supervisar los cambios en la base de datos y emitir automáticamente eventos de cambio de recursos
     *
     * Creación de recursos/actualización de recursos/eliminación de recursos
     */
    function useDbResourceEvent(model, { type, pk = "id" } = {}) {
        model.addHook("afterCreate", (res, options) => {
            $messager.postResCreated({ type, id: res[pk] }, res.toJSON());
        });

        model.addHook("afterDestroy", (res, options) => {
            // postResDeleted
            $messager.postResDeleted({ type, id: res[pk] }, res.toJSON());
        });

        model.addHook("afterUpdate", (res, options) => {
            // postResUpdated
            $messager.postResUpdated({ type, id: res[pk] }, res.toJSON());
        });
    }

    /** Procesamiento de mensajes recibidos */
    $messager.onMessage(async (data) => {
        const { topic, message } = data;
        $log.info("[onMessage] topic is:", topic);
        // $log.info('[onMessage] message is:', message)
        const { domain, rs } = parseTopic(topic);
        const {
            from: fromDevice,
            payload = {},
            sid,
            type,
            w900 = {},
        } = message;
        // TODO: Si es estricto, solo se permitirá el dominio seleccionado actualmente, es decir, $userConfig.domain
        if (!domain || !fromDevice || rs) {
            return;
        }
        // Indica que el negocio de este mensaje ha sido procesado y no necesita ser procesado nuevamente; Generalmente se procesa en el controlador y luego se envía el evento.
        if (w900.solved) {
            // Distribuir al tipo de dispositivo
            const { value } = await $db.Setting.findByPk("call_settings");
            // Tiempo muerto y sin empuje
            if (
                value?.timeoutPush ||
                typeof value.timeoutPush == "undefined" ||
                payload.result !== 15
            )
                lorawatchOnMsg({ topic, message, domain });
            dispatchToDeviceTypes({ topic, message, domain });
            return;
        }
        // Si el dispositivo no está autenticado (no está en la base de datos)，device === null
        const device = await findDevice(fromDevice);
        /** Registro del dispositivo [Apagar el dispositivo] */
        if (topic.endsWith("/register")) {
            $log.info("[register] device is:", device?.sn, fromDevice);
            const { host, port } = $userConfig;
            if (device) {
                // Registro exitoso
                $log.info("[register] before postAnswer");
                const timezone = moment().format("Z");
                const node = await findNodeBySn(device.sn);
                let group = "";
                let groupId = "";
                if (node) {
                    groupId = node.id;
                    // Encontrar la ruta del nodo de navegación
                    const pathNodes = findPathNodes(node.id);
                    group = pathNodes
                        .map((item) => item.title)
                        .reverse()
                        .join("/");
                }
                $messager.postAnswer(
                    { to: fromDevice, domain, code: RESPONSE_CODE.OK, sid },
                    {
                        workerID: device.workerID,
                        token: genToken({
                            id: device.sn,
                            type: RES_TYPE_DEVICE,
                        }),
                        web: {
                            host,
                            port,
                        },
                        group,
                        groupId,
                        timezone: "GMT" + timezone,
                    }
                );
                $log.info("[register] after postAnswer");
                let attrs = device.attrs;
                // $log.info('wireless_watch+++++++++++++++++++++', device.sn, payload)
                // Identificar si la puerta de enlace tiene función de reenvío
                if (payload["wireless_watch"]) {
                    attrs.mode = "transfer";
                }
                if (payload["interphone"]) {
                    attrs.intercom = true;
                }
                const network = payload?.network?.eth0;
                let networks = device.networks;
                if (network)
                    networks[0] = mergeDeepRight(networks[0], {
                        ip: network.ip,
                        dns_prefer: network.dnsPrefer,
                        dns_alter: network.dnsAlter,
                        subnetmask: network.subnetMask,
                        gateway: network.gateway,
                        dhcp: network.dhcp,
                    });
                const mqtt = mergeDeepRight(device.mqtt, {
                    broker: payload?.mqtt?.broker,
                    domain: payload?.domain,
                });
                await $db.Device.update(
                    {
                        online: true,
                        attrs,
                        version: payload.version,
                        mqtt,
                        networks,
                    },
                    { where: { sn: device.sn } }
                );
                // Cuando se conecte exitosamente a la puerta de enlace con reenvío, envíe la información del número de red de frecuencia
                if (
                    payload.type === "nx1_wlcall_gateway" &&
                    payload["wireless_watch"]
                ) {
                    $messager.postAction(
                        {
                            to: fromDevice,
                            sid: true,
                            domain,
                        },
                        {
                            action: "wireless_watch_transparent",
                            message: encodeMessage({
                                frequency: device.attrs.frequency,
                                sn: fromDevice,
                                netId: device.attrs.netId,
                                cmd: "READ_LAUNCHER",
                            }),
                        }
                    );
                    if (payload["interphone"]) {
                        // Determine si la puerta de enlace tiene habilitada la función de intercomunicador. Si se ha registrado y vinculado, determine si está permitido habilitarlo.
                        // Si actualmente hay un paquete de audio inactivo, se debe enviar una notificación。
                        const validAudios = await $db.TtsAudio.findAll({
                            where: { gatewaySn: payload.sn, status: false },
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
                    }
                } else if (payload.type === "nx1led") {
                    // Si es una pantalla LED, envía la hora de sincronización de la zona horaria actual
                    const timezone = moment().format("Z");
                    $log.info("timezone=========", timezone);
                    $messager.postAction(
                        {
                            to: fromDevice,
                            sid: true,
                            domain,
                        },
                        {
                            action: "modify",
                            timezone: "utc" + timezone,
                        }
                    );
                }
            } else {
                // Si el dispositivo no está autenticado, debe devolver un registro exitoso, de lo contrario, la puerta de enlace seguirá enviando mensajes de registro.
                $messager.postAnswer(
                    {
                        to: fromDevice,
                        domain: $userConfig.domain,
                        code: RESPONSE_CODE.OK,
                        sid,
                    },
                    {
                        workerID: 0,
                        token: genToken({
                            id: fromDevice,
                            type: RES_TYPE_DEVICE,
                        }),
                        web: {
                            host,
                            port,
                        },
                        group: "",
                        groupId: "",
                    }
                );
                // Error de registro, dispositivo no autenticado
                // $messager.postAnswer(
                // 	{ to: fromDevice, domain, code: RESPONSE_CODE.PERMISSION_DENIED, sid },
                // 	{ message: 'Device has not been authorized' }
                // )
            }
        }
        // Determinar si se trata de una llamada cancelada. Si es así, envíelo directamente al dispositivo de cancelación de llamada para su procesamiento.
        const cancelCall =
            device?.type === "wlcaller" &&
            device?.attrs &&
            device?.attrs.label &&
            device?.attrs.label === "cancel";
        /** Procesamiento de alarmas, eventos y llamadas de equipos */
        // Independientemente de si el dispositivo está autenticado, solo se procesan los eventos enviados por dispositivos autenticados
        if (device && !cancelCall) {
            if (type === MESSAGE_TYPE.EVENTS) {
                // Algunos eventos requieren un manejo especial
                // TODO: Conversión de asignación de teclas independiente a wlcaller
                switch (Number(payload.code)) {
                    // Conversión de eventos de buscapersonas
                    case EVENT_CODE.IO_KEY:
                        /**
                         * Lógica de conversión, es decir, emisión de eventos, alarmas y transacciones
                         * En principio, las cosas convertidas no deberían crearse aquí, pero las "transacciones" son una excepción.
                         * No cree una transacción monitoreando el evento de progreso de la transacción (porque 1. El evento de progreso de la transacción no contiene el evento de inicio, por lo que el monitoreo es inútil; 2. Las razones de clave externa requieren la creación de una transacción antes de crear eventos y alarmas)
                         *
                         * Proceso de conversión: construir un evento de llamada de tipo transacción -> enviar el evento -----> (no hay lógica aquí) recibir el evento, separar el evento y la transacción y almacenarlo en la base de datos
                         */
                        // 1. Determinar si la carga útil cumple con la especificación
                        if (isValidIOMessage(message)) {
                            // 2. Encuentre nodos de navegación según el dispositivo
                            const node = await findNodeBySn(device.sn);
                            if (node) {
                                // 3. Encontrar la ruta del nodo de navegación
                                const pathNodes = findPathNodes(node.id);
                                // 4. Busque un mapa de teclas coincidente (es posible que no haya ningún mapa de teclas, es decir, que no se haya configurado ningún mapa de teclas)
                                const keymap = await findKeyMapByPath(
                                    pathNodes
                                );
                                $log.info(
                                    "findeKeyMap==================",
                                    device.sn
                                );
                                // Convierte solo si hay una asignación de teclas
                                if (keymap) {
                                    // 5. Transforma el mensaje y envíalo
                                    await transformIoMessage({
                                        ioMessage: message,
                                        path: pathNodes,
                                        keymap,
                                        device,
                                        groupId: node.id,
                                    });
                                }
                            }
                        }
                        break;
                    /** Recopilar el estado en línea del dispositivo y mantener el estado del dispositivo */
                    // En teoría, los mensajes en línea deberían ser mensajes residentes, pero el lado del dispositivo siempre es inexplicable. Lógicamente, debería haber un "mecanismo de consulta" cronometrado para el doble seguro, pero el lado del dispositivo no implementa la "consulta" en absoluto.
                    // Evento de cambio de estado
                    case EVENT_CODE.DEVICE_STATUS_CHANGED:
                        const { status = {} } = payload;
                        if (
                            "online" in status &&
                            device.online !== status.online
                        ) {
                            $log.info(
                                "onMessage device " + device.sn + "status is :",
                                status
                            );
                            await $db.Device.update(
                                { online: status.online },
                                { where: { sn: device.sn } }
                            );
                        }
                    case RESPONSE_CODE.OK:
                        break;
                    default:
                        // Además de los eventos de E/S del dispositivo, otros eventos determinan si llevan ruta\grupo. Si lo hacen, no se llenarán; De lo contrario, se completará path\group para garantizar la integridad del evento.
                        if (!payload.path || !payload.group) {
                            // 1. Encuentre nodos de navegación según el dispositivo
                            const node = await findNodeBySn(device.sn);
                            if (node) {
                                // 2. Encontrar la ruta del nodo de navegación
                                const pathNodes = findPathNodes(node.id);
                                // Ruta semántica
                                payload.path = pathNodes
                                    .map((item) => item.title)
                                    .reverse()
                                    .join("/");
                                // camino
                                payload.group = pathNodes
                                    .map((item) => item.id)
                                    .reverse()
                                    .join("/");
                            }
                        }
                        break;
                }
                // Manejar eventos (persistencia, crear/actualizar transacciones, cambios de recursos)
                if (Number(payload.code) !== RESPONSE_CODE.OK) {
                    await saveDbEvent(message);
                }
            } else if (type === MESSAGE_TYPE.ALARMS) {
                // Alertas
                await saveDbEvent(message);
            } else if (type === MESSAGE_TYPE.ANSWER) {
                const { sid } = message;
                actions[sid] = message;
            }
        } else if (fromDevice === SERVER_SN) {
            // Objeto de procesamiento: eventos enviados por el servidor (como alarmas de procesamiento, progreso de transacciones)
            // No hay lógica de procesamiento en este momento
        }
        if (cancelCall) {
            // Cancelar localizador
            cancelCallerOnMsg({ topic, message, domain, device });
        }
        if (!topic.endsWith("/register")) {
            // Distribuir al tipo de dispositivo
            dispatchToDeviceTypes({ topic, message, domain, device });
            lorawatchOnMsg({ topic, message, domain, device }); // Debe colocarse en dispatchToDeviceTypes, pero el envío con tiempo de espera necesita un procesamiento especial
        }
    });

    /** Vincula algunos métodos al mensajero */
    // De esta manera, cuando la solicitud http del usuario procesa la transacción, la transacción se puede procesar de forma sincrónica en el controlador y el resultado se puede devolver directamente.
    $messager.saveDbEvent = saveDbEvent;
    $messager.handleEntityAlarm = handleEntityAlarm;
    $messager.handleEntityTransaction = handleEntityTransaction;
    $messager.sendHostAttrs = sendHostAttrs;
    $messager.getActionAnswer = getActionAnswer;
    $messager._takeARest = _takeARest;
    /** Utilizar eventos de cambio de recursos */
    // Para recursos: eventos (incluidas alarmas) | transacciones | nodos de navegación | dispositivos | certificados (aún no utilizados)
    // Alerta de evento
    useDbResourceEvent($db.Event, { type: "event" });
    // Actas
    useDbResourceEvent($db.Transaction, { type: "transaction" });
    // Nodo de navegación
    useDbResourceEvent($db.Navigation, { type: "navigation" });
    // equipo
    // useDbResourceEvent($db.Device, { type: 'devices', pk: 'sn' })
    /** Chequeo programado */
    // Inicie el temporizador para verificar alarmas y tiempos de espera de transacciones
    // Provoca el problema: no se puede comprobar el intervalo de tiempo. Una alarma que originalmente expiraba en 5 minutos puede expirar a los 5 minutos y 20 segundos. Si se procesa manualmente a los 5 minutos y 15 segundos se contabilizará como no vencido. Sin embargo, este es un problema menor y no se solucionará. Simplemente no establezca un intervalo de tiempo demasiado grande.
    function checkEventTimeout(time = 20 * 1000) {
        const check = async () => {
            // La última configuración se lee cada vez
            const { alarmTimeout, callTimeout } = $settings.get(CALL_SETTINGS);

            // Consultar todas las alarmas de tiempo de espera, es decir, la diferencia entre el tiempo de activación y el tiempo actual es mayor que el tiempo de espera
            if (alarmTimeout > 0) {
                try {
                    const alarms = await $db.sequelize.query(
                        `SELECT id, tid, type, result, \`group\`, code, triggerTime, CAST (( JulianDay('now') - JulianDay(triggerTime)) * 24 * 60 * 60 * 1000 AS Integer ) AS takeTime
            FROM Events WHERE type = 'alarm' AND takeTime > ${alarmTimeout} AND result < ${TRANSACTION_RESULT.COMPLETED}`,
                        { type: QueryTypes.SELECT }
                    );
                    // Tiempo de espera de alarma
                    alarms.forEach(async (item) => {
                        try {
                            // Procesamiento del sistema, tiempo de espera del tipo de procesamiento, por lo que no hay ninguna nota
                            // Lógica de w900 para el procesamiento de alarmas: mientras el servidor procese la alarma, no emitirá eventos 1005/1006, sino que escuchará eventos 1005/1006 para procesar la alarma (de modo que el dispositivo pueda procesar la alarma sin acceder a la API)
                            await handleEntityAlarm(item, {
                                result: TRANSACTION_RESULT.TIMEOUT,
                                remarks: "",
                            });
                        } catch (error) {
                            // Manejo de fallos
                            logger.error(
                                `[checkEventTimeout]: handleEntityAlarm error: ${error.message}`
                            );
                        }
                    });
                    // Iterar a través de los eventos emitidos
                } catch (error) {
                    logger.error(
                        `[checkEventTimeout]: sql error: ${error.message}`
                    );
                }
            }

            // Tiempo de espera de transacción
            if (callTimeout > 0) {
                try {
                    const transactions = await $db.sequelize.query(
                        `SELECT id, type, result, \`group\`, path, code, \`originalPayload\`, CAST (( JulianDay('now') - JulianDay(startTime)) * 24 * 60 * 60 * 1000 AS Integer ) AS takeTime
            FROM Transactions WHERE takeTime > ${callTimeout} AND result < ${TRANSACTION_RESULT.COMPLETED}`,
                        { type: QueryTypes.SELECT }
                    );
                    // Tiempo de espera de alarma
                    transactions.forEach(async (item) => {
                        try {
                            await handleEntityTransaction(item, {
                                result: TRANSACTION_RESULT.TIMEOUT,
                                progress: 100,
                                remarks: "",
                                message: "timeout",
                                handler: {
                                    sn: SERVER_SN,
                                    title: $userConfig.projectTitle,
                                    type: SERVER_SN,
                                },
                            });
                        } catch (error) {
                            // Manejo de fallos
                            logger.error(
                                `[checkEventTimeout]: handleEntityTransaction error: ${error.message}`
                            );
                        }
                    });
                    // Iterar a través de los eventos emitidos
                } catch (error) {
                    logger.error(
                        `[checkEventTimeout]: sql error: ${error.message}`
                    );
                }
            }

            // Consultar todos los paquetes de audio de notificaciones temporizadas, es decir, la diferencia entre la hora de creación y la hora actual es mayor a 30 minutos
            try {
                const notificationTimeout = 30 * 60 * 1000; // ms
                const notificationAudio = await $db.sequelize.query(
                    `SELECT id, url, callerSn, status, createdAt, CAST (( JulianDay('now') - JulianDay(createdAt)) * 24 * 60 * 60 * 1000 AS Integer ) AS takeTime
          FROM TtsAudios WHERE callerSn = null AND takeTime > ${notificationTimeout}`,
                    { type: QueryTypes.SELECT }
                );
                // Tiempo de espera del paquete de audio
                notificationAudio.forEach(async (item) => {
                    try {
                        // Eliminar archivos, eliminar registros
                        await $db.TtsAudio.destroy({
                            where: { id: item.id },
                            individualHooks: true,
                        });
                    } catch (error) {
                        // Manejo de fallos
                        logger.error(
                            `[checkNotificationTimeout]: notificationAudio error: ${error.message}`
                        );
                    }
                });
                // Iterar a través de los eventos emitidos
            } catch (error) {
                logger.error(
                    `[checkNotificationTimeout]: sql error: ${error.message}`
                );
            }
        };
        // Ejecutar inmediatamente
        check();
        return setInterval(check, time);
    }
    // implementar
    checkEventTimeout();

    // Finalmente volvemos al mensajero
    return $messager;
};

/**
 * Convertir asignación de teclas
 * @param {*} keymap
 * @param {*} key
 * @returns
 */
function parseKeymap(keymap, key) {
    const { value = {} } = keymap;
    return value[key] || {};
}

/**
 * Análisis de temas
 * @param {*} topic
 * @returns
 */
function parseTopic(topic = "") {
    // Actualmente solo se necesita el dominio
    const strs = topic.split("/").filter((item) => item.trim());
    return {
        domain: strs[1],
        rs: strs[2] === "rs", // ¿Es un evento de cambio de recursos?
    };
}

/**
 * ¿Es un mensaje de E/S de dispositivo legal?
 * Determinar si la clave está incluida
 * @param {*} message
 * @returns
 */
function isValidIOMessage(message) {
    const { payload = {} } = message;
    return !!payload.key && payload.key !== "0";
}

/**
 * Uso de la base de datos
 * @param {*} $db
 * @returns
 */
function useDatabase($db) {
    // Tiempo de vida del caché, 1 hora; Encuentra el dispositivo según su número de serie y encuentra la asignación según su identificación.
    const CACHE_LIFE = 60 * 60 * 1000;
    // Refresque todo el árbol periódicamente
    const REFRESH_TREE_NODE = 60 * 1000;

    /** Caché de consultas de base de datos */
    /* Obtener el dispositivo en función del número de serie */
    const findDevice = async (sn) => {
        try {
            const device = await $db.Device.findByPk(sn);
            if (device) {
                return device.toJSON();
            } else {
                return null;
            }
        } catch (error) {
            return null;
        }
    };
    // const findDevice = useCache(
    // 	async sn => {
    // 		try {
    // 			const device = await $db.Device.findByPk(sn)
    // 			if (device) {
    // 				return device.toJSON()
    // 			} else {
    // 				return null
    // 			}
    // 		} catch (error) {
    // 			return null
    // 		}
    // 	},
    // 	{
    // 		life: CACHE_LIFE, // 缓存生命时间，1个小时
    // 		onUpdate: set => {
    // 			// Pool de actualización o selección externa
    //          // Eliminar el dispositivo de la caché cuando se elimina el dispositivo
    // 			$db.Device.addHook('afterDestroy', (device, options) => {
    // 				// set(id, value)
    // 				set(device.sn, null)
    // 			})
    // 		}
    // 	}
    // )
    // Adquisición de dispositivos por lotes
    const findDevices = (sns) => {
        return Promise.all(sns.map(findDevice));
    };
    /** Obtener la asignación de teclas por id */
    const findKeyMap = useCache(
        async (id) => {
            try {
                const keymap = await $db.KeyMap.findByPk(id);
                if (keymap) {
                    return keymap.toJSON();
                } else {
                    return null;
                }
            } catch (error) {
                return null;
            }
        },
        {
            life: CACHE_LIFE, // Tiempo de vida de la caché, 1 hora
            onUpdate: (set) => {
                $db.KeyMap.addHook("afterDestroy", (keymap, options) => {
                    set(keymap.id, null);
                });
                $db.KeyMap.addHook("afterUpdate", (keymap, options) => {
                    set(keymap.id, keymap.toJSON());
                });
            },
        }
    );
    /** Obtener el nodo según sn. Es imposible mantener la exactitud de la memoria caché de acuerdo con los hooks de la base de datos, o es difícil y costoso. En segundo lugar, este es el punto de partida de toda la conversión del mensaje. Si está mal, habrá problemas. Entonces simplemente consulte directamente. */
    async function findNodeBySn(sn) {
        let node = await $db.Navigation.findOne({ where: { device: sn } });
        if (!node) {
            // Encuentra el dispositivo entre los recursos asociados
            node = await $db.sequelize.query(
                `SELECT Navigations.id, related FROM Navigations, json_each(Navigations.related) WHERE json_valid(Navigations.related) AND json_extract(json_each.value, '$.id') = '${sn}'`,
                {
                    type: QueryTypes.SELECT,
                }
            );
        }
        if (node.length) {
            node = await $db.Navigation.findOne({ where: { id: node[0].id } });
        }
        if (node) {
            try {
                node = node.toJSON();
                return node;
            } catch (e) {
                return null;
            }
        }
        return null;
    }

    // Obtener el nodo según el id del nodo [abandonar]
    // Mapeo de nodos de árbol
    let treeNodes = {};
    // Cargando todo el árbol
    async function loadNodes() {
        const nodes = {};
        const allNodes = await $db.Navigation.findAll();
        allNodes.forEach((node) => {
            nodes[node.id] = node.toJSON();
        });
        return nodes;
    }
    // carga
    loadNodes().then((nodes) => {
        treeNodes = nodes;
    });
    // Refrescar el árbol periódicamente
    setInterval(async () => {
        treeNodes = await loadNodes();
    }, REFRESH_TREE_NODE);

    // Mecanismo de actualización de nodos de árbol
    // Eliminación de nodos
    $db.Navigation.addHook("afterDestroy", (node, options) => {
        delete treeNodes[node.id];
    });
    // Actualización de nodo
    $db.Navigation.addHook("afterUpdate", (node, options) => {
        treeNodes[node.id] = node.toJSON();
    });
    // Creación de nodos
    $db.Navigation.addHook("afterCreate", (node, options) => {
        treeNodes[node.id] = node.toJSON();
    });
    /** Encuentra la ruta completa en función del nodo */
    // Devolver: [nodo actual, padre, abuelo, abuelos, ...]
    function findPathNodes(id, path = []) {
        const node = id ? treeNodes[id] : null;
        if (node) {
            path.push(node);
            return findPathNodes(node.pid, path);
        } else {
            return path;
        }
    }
    /** Obtener la asignación de claves por ruta */
    async function findKeyMapByPath(nodes = []) {
        if (!nodes || !nodes.length) {
            return null;
        }
        let keyMapId = "";
        const node = nodes.find((item) => {
            const { related = [] } = item;
            return related.some((i) => i.type === RES_TYPE_KEYMAP);
        });

        // Utilice el findPathNodes anterior para devolver [nodo actual, padre, abuelo, abuelo, ...]
        // find devuelve el primer nodo encontrado, es decir, selecciona la asignación de clave coincidente cercana
        if (node) {
            const got = node.related.find((i) => i.type === RES_TYPE_KEYMAP);
            keyMapId = got ? got.id : "";
        }

        if (keyMapId) {
            return findKeyMap(keyMapId);
        } else {
            return null;
        }
    }

    return {
        findDevice,
        findDevices,
        findNodeBySn,
        findPathNodes,
        findKeyMapByPath,
    };
}

function getActionAnswer(sid) {
    const res = actions[sid];
    delete actions[sid];
    return res;
}

function _takeARest(timeout) {
    return new Promise((r) => setTimeout(r, timeout || 1000));
}
