const { app, BrowserWindow, Menu, nativeTheme, globalShortcut, ipcMain, Tray } = require('electron')
// 修正NODE_ENV
if (app.isPackaged) {
	process.env.NODE_ENV = 'production'
} else {
	process.env.NODE_ENV = 'development'
}

// 其他引入
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

// 路径
// 应用数据
const AppDataPath = app.getPath('appData')
// 用户数据
const UserDataPath = app.getPath('userData')
// 日志
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
		// 遍历目录文件，如果超出15个，判断日期，超过15天，则删除最早一个文件
		const files = fs.readdirSync(info.dir)
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

// 当前exe同级目录，exe位置:app.getPath('exe')
const WorkPath = process.cwd()
// 前端dist位置
const WebPath = path.join(__dirname, `../`)

// 主窗口
let mainWindow
let force_quit = false
// 持久化配置
const store = new Store()

/** 开始执行 */
// 启动
bootstrap()

// 创建window对象
async function createWindow() {
	/**
	 * Initial window options
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
		// autoHideMenuBar: true,
		webPreferences: {
			webSecurity: false,
			contextIsolation: true,
			preload: path.join(__dirname, './electron-preload.js')
		}
	})

	devOrProd(
		() => {
			// if on DEV or Production with debug enabled
			mainWindow.webContents.openDevTools()
		},
		() => {
			// 生产环境关闭菜单栏
			Menu.setApplicationMenu(null)
			// we're on production; no access to devtools pls
			// mainWindow.webContents.on('devtools-opened', () => {
			// 	mainWindow.webContents.closeDevTools()
			// })
		}
	)

	/** window事件监听 */
	mainWindow.on('closed', () => {
		mainWindow = null
	})

	// 注册快捷键
	installShortCut(mainWindow)

	// 打印信息
	printAppInfo()

	// 个性化代码
	main({ store, mainWindow })

	// 加载页面
	mainWindow.loadURL(await getAppUrl())
	// 触发关闭时触发
	mainWindow.on('close', event => {
		if (!force_quit) {
			// 截获 close 默认行为
			event.preventDefault()
			// 点击关闭时触发close事件，我们按照之前的思路在关闭时，隐藏窗口，隐藏任务栏窗口
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

	// 设置托盘图标
	const iconUrl = appPath.resolve.data('favicon.ico')
	const exitIcon = appPath.resolve.public('close.png')
	tray = new Tray(iconUrl)
	// 设置右键菜单列表
	const trayContextMenu = Menu.buildFromTemplate([
		// {
		// 	type: 'separator'
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
	// 监听通讯songName设置hover信息
	ipcMain.on('songName', async (_e, data) => {
		tray.setToolTip(data)
	})
	// 监听鼠标左键信息
	tray.on('click', () => {
		mainWindow.show()
	})
	tray.setContextMenu(trayContextMenu)
	// 监听鼠标右键信息,用以下方式，点击图标没有效果
	// tray.on('right-click', () => {
	// 	tray.popUpContextMenu(trayContextMenu)
	// })

	// 监听退出系统事件
	installResp('app-quit', (event, data) => {
		force_quit = true
		tray.destroy()
		app.quit()
		mainWindow = null
	})
}

// 【改动】获取当前appUrl
async function getAppUrl() {
	return devOrProd(
		() => {
			// dev
			const { host, port } = cfg.server
			return `http://${host}:${port}`
		},
		async () => {
			// prod
			// 生产环境会将前端打包放到server的public目录下
			return `http://localhost:${$userConfig.port}`
		}
	)
}

// 启动静态服务器
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

// 判断环境执行回调
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

// 启动
function bootstrap() {
	// 单例
	const gotTheLock = app.requestSingleInstanceLock()
	if (!gotTheLock) {
		app.quit()
	} else {
		app.on('second-instance', (event, commandLine, workingDirectory) => {
			// 当运行第二个实例时,将会聚焦到myWindow这个窗口
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
