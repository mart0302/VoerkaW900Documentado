const { app, BrowserWindow, Menu, nativeTheme, globalShortcut, ipcMain, Tray } = require('electron')
// Corregir NODE_ENV
if (app.isPackaged) {
	process.env.NODE_ENV = 'production'
} else {
	process.env.NODE_ENV = 'development'
}

// Otras importaciones
$log = require('electron-log')
const path = require('path')
const fs = require('fs')
const express = require('express')
const Store = require('electron-store')
const dayjs = require('dayjs')
const cfg = require('../easy-electron.config')
const pkg = require('../package.json')
const { main, installResp } = require('./app')
const appPath = require('./app-paths')

// camino
// datos de la aplicación
const AppDataPath = app.getPath('appData')
//datos de usuario
const UserDataPath = app.getPath('userData')
// registro
const LogsPath = devOrProd(
	() => path.join(app.getPath('appData'), pkg.name, 'logs'),
	() => app.getPath('logs')
)

function archiveLog(file) {
	file = file.toString()
	const info = path.parse(file)
	let date = new Date()
	date = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate() + '-' + date.getTime()
	try {
		fs.renameSync(file, path.join(info.dir, date + info.ext))
// Recorre los archivos del directorio, si hay más de 15, determina la fecha, si son más de 15 días, elimina el archivo más antiguo		const files = fs.readdirSync(info.dir)
		if (files.length > 15) {
			const today = dayjs()
			files.forEach((item, index) => {
				const itemPath = path.join(info.dir, item)
				let name = item.split('-')
				let diff = 0
				if (name.length) {
					name.pop()
					name = dayjs(name.join('-'))
					diff = today.diff(name, 'days')
				}
				if (name && diff >= 15) {
					fs.unlinkSync(itemPath)
				}
			})
		}
	} catch (e) {
		console.warn('Could not rotate log', e)
	}
}
$log.transports.file.maxSize = 41943040 // 40M
$log.transports.file.archiveLog = archiveLog
// Directorio del mismo nivel del exe actual, ubicación del exe: app.getPath('exe')
const WorkPath = process.cwd()
//Ubicación de distribución del front-end
const WebPath = path.join(__dirname, `../`)

//ventana principal
let mainWindow
let force_quit = false
//Configuración persistente
const store = new Store()

/** Iniciar ejecución */
// puesta en marcha
bootstrap()

// Crea un objeto de ventana
async function createWindow() {
/**
	 * Opciones de ventana inicial
	 */
	let icon = appPath.resolve.data('favicon.ico')
	icon = fs.existsSync(icon) ? icon : path.join(__dirname, './icons/icon.ico')

	mainWindow = new BrowserWindow({
		width: 1500,
		height: 850,
		minWidth: 1500,
		minHeight: 850,
		resizable: true,
		useContentSize: true,
		icon,
	// autoHideMenuBar: verdadero,
		webPreferences: {
			webSecurity: false,
			contextIsolation: true,
			preload: path.join(__dirname, './electron-preload.js')
		}
	})

	devOrProd(
		() => {
			// si está en DEV o Producción con la depuración habilitada
			mainWindow.webContents.openDevTools()
		},
		() => {
			// Cerrar la barra de menú en el entorno de producción
			Menu.setApplicationMenu(null)
			// ventana principal.webContents.on('devtools-opened', () => {
			// ventana principal.webContents.closeDevTools()
			// })
		}
	)

	/** Supervisión de eventos de ventana */
	mainWindow.on('closed', () => {
		mainWindow = null
	})

	//Registrar teclas de acceso directo
	installShortCut(mainWindow)

	// imprimir información
	printAppInfo()

	//Código de personalización
	main({ store, mainWindow })

	//Cargar página
	mainWindow.loadURL(await getAppUrl())
	// Se activa cuando se cierra el disparador
	mainWindow.on('close', event => {
		if (!force_quit) {
			//Interceptar el comportamiento de cierre predeterminado
			event.preventDefault()
			// Al hacer clic en Cerrar, se activa el evento de cierre. Seguimos la idea anterior de ocultar la ventana y la ventana de la barra de tareas al cerrar.
			mainWindow.hide()
			mainWindow.setSkipTaskbar(true)
		}
	})

	mainWindow.on('window-close', event => {
		force_quit = true
		app.quit()
		mainWindow = null
		tray.destroy()
	})

	//Establecer icono de bandeja
	const iconUrl = appPath.resolve.data('favicon.ico')
	const exitIcon = appPath.resolve.public('close.png')
	tray = new Tray(iconUrl)
	// Establecer la lista del menú de clic derecho
	const trayContextMenu = Menu.buildFromTemplate([
	// {
		// tipo: 'separador'
		// },
		{
			icon: exitIcon,
			label: 'Exit',
			click: function () {
				force_quit = true
				tray.destroy()
				app.quit()
				mainWindow = null
			}
		}
	])
	// Escuche la comunicación songName y configure la información al pasar el mouse
	ipcMain.on('songName', async (_e, data) => {
		tray.setToolTip(data)
	})
	//Monitorear la información del botón izquierdo del ratón
	tray.on('click', () => {
		mainWindow.show()
	})
	tray.setContextMenu(trayContextMenu)
// Escuche la información del clic derecho. Hacer clic en el icono no tiene ningún efecto de la siguiente manera:
	// tray.on('clic derecho', () => {
	// bandeja.popUpContextMenu(bandejaContextMenu)
	// })

	// Escuchar eventos de salida del sistema
	installResp('app-quit', (event, data) => {
		force_quit = true
		tray.destroy()
		app.quit()
		mainWindow = null
	})
}

// [Cambio] Obtener la URL de la aplicación actual
async function getAppUrl() {
	return devOrProd(
		() => {
			// dev
			const { host, port } = cfg.server
			return `http://${host}:${port}`
		},
		async () => {
			// prod
			// El entorno de producción empaquetará el front-end en el directorio público del servidor
			return `http://localhost:${$userConfig.port}`
		}
	)
}

// Iniciar el servidor estático
function serve(port) {
	return new Promise(resolve => {
		const app = express()
		app.use(express.static(WebPath))
		app.listen(port, () => {
			$log.info(`App listening port: ${port}`)
			resolve()
		})
	})
}

// Determinar la devolución de llamada de ejecución del entorno
function devOrProd(devCall, prodCall) {
	if (process.env.NODE_ENV === 'development') {
		if (devCall) {
			return devCall()
		}
	} else {
		if (prodCall) {
			return prodCall()
		}
	}
}

// puesta en marcha
function bootstrap() {
	// singleton
	const gotTheLock = app.requestSingleInstanceLock()
	if (!gotTheLock) {
		app.quit()
	} else {
		app.on('second-instance', (event, commandLine, workingDirectory) => {
// Al ejecutar la segunda instancia, el foco estará en la ventana myWindow
			if (mainWindow) {
				if (mainWindow.isMinimized()) mainWindow.restore()
				mainWindow.focus()
			}
		})
	}

	// 删除dev tools extensions
	try {
		if (process.platform === 'win32' && nativeTheme.shouldUseDarkColors === true) {
			require('fs').unlinkSync(require('path').join(app.getPath('userData'), 'DevTools Extensions'))
		}
	} catch (_) {}

	/** app事件监听 */
	app.on('ready', createWindow)

	app.on('window-all-closed', () => {
		if (process.platform !== 'darwin') {
			app.quit()
		}
	})

	app.on('activate', () => {
		if (mainWindow === null) {
			createWindow()
		}
	})

	// 打印信息
	printAppInfo()
}

// 打印应用一些信息
function printAppInfo() {
	printDivider()
	$log.info(`NODE_ENV: ${process.env.NODE_ENV}`)
	$log.info(`AppData Path: ${AppDataPath}`)
	$log.info(`UserData Path: ${UserDataPath}`)
	$log.info(`Logs Path: ${LogsPath}`)
	$log.info(`Work Path: ${WorkPath}`)
	$log.info(`Web Path: ${WebPath}`)
}

// 打印分割线
function printDivider() {
	$log.info('-----------------------------------------------')
}

// 全局快捷键
function installShortCut(mainWindow) {
	// Alt+V 打开调试界面
	globalShortcut.register('Alt+V', () => {
		mainWindow.webContents.openDevTools()
	})
}
