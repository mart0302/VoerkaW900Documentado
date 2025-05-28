require("bytenode");
const appPath = require("../app-paths");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const chokidar = require("chokidar");
const { debounce } = require("lodash");

// Clave pública del certificado
const PUBLIC_KEY = require("./public.key");
// Certificado predeterminado (para evitar que se elimine el certificado y que el observador informe un error. Si no desea el valor predeterminado 50, puede asignar directamente una cadena aleatoria, siempre que no esté vacía)
const DEFAULT_LICENSE = require("./default.license");
// contraseña de compilación jsc
const LICENSE_PWD = process.env.LICENSE_PWD;
// .directorio de datos
const LICENSE_DIR = appPath.resolve.data(process.env.LICENSE_DIR);
// Archivos de certificado
const LICENSE_FILE = path.resolve(LICENSE_DIR, process.env.LICENSE_NAME);
// Archivo jsc (el resultado después de compilar el oyente src)
const WATCHER_FILE = require.resolve("./index.jsc");
// El md5 del oyente jsc se utiliza para verificar si el oyente ha sido modificado
const WATCHER_FILE_MD5 = fs.readFileSync(
    path.resolve(__dirname, ".md5"),
    "utf8"
);

// Certificados de lectura
function getLicense() {
    let data = DEFAULT_LICENSE;
    if (fs.existsSync(LICENSE_FILE)) {
        data = fs.readFileSync(LICENSE_FILE, "utf8") || data;
    }
    return data;
}

// Obtener oyente
module.exports = function getWatcher({ checkInterval = 60 * 1000, sn } = {}) {
    // Primero verifique si el archivo de código fuente del monitor de certificados ha sido alterado, es decir, si el MD5 coincide.
    // Nota: Se debe garantizar que el MD5 no sea alterado en el programa del usuario, por ejemplo, reemplazando el valor MD5 con la función que genera el valor y ejecutándola inmediatamente, y luego compilándola en código de bytes.
    // Si el archivo MD5 coincide con el MD5 proporcionado, importe y use.
    if (
        WATCHER_FILE_MD5 ===
        crypto
            .createHash("md5")
            .update(fs.readFileSync(WATCHER_FILE))
            .digest("hex")
    ) {
        const { VoerkaLicenseWatcher } = require(WATCHER_FILE);

        try {
            // Crear una instancia de un monitor de certificado voerka
            const watcher = new VoerkaLicenseWatcher({
                license: getLicense(),
                publicKey: PUBLIC_KEY,
                device: { sn },
                dataDir: LICENSE_DIR,
                checkInterval,
                debug: LICENSE_PWD,
                enableSystemTimeCheck: false,
            });
            // Supervisar los cambios de certificado y reasignarlos al observador después de los cambios
            chokidar.watch(LICENSE_FILE).on(
                "all",
                debounce(() => {
                    // Vuelva a comprobar el certificado
                    watcher.refreshLicense(getLicense());
                }, 1000)
            );
            return watcher;
        } catch (e) {
            // Cuando el monitoreo es anormal, es decir, cuando el certificado expira, haga algo
            throw new Error(`create watcher error：${e.message}`);
        }
    } else {
        // El archivo del monitor de certificados de Voerka está alterado, es decir, cuando el certificado no es válido, haga algo
        throw new Error("index.jsc md5 invalid");
    }
};
