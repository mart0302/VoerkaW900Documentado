const { resolve, join } = require('path')
const fs = require('fs-extra')
const { pick, merge } = require('lodash')

const isDev = process.env.NODE_ENV !== 'production'

const EXTRA_FILES_NAME = 'extraFiles'
const DATA_NAME = "data"; // El nombre de la carpeta de datos inicial en el proyecto (utilizada para los datos iniciales del usuario）
const USER_DATA_NAME = isDev ? "W900Data" : process.env.USER_APP_DATA || "Data"; // El nombre de la carpeta de datos de usuario para el software. Cuando se inicia el software, comprobará si el directorio existe. Si no existe, copiará la "carpeta de datos iniciales en el proyecto"
const DEV_PUBLIC_NAME = "public"; // asar = true && extraFiles = ['dist']
// const PROD_PUBLIC_NAME = 'resources/app'  // asar = false
const PROD_PUBLIC_NAME = "dist";
const PACKAGES_NAME = "packages";
const SERVER_NAME = "server";

function getAppDir() {
    return process.cwd();
}

// Carpeta de la aplicación
const appDir = getAppDir();
// La carpeta donde se encuentran los archivos adicionales de la aplicación (servicios de dependencia), como emqx
const extraFilesDir = resolve(appDir, EXTRA_FILES_NAME);
// Carpeta estática de la aplicación, como index.html
const publicDir = resolve(appDir, isDev ? DEV_PUBLIC_NAME : PROD_PUBLIC_NAME);
// Carpeta del paquete de actualización
const packagesDir = resolve(publicDir, PACKAGES_NAME);
// Carpeta de backend
const srcDir = __dirname;
// Carpeta del servidor backend
const serverDir = resolve(srcDir, SERVER_NAME);
// Carpeta de datos inicial
const defaultDataDir = resolve(appDir, DATA_NAME);
// La carpeta de datos de la aplicación debe ubicarse en el directorio del usuario.
const userDataDir = require("electron").app
    ? require("electron").app.getPath("userData")
    : appDir;
const dataDir = resolve(userDataDir, USER_DATA_NAME);

// Cargando la configuración de sequelize
function loadSequelizeConfig(type = "user") {
    const env = process.env.NODE_ENV || "development";
    const configFile = join(
        process.env.SEQUELIZE_CONFIG_DIR,
        process.env.SEQUELIZE_CONFIG_NAME
    );
    const dir = type === "user" ? dataDir : defaultDataDir;

    const config = require(join(dir, configFile))[env];
    return {
        ...config,
        storage: join(dir, config.storage),
    };
}

const configFile = join(
    process.env.USER_CONFIG_FILE_DIR,
    process.env.USER_CONFIG_FILE_NAME
);
// Cargando perfil de usuario
function loadUserConfig() {
    // Objeto global
    try {
        $userConfig = require(join(dataDir, configFile));
    } catch (error) {
        // Si el usuario elimina la configuración de usuario en el directorio de usuarios, se leerá la configuración de usuario predeterminada en el directorio del software.
        // Si el usuario elimina nuevamente, el resultado será
        // P.D. Cuando el usuario elimina db.config.js, el software quedará inutilizable. Si consideramos demasiados problemas de este tipo, nos convertiremos en la niñera del usuario.
        $userConfig = require(join(userDataDir, configFile));
    }
    return $userConfig;
}

// Actualizar la configuración del usuario
function updateUserConfig(data = {}) {
    // data = pick(data, Object.keys($userConfig))
    merge($userConfig, data);
    fs.writeFileSync(
        join(dataDir, configFile),
        JSON.stringify($userConfig, null, 2),
        "utf8"
    );
    return $userConfig;
}

// Comprobación de datos del usuario
function checkUserData() {
    if (!fs.existsSync(dataDir)) {
        fs.copySync(defaultDataDir, dataDir);
    }
}

module.exports = {
    // Tabla de contenido
    appDir,
    extraFilesDir, // Obsoleto
    publicDir,
    packagesDir, // Obsoleto
    srcDir,
    serverDir,
    dataDir,
    defaultDataDir,
    // Método de directorio
    resolve: {
        app: (dir) => join(appDir, dir),
        extraFiles: (dir) => join(extraFilesDir, dir),
        data: (dir) => join(dataDir, dir),
        defaultData: (dir) => join(defaultDataDir, dir),
        public: (dir) => join(publicDir, dir),
        packages: (dir) => join(packagesDir, dir),
        src: (dir) => join(srcDir, dir),
        server: (dir) => join(serverDir, dir),
    },

    require: {
        app: (dir) => require(join(appDir, dir)),
        extraFiles: (dir) => require(join(extraFilesDir, dir)),
        data: (dir) => require(join(dataDir, dir)),
        defaultData: (dir) => require(join(defaultDataDir, dir)),
        public: (dir) => require(join(publicDir, dir)),
        packages: (dir) => require(join(packagesDir, dir)),
        src: (dir) => require(join(srcDir, dir)),
        server: (dir) => require(join(serverDir, dir)),
    },

    // sequelize相关
    // Obtener el archivo de configuración
    loadSequelizeConfig,

    // Cargando perfil de usuario
    loadUserConfig,

    // Actualizar la configuración del usuario
    updateUserConfig,

    // inicialización
    init() {
        checkUserData();
        loadUserConfig();
    },
};
