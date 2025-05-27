/**
 * Autorización del dispositivo, temporalmente obsoleta
 */
const path = require("path");
const fs = require("fs-extra");
const { upload: uploadConfig } = requireConfig("vars");
const { license: licenseConfig } = uploadConfig;
const { destination } = licenseConfig;
const licensePath = appPath.resolve.data(destination);

$devicesWatcher = {};
// Monitoreo de certificados de registro
async function installDeviceLicenseWatcher({ sn, licenseFile }) {
    $log.info("start ============installDeviceLicenseWatcher");
    // Resultado de la verificación del certificado
    let licenseValidResult = { result: false, message: "", checked: false };
    // Presentación del oyente de certificados
    if (process.env.LICENSE_BUILD === "true") {
        // Compilar
        require("../../../license/build/build.js");
    } else {
        const logName = "licenseWatcher";
        // Monitoreo de certificados
        try {
            // Revisar cada 10 minutos
            $devicesWatcher[sn] = require("../../../license/devicesWatcher")({
                checkInterval: 10 * 60 * 1000,
                sn,
                licenseFile,
            });
        } catch (error) {
            $log.error(logName, error.message);
        }
        if ($devicesWatcher[sn]) {
            // Escuche los eventos del monitor de certificados de Voerka
            $devicesWatcher[sn]
                .on("started", () => {
                    // Cuando comienza la vigilancia
                    $log.info(
                        logName,
                        `device ${sn} license watch started`,
                        $devicesWatcher[sn].certificate
                    );
                })
                .on("valid", () => {
                    // Coloque el resultado en el objeto global, la API puede devolver este resultado, debilitando la dependencia de Electron y desarrollando posteriormente la versión web sin Electron
                    // Cuando el certificado se vuelve válido o se restaura
                    licenseValidResult.result = Object.keys(
                        $devicesWatcher[sn].licenseData
                    ).reduce((data, cur) => {
                        data[cur.replace("$", "")] =
                            $devicesWatcher[sn].licenseData[cur];
                        return data;
                    }, {});
                    licenseValidResult.message = "";
                    licenseValidResult.checked = true;

                    // Envío de eventos a dispositivos
                    $log.info(
                        "installDeviceLicenseWatcher===license-validate:",
                        { sn, ...licenseValidResult }
                    );
                    $db.License.update(
                        { ...licenseValidResult },
                        { where: { sn } }
                    );
                    $messager.postAttrs(
                        { to: sn, sid: true, domain: $userConfig.domain }, //  El dominio se puede agregar o no, porque este proyecto es un dominio único.
                        { sn, ...licenseValidResult }
                    );
                })
                .on("invalid", (e) => {
                    // Cuando caduca el certificado
                    // $log.error(logName, 'license invalid', e.message)
                    licenseValidResult.result = null;
                    licenseValidResult.message = e.message;
                    licenseValidResult.checked = true;

                    // Envío de eventos a dispositivos
                    $log.info(
                        "installDeviceLicenseWatcher===license-invalid:",
                        { sn, ...licenseValidResult }
                    );
                    $db.License.update(
                        { ...licenseValidResult },
                        { where: { sn } }
                    );
                    $messager.postAttrs(
                        { to: sn, sid: true, domain: $userConfig.domain }, // El dominio se puede agregar o no, porque este proyecto es un dominio único.
                        { sn, ...licenseValidResult }
                    );
                })
                .on("error", (e) => {
                    // Cuando el monitoreo es anormal, es decir, cuando el certificado expira
                    $log.error(
                        logName,
                        `device ${sn} license watch error`,
                        e.message
                    );
                })
                .on("stopped", () => {
                    // Cuando se detiene el monitoreo
                    $log.info(logName, `device ${sn} license watch stoped`);
                });

            // Iniciar el monitoreo
            $devicesWatcher[sn].start();

            return $devicesWatcher[sn];
        }
    }
}

async function installDevicesLicenseWatcher() {
    $log.info("start ============installDevicesLicenseWatcher");
    // Determinar si el directorio de destino existe, si no, regresar
    if (!fs.existsSync(licensePath)) {
        return;
    }
    const licenses = await $db.License.findAll();
    if (!licenses) {
        return;
    }
    // Lea la base de datos para encontrar la ruta del archivo del certificado
    licenses.map(async (license) => {
        $log.info("license-====", license);
        // Recorrer certificados de archivos para crear escuchas de certificados de dispositivos
        installDeviceLicenseWatcher({
            sn: license.sn,
            licenseFile: path.join(licensePath, license.fileName),
        });
    });
}

module.exports = {
    installDeviceLicenseWatcher: (data) => installDeviceLicenseWatcher(data),
    installDevicesLicenseWatcher: (data) => installDevicesLicenseWatcher(data),
};
