const path = require("path");
const { Op } = require("sequelize");
appPath = require("../app-paths");
// require config目录下的模块
requireData = appPath.require.data;
// require api目录下的模块
requireApi = (mod) => appPath.require.server(path.join("api", mod));
// require config目录下的模块
requireConfig = (mod) => appPath.require.server(path.join("config", mod));

// 配置
const { env } = require("./config/vars");
const logger = require("./config/logger");

// 全局对象
$APIError = require("./api/utils/APIError");
// 加载数据库配置
const Settings = require("./config/settings");
// 创建messager
const createMessager = require("./config/messager/index");

// 全局对象
$db = require("./config/database");
// 全局配置
$settings = new Settings($db);

// 加载express
const app = require("./config/express");

const deviceTypes = require("./langs/setting/device.types.json");
const transactionResult = require("./langs/setting/transaction.result.json");
const transactionStatus = require("./langs/setting/transaction.status.json");
const eventCode = require("./langs/setting/event.code.json");
async function initNavigation() {
    // Permitir agregar nuevos campos
    $db.Navigation.sync({ alter: true }).then(async (navigation) => {
        // Consultar todos los datos
        // Verificar si existen la dirección de reenvío y la dirección de notificación, si no, actualizar
        $log.info("navigation init ==============");
        const nodes = await navigation.findAll();
        let newValues = nodes.map((item) => {
            const addrs =
                Math.ceil(Math.random() * 255) +
                "." +
                Math.ceil(Math.random() * 255) +
                "." +
                Math.ceil(Math.random() * 255) +
                ".";
            if (!item.unicastAddr) {
                item.unicastAddr = addrs + 1;
                item.broadcastAddr = addrs + 254;
            }
            return item;
        });

        await $db.sequelize.transaction((t) => {
            return Promise.all(
                newValues.map((value) => {
                    return navigation.update(
                        {
                            unicastAddr: value.unicastAddr,
                            broadcastAddr: value.broadcastAddr,
                        },
                        { where: { id: value.id } }
                    );
                })
            );
        });
    });
}
(async function () {
    // Carga de base de datos
    await $db.sequelize.sync();
    // Cargando configuración
    await $settings.load();
    try {
        const hander = await $db.Navigation.findOne({
            where: { unicastAddr: { [Op.ne]: null } },
        });
        $log.info("navigation hander ++++++++++++++ ==============", hander);
        if (!hander) {
            initNavigation();
        }
    } catch (e) {
        // Permitir agregar nuevos campos
        initNavigation();
    }

    try {
        const hander = await $db.Transaction.findOne({
            where: { handler: {} },
        });
    } catch (e) {
        // Se agregó un nuevo campo de dispositivo de procesamiento de registros
        // Permitir agregar nuevos campos
        $db.Transaction.sync({ alter: true }).then(async (transaction) => {
            // Consultar todos los datos
            // Determinar si existe el campo del controlador
            $log.info("transactions init==========");
            const transactions = await transaction.findAll();
            let newValues = transactions.map((item) => {
                if (!item.handler) {
                    item.handler = {};
                }
                return item;
            });
            await $db.sequelize.transaction((t) => {
                return Promise.all(
                    newValues.map((value) => {
                        return transaction.update(
                            { handler: value.handler },
                            { where: { id: value.id } }
                        );
                    })
                );
            });
        });
    }
    try {
        const user = await $db.User.findByPk("admin");
    } catch (e) {
        // Permitir agregar nuevos campos
        $db.User.sync({ alter: true }).then(async (user) => {
            // Establecer valores predeterminados para el administrador
            await user.update(
                {
                    resourceType: "internal",
                    type: "user",
                    menus: "all",
                    fullname: "Admin",
                    deptId: 1,
                    status: true,
                    code: "admin",
                    sex: 1,
                    postId: 1,
                    decryptPassword: "123456",
                },
                { where: { username: "admin" } }
            );
        });
    }

    // Busque el tipo de dispositivo para ver si hay lenguaje pl. Si es así, no lo procese. En caso contrario, deberá actualizar la base de datos de configuración.
    try {
        const devTypes = await $settings.get("device_types");
        if (!devTypes["pl"]) {
            $log.info("==========update init settings==================");
            await $settings.update("device_types", deviceTypes);
            await $settings.update("transaction_result", transactionResult);
            await $settings.update("transaction_status", transactionStatus);
            await $settings.update("event_code", eventCode);
            await $settings.update(
                "current_language",
                { lan: "en" },
                { description: "Language Settings" }
            );
        }
    } catch (error) {
        $log.warn("get devices type failed error is:", error.message);
    }

    // Encuentra la configuración de Meiyiyun
    try {
        const meeyiCloud = await $settings.get("meeyi_cloud");
        if (!meeyiCloud) {
            $log.info(
                "==========meeyiCloud init settings==================",
                meeyiCloud
            );
            await $settings.update(
                "meeyi_cloud",
                {
                    enabled: false,
                    server: "http://42.192.86.185:8888",
                    mqtt: "",
                    appId: "",
                    appSecret: "",
                    envName: "",
                    session_token: "",
                },
                { description: "Meeyi cloud Settings" }
            );
        }
    } catch (error) {
        $log.warn("get meeyiCloud failed error is:", error.message);
    }

    try {
        const hander = await $db.Department.findOne({ where: { id: 1 } });
        if (!hander) {
            $db.Department.create({
                type: "department",
                id: 1,
                title: "Root",
                description: "",
                logo: "",
                open: true,
                leader: null,
                orderNumber: 0,
                path: "",
                phone: "",
                email: "",
                related: [{ type: "user", id: "admin" }],
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
    } catch (e) {}
    // Antes de iniciar el servicio mqtt, cambie el estado en línea del dispositivo de red a fuera de línea
    try {
        $log.info("==========get online devices==================");
        await $db.Device.update({ online: false }, { where: { online: true } });
    } catch (error) {
        $log.warn("update devices online failed error is:", error.message);
    }
    // Crear un mensajero
    $messager = createMessager($db);
    // listen to requests
    const { port } = $userConfig;

    app.listen(port, () =>
        logger.info(`server started on port ${port} (${env})`)
    );
})();

/**
 * Exports express
 * @public
 */
module.exports = app;

// Anotación de objeto global:
// objeto global de la base de datos $db
// Servicio de escaneo $discoverService
// $settings configuración global
// $messager segmento de clientes mqtt global
// Clase de error $APIError
// $watcher oyente de certificado
// $$SN El número de serie del software actual (el software actual puede considerarse un dispositivo)
// resultado de la verificación del certificado $licenseValidResult
// $userConfig configuración del usuario
// $log impresión de registro global