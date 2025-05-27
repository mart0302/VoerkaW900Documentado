// Procesando mensajes
const { TRANSACTION_RESULT, TRANSACTION_STATUS } = require("@voerka/messager");
const { Op } = require("sequelize");
const i18n = require("../../i18n");

i18n.init;

module.exports = ({ dbUtils, messager }) => {
    /**
     *  Obtener todas las transacciones no procesadas en esta ruta de mensajes
     * @param {*} param0
     * @returns { [{nodeId, nodePath, sn}] } devices
     */
    async function findNodeTransaction(id) {
        // Encuentra todos los nodos en la ruta
        const node = await $db.Navigation.findByPk(id);
        const path = node.path ? node.path + "/" + id : id;
        $log.info("【cancelCaller】findNodeTransaction+++++++++++", path);
        const transactions = await $db.Transaction.findAll({
            where: {
                group: { [Op.like]: `${path}%` },
                status: TRANSACTION_STATUS.PROGRESSING,
            },
        });
        // devolver
        return transactions;
    }

    // Recibir mensajes
    return async ({ topic, message, domain, device }) => {
        /** Independientemente del número de teclas presionadas, tratar todas como cancelación 1 */
        /** 1. Encuentra el nodo donde se encuentra el dispositivo */
        // Encuentre el nodo a través de device.nodeId, encuentre la ruta del nodo y busque todas las transacciones con estado == 1 a través de la ruta, es decir, transacciones no procesadas
        const transactions = await findNodeTransaction(device.nodeId);
        // Recorrer la transacción y procesarla
        for (let i = 0, len = transactions.length; i < len; i++) {
            let transaction = transactions[i];
            // Construya un mensaje MQTT para notificar al servidor que la transacción ha sido procesada; al mismo tiempo reenviarlo al dispositivo para notificar al dispositivo de reenvío que el mensaje ha sido procesado
            // Internacionalización
            const lan = await $db.Setting.findByPk("current_language");
            i18n.setLocale(lan.value.lan);
            message = i18n.__("cancel");
            const { sn, title, type } = device;
            await $messager.handleEntityTransaction(transaction, {
                result: TRANSACTION_RESULT.COMPLETED,
                progress: 100,
                remarks: message,
                path: transaction.path,
                message,
                handler: { sn, title, type },
            });
            // $messager.handleEntityTransaction： Actualizar la base de datos => activará eventos de cambio de recursos, lo que afectará el efecto de visualización del frontend
        }
    };
};
