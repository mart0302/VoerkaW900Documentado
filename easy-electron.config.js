/**
 * easy-electron configuration file
 */
const fs = require('fs')
const path = require('path')

const resolve = target => path.resolve(__dirname, target)

module.exports = {
	// Version 2
	version: 2,

	// Script configuration
	scripts: {
		serve: 'dev', // Development server
		build: 'build' // Build
	},

	// [Logic overridden] Project runtime address
	server: {
		host: 'localhost', // Default localhost
		port: 3000, // Frontend running port
		useInProd: false // Random port in production [this project setting is ineffective]
	},

	// Random port in production [this project setting is ineffective]
	run: {
		// Vigilancia con chokidar
		watcher: {
			dir: 'src-electron',
			options: {
				ignored: [resolve('./src-electron/server')]
			},
			debounce: 500 // Tiempo de espera antes de ejecutar tras detectar cambios
		}
	},

	// Ubicaciones de empaquetado del proyecto
	build: {
		inDir: 'dist', // Carpeta de entrada (archivos a empaquetar)
		outDir: 'dist_electron', // Carpeta de salida (resultado del empaquetado)
		cacheDir: 'dist_cache',// Carpeta de caché para evitar descargar dependencias en cada empaquetado// electron打包缓存目录，防止每次打包都下载依赖
		cacheIgnoreDeps: true // Ignorar dependencias en la caché
	},

	// Ganchos (hooks)
	hooks: {
		// Al iniciar el proyecto con easy-electron
		start({ logger }) {
			// Verificar si extraFiles contiene emqx, si no, advertir al empaquetador que debe descargarlo y descomprimirlo
			/*
			const emqxPath = resolve('./extraFiles/emqx')
			const emqxDlUrl = 'https://www.emqx.cn/downloads/broker/v4.1.5/emqx-windows-v4.1.5.zip'
			if (!fs.existsSync(emqxPath)) {
				logger.warn(`Falta "emqx", asegúrese de que exista "${emqxPath}"\n`)
				logger.fatal(`Por favor descargue manualmente "${emqxDlUrl}" y descomprímalo en ese directorio\n`)
			}
			*/
			// Debido a problemas con emqx, se utiliza aedes como servidor MQTT. El código se mantiene pero está comentado; para más detalles, consulte el historial de git del 4 de agosto de 2021
		},
		// Al ejecutar easy-electron run
		runStart() {},
		// Al iniciar el proceso de empaquetado con easy-electron build
		buildStart() {},
		buildEnd() {},
		end() {}
	},

	// Configuración de empaquetado de Electron
	bundler: 'builder',  // 'packager' o 'builder', actualmente solo se soporta builder

	packager: {
		// https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
		// OS X / Mac App Store
		// appBundleId: '',
		// appCategoryType: '',
		// osxSign: '',
		// protocol: 'myapp://path',
		// Windows only
		// win32metadata: { ... }
	},

	builder: {
		// https://www.electron.build/configuration/configuration
		appId: 'com.hyt.voerka.w900', // ID de la aplicación
		productName: 'VoerkaW900',  // Nombre del producto, también usado como nombre del instalador (ej. xxx.exe)
		copyright: 'HYT Copyright © 2021', // Información de copyright
		asar: true, // Empaquetar con asar
		extraFiles: ['./extraFiles', './data', './dist', '.env', '.env.example'], // Archivos adicionales, copiados al mismo directorio que el .exe
		win: {
			// Configuración específica de Windows
			icon: 'public/favicon.ico', // Icono, asegúrese de que esté bien ubicado (puede haber problemas aquí)
			// requestedExecutionLevel: 'highestAvailable', // Solicitar permisos de administrador
			target: [
				{
					target: 'nsis',  // Usar NSIS para crear el instalador
					arch: [
						'x64' // Arquitectura de 64 bits
						// 'ia32' // Arquitectura de 32 bits
					]
				}
			]
		},
		nsis: {
			oneClick: false, // Instalación en un solo clic
			allowElevation: true, // Permitir solicitar privilegios elevados (administrador)
			allowToChangeInstallationDirectory: true, // Permitir cambiar el directorio de instalación
			include: 'build/installer.nsh', // Archivo NSH para configuración del instalador
			installerIcon: 'public/favicon.ico', // Icono del instalador
			uninstallerIcon: 'public/favicon.ico', // Icono del desinstalador
			installerHeaderIcon: 'public/favicon.ico', // Icono en la cabecera del instalador
			// deleteAppDataOnUninstall: true,
			// warningsAsErrors: false,
			createDesktopShortcut: true, // Crear acceso directo en el escritorio
			createStartMenuShortcut: true, // Crear acceso directo en el menú de inicio
			shortcutName: 'VoerkaW900' // Nombre del acceso directo (nombre del proyecto)
		}
	},

	// Dependencias necesarias para el empaquetado del backend
	dependencies: [
		'aedes',
		'aedes-server-factory',
		'body-parser',
		'bytenode',
		'chokidar',
		'compression',
		'cors',
		'dotenv-safe',
		'electron-log',
		'electron-store',
		'express',
		'express-validation',
		'extract-zip',
		'fs-extra',
		'get-port',
		'helmet',
		'http-status',
		'i18n',
		'iconv-lite',
		'joi',
		'jwt-simple',
		'lodash',
		'macaddress',
		'method-override',
		'moment-timezone',
		'morgan',
		'mqtt',
		'ms',
		'multer',
		'openpgp',
		'passport',
		'passport-jwt',
		'rxjs',
		'sequelize',
		'sqlite3',
		'voerka-discover',
		'@voerka/messager',
		'varstruct',
		'dayjs',
		'serialport',
		'usb-detection'
	]
}
