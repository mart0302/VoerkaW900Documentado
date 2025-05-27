// Procesando mensajes
const {
    MESSAGE_TYPE,
    EVENT_CODE,
    TRANSACTION_RESULT,
} = require("@voerka/messager");
const { Op } = require("sequelize");
const { useKVCache } = requireApi("utils/index");
const dayjs = require("dayjs");
const utc = require("dayjs/plugin/utc");
const { mergeDeepRight } = require("../../../api/utils");
dayjs.extend(utc);

// Tipo de dispositivo
const TYPE = "user";

module.exports = ({ dbUtils, messager }) => {
    // tid - { msgId, devices: ['xxxx', 'xxx'] }
    const tidCache = useKVCache({ life: 60 * 30 * 1000 });

    // Envía una notificación mqtt al frontend para enviar un mensaje a Meiyiyun para enviar el mensaje
    function addMessage({ message, userPhones = [] } = {}) {
        // Notificar a meeyi señalización para enviar un mensaje
        $messager.postResUpdated(
            { type: "meeyi_message", id: 1 },
            { message, userPhones }
        );
    }

    /**
     * Obtenga el personal (personal interno) que está programado en esta ruta de mensajes y cumple con la hora actual
     */
    async function findNodeShift(ids, timestamp) {
        const today = dayjs(timestamp).format("YYYY-MM-DD").valueOf();
        const date = dayjs.utc(today).local();
        const time = dayjs(timestamp).format("HH:mm:ss").valueOf();
        let shifts = [];
        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const qry = { nodeId: id, date: Number(date) };
            try {
                const shift = await $db.ShiftScheduler.findAll({ where: qry }); // Horario de hoy
                shifts = shifts.concat(shift);
            } catch (e) {}
        }
        let users = [];
        shifts.forEach((shift) => {
            // Encuentre departamentos/personal que cumplan con el horario de turnos
            const start = dayjs.utc(shift.start).format("HH:mm:ss").valueOf();
            const end = dayjs.utc(shift.end).format("HH:mm:ss").valueOf();
            if (start <= time && end >= time) {
                users = users.concat(shift.users);
            }
        });
        let ableUsers = [];
        // Conseguir el teléfono móvil del personal
        for (let j = 0; j < users.length; j++) {
            let user = users[j];
            if (user.type == "department") {
                // Encuentra a todas las personas del departamento
                const departmentUsers = await $db.User.findAll({
                    where: { deptId: user.id, resourceType: "internal" },
                });
                ableUsers = ableUsers.concat(departmentUsers);
            } else if (user.type == "user") {
                const row = await $db.User.findByPk(user.id);
                ableUsers.push(row);
            }
        }
        const mphones = ableUsers.map((u) => {
            return { resourceType: u.resourceType, mphone: u.mphone };
        });
        $log.info("users==========", mphones);
        return mphones;
    }

    /**
     *  Obtener todas las personas en esta ruta de mensajes/solo personas internas
     * @param {*} param0
     * @returns { [{nodeId, nodePath, sn}] } devices
     */
    async function findNodeUser({ group, type, timestamp }) {
        const ids = group.split("/").map((item) => parseInt(item));
        // Encuentra todos los nodos en la ruta
        const nodes = await $db.Navigation.findAll({
            where: { id: { [Op.in]: ids } },
        });
        // Descubra los dispositivos que tienen dispositivos enlazados en el nodo
        let sns = [];
        // Descubra los recursos vinculados al nodo
        nodes.map((item) => {
            if (item.related.length) {
                item.related.map((resource) => {
                    if (resource.type == type) sns.push(resource.id);
                });
            }
        });
        const users = await $db.User.findAll({
            where: { username: { [Op.in]: sns } },
        });

        //
        const innerPersonPhones = await findNodeShift(ids, timestamp);
        const mphones = users
            .map((user) => {
                return { resourceType: user.resourceType, mphone: user.mphone };
            })
            .concat(innerPersonPhones);
        $log.info(
            "======================meeyi Cloud mphones======================================",
            mphones
        );
        // devolver
        return mphones;
    }

    // Recibir mensajes
    return async ({ topic, message, domain, device }) => {
        // Determine si la función Meiyi Cloud está habilitada, si está habilitada, presione
        const meeyiCloudSetting = await await $db.Setting.findByPk(
            "meeyi_cloud"
        );
        if (meeyiCloudSetting.value.enabled) {
            const { payload = {}, type, tid, timestamp } = message;
            const { code, result, alarmCode, progress } = payload;
            /** Procesa 80000 eventos de llamadas comerciales y agrégalos a la pantalla de Meiyi Cloud */
            if (type === MESSAGE_TYPE.EVENTS || type === MESSAGE_TYPE.ALARMS) {
                if (
                    Number(code) == EVENT_CODE.APPLICATION_CALL ||
                    Number(code) == EVENT_CODE.DEVICE_ATTRS_CHANGED ||
                    Number(alarmCode) == EVENT_CODE.DEVICE_ATTRS_CHANGED
                ) {
                    // Llamada de negocios
                    // case EVENT_CODE.APPLICATION_CALL:
                    const { group } = payload;
                    // Comprueba si hay caché
                    const tidItem = tidCache.get(tid);
                    // Con caché
                    if (tidItem) {
                        const { userPhones, message: storeMessage } = tidItem;
                        // Ejecutar la acción de visualización
                        let newMessage = {};
                        if (alarmCode) {
                            // Originalmente, no era necesario informar el evento de alarma al frontend después de procesarlo, pero como es necesario enviar un mensaje, aún es necesario informarlo.
                            newMessage = mergeDeepRight(storeMessage, {
                                payload: {
                                    result,
                                    progress: payload.progress,
                                    message: payload.resultTitle,
                                },
                            });
                        } else {
                            newMessage = message;
                        }
                        $log.info("message=====", newMessage, userPhones);
                        addMessage({ message: newMessage, userPhones });
                    } else {
                        // Obtener todos los números de teléfono de los usuarios en esta ruta de mensajes
                        const userPhones = await findNodeUser({
                            group,
                            type: TYPE,
                            timestamp,
                        });
                        // Configuración del almacenamiento en caché
                        tidCache.set(tid, { userPhones, message });
                        // Ejecutar la acción de visualización
                        addMessage({ message, userPhones });
                    }
                    // 	break
                    // default:
                    // 	break
                }
            }

            /** La transacción se completa y la cuenta pública de WeChat se muestra */
            if (tid && result >= TRANSACTION_RESULT.COMPLETED) {
                const tidItem = tidCache.get(tid);
                // Si no lo puede encontrar, no podrá cancelar la visualización del mensaje. Solo puedes seleccionar el dispositivo para realizar la acción: Borrar todo
                if (tidItem) {
                    const { userPhones } = tidItem;
                    addMessage({ message, userPhones });
                    // Limpiar la caché
                    tidCache.set(tid);
                }
            }
        }
    };
};
