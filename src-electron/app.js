/**
 * 应用主方法，实现业务逻辑
 * ipc交互：xxx(请求); xxx-syncid-reply(反应)
 * ipc交互过程中，如果返回数据有_error，则表示错误，无则数据即是成功数据
 */
// 加载环境变量
require('dotenv-safe').load({
	path: '.env',
	sample: '.env.example'
})
const appPath = require('./app-paths')
const { app, ipcMain, shell } = require('electron')
const { spawnPromise } = require('./spawn')
const _ = require('lodash')
const { mergeDeepRight } = require('ramda')
const DiscoverService = require('voerka-discover')
const { useCache, getSN } = require('./utils')
const macaddress = require('macaddress')
const WindowsTTS = require('./tts')
const serveMqtt = require('./mqtt')
const {
	createSeriport,
	startScanSeriport,
	stopScanSeriport,
	getStatus,
	sendMessage,
	addDevice,
	closeSeriport
} = require('./server/config/seriportMessager')

// 应用目录初始化
appPath.init()

// ipc通信事件注册
function installResp(name, response, resp = true) {
	ipcMain.on(name, async (event, data) => {
		const res = await response(event, data)
		if (resp) {
			event.reply(`${name}-${data._sync}-reply`, res === undefined ? {} : res)
		}
	})
}

exports.installResp = installResp

// 依赖服务
const DEPENDENCIES = [
	{
		name: 'emqx',
		description: 'dependencies.emqx_description', // 因为暂时没有electron后端的国际化，所以暂时这样写到前端去
		log_event: 'emqx-log',
		bin: appPath.resolve.extraFiles('emqx/bin'),
		start: 'emqx start',
		stop: 'emqx stop',
		disabled: true, // 新版本不再采用emqx作为mqtt服务端，而是使用nodejs版的aedes，所以禁用
		async check() {
			const { bin } = this.options
			try {
				let res = await spawnPromise('emqx ping', [], { cwd: bin, shell: true })
				res = (res || '').trim() === 'pong'
				return res
			} catch (err) {
				return false
			}
		}
	}
]
exports.DEPENDENCIES = DEPENDENCIES

// 依赖服务类
class Dep {
	constructor(win, options = {}) {
		this.win = win
		this.options = options
		// 当前服务状态
		this.status = false

		this.check()
	}

	get name() {
		return this.options.name
	}

	get info() {
		return {
			..._.omit(this.options, ['check']),
			status: this.status
		}
	}

	async check() {
		// 检查状态
		try {
			const res = await this.options.check.call(this)
			// 检查状态不要使用_changeStatus，否则会触发事件
			this.status = !!res
			return res
		} catch (error) {
			this.log(`check status, error: ${error.message}`)
			return this.status
		}
	}

	// TODO: 状态检查要开放
	_changeStatus(value) {
		if (this.status !== value) {
			this.status = !!value
			this.win.webContents.send('dep-change', this.info)
		}
	}

	// 打印日志
	log(data) {
		$log.info(this.name, data)
		// 前端不再显示日志
		/*
		this.win.webContents.send(
			this.options.log_event,
			`[${this.name}@${new Date().toLocaleString()}] ${data.toString()}`
		)
    */
	}

	// 启动依赖服务
	async start() {
		const { bin, start } = this.options
		this.log(`starting, cwd: ${bin}, cmd: ${start}`)
		try {
			const status = await this.check()
			if (status) {
				this.log(`start OK, already started`)
			} else {
				const res = await spawnPromise(start, [], { cwd: bin, shell: true })
				this.log(`start OK, stdout: ${res || 'null'}`)
			}
			await this._takeARest()
			this._changeStatus(true)
			return true
		} catch (error) {
			this.log(`start Error, stderr: ${error.message}`)
			return false
		}
	}

	// 启动依赖服务
	async stop() {
		const { bin, stop } = this.options
		this.log(`stopping, cwd: ${bin}, cmd: ${stop}`)
		try {
			const status = await this.check()
			if (!status) {
				this.log(`stop OK, already stopped`)
			} else {
				const res = await spawnPromise(stop, [], { cwd: bin, shell: true })
				this.log(`stop OK, stdout: ${res || 'null'}`)
			}
			await this._takeARest()
			this._changeStatus(false)
			return true
		} catch (error) {
			this.log(`stop Error, stderr: ${error.message}`)
			return false
		}
	}

	// 窗口执行返回后需要间隙一段事件，否则可能实际检查状态不准确
	_takeARest() {
		return new Promise(r => setTimeout(r, 3000))
	}
}

// 注册依赖服务
function installDeps({ mainWindow, store }) {
	// 注册依赖服务
	const deps = DEPENDENCIES.filter(item => !item.disabled).map(item => new Dep(mainWindow, item))
	// 获取服务列表（浏览器端主动拉取，配合`dep-change`事件可以达到实时更新效果）
	installResp('get-deps', async event => {
		// 依次检查依赖服务状态
		for (let index = 0; index < deps.length; index++) {
			const dep = deps[index]
			await dep.check()
		}
		// 返回结果
		return deps.map(dep => {
			return dep.info
		})
	})

	// 启动所有服务
	installResp('start-deps', async () => {
		// 批量启动服务
		const res = await execDeps(deps, 'start')
		return res
	})
	// TODO: 关闭软件时关闭所有依赖服务

	// 启动服务
	installResp('start-dep', async (event, data) => {
		const dep = findDep(deps, data)
		const res = await dep.start()
		return res
	})
	// 停止服务
	installResp('stop-dep', async (event, data) => {
		const dep = findDep(deps, data)
		const res = await dep.stop()
		return res
	})
	return deps
}

// 查找依赖服务
function findDep(deps, data) {
	return deps.find(item => item.name === data.name)
}

// 批量启动服务/停止服务
function execDeps(deps, cmd) {
	const doings = deps.map(dep => dep[cmd]())
	return Promise.all(doings)
}

// 默认配置
// 如非绝对必要,配置可以保存到前端的localStorage里
// 判断一个配置是要保存到后端还是前端,就是看它是属于前端还是后端的,前后端都有则属于后端
const CONFIG_KEY = 'config'
const DEFAULT_CONFIG = {}
// 配置相关
function installConfig({ mainWindow, store }) {
	if (!store.has(CONFIG_KEY)) {
		store.set(CONFIG_KEY, DEFAULT_CONFIG)
	}

	// 获取配置
	installResp('get-config', async event => {
		// 返回结果
		return store.get(CONFIG_KEY)
	})
	// 设置配置
	installResp('set-config', async (event, data = {}) => {
		const oldConfig = store.get(CONFIG_KEY)
		const newConfig = _.merge(_.cloneDeep(oldConfig), data)
		store.set(CONFIG_KEY, newConfig)
		// 触发配置更新事件
		mainWindow.webContents.send('config-change', { update: data, new: newConfig, old: oldConfig })
		// 返回结果
		return newConfig
	})
}

// 设备发现服务
async function installDiscover({ mainWindow, store }) {
	const discoverService = new DiscoverService()
	// TODO: 软件运行开始算，只要被扫描到就会被送进这个缓存池，不清理，有可能内存泄漏，但是机会不大
	// 清理可能导致，子设备认证时却找不到父设备的可能，为了实现这个功能只能如此
	discoverService.cache = {}

	// 数据库查找设备
	// 用于实现忽略已认证，使用缓存，缓存会自维护
	const getDeviceFromDb = useCache(
		async sn => {
			try {
				const device = await $db.Device.findByPk(sn)
				return !!device
			} catch (error) {
				return false
			}
		},
		{ max: 200, life: 30 * 1000 } // 默认30分钟的话，如果设备被删除，在发现列表中该设备依然是已认证状态
	)

	// 是否忽略已认证
	let ignoreAuth = false

	// 软件打开即开启发现服务
	await discoverService.start()

	// 获取当前是否正在扫描中
	installResp('get-discover-status', async event => {
		// 返回结果
		return { discovering: discoverService.inDiscovering }
	})

	// 开始扫描
	installResp('start-scan', async (event, data) => {
		const { ip, ignoreAuthorized } = data
		ignoreAuth = ignoreAuthorized
		// TODO: 指定网卡扫描，待升级voerka-discover验证
		const { host } = $userConfig
		$log.info('start-scan ip and networkInterface====', ip, host)
		let { err } = await discoverService.startDiscoverers({ ip, networkInterface: host })
		// 返回结果
		err = err ? err.message || String(err) : undefined
		return { _error: err }
	})

	// 停止扫描
	installResp('stop-scan', async event => {
		let { err } = await discoverService.stopDiscoverers()
		// 返回结果
		err = err ? err.message || String(err) : undefined
		return { _error: err }
	})

	// 配置被发现的设备（组播设置）
	installResp('multicast-config', async (event, data) => {
		const config = _.pick(data, ['sn', 'source', 'targetIP', 'cmd', 'payload'])
		$log.info(`multicast-config: ${JSON.stringify(config)}`)
		let { err } = await discoverService.configDiscovered(config)
		// 不确定err是什么
		err = err ? err.message || String(err) : undefined
		// 返回结果
		return { _error: err }
	})

	// 扫描结果
	discoverService.on('discovered', async device => {
		// device 为被发现设备，内容见协议
		// discoverService有bug，关闭扫描之后还是会有余波
		if (discoverService.inDiscovering) {
			// 转化
			device = parseScanDevice(device)
			// 缓存保持
			discoverService.cache[device.sn] = device
			// 查看是否认证(因为扫描数据已经有authorized字段（不清楚作用），为了区分，另起名)
			device.auth = await getDeviceFromDb(device.sn)
			// 忽略认证 且 设备已认证 直接返回
			if (ignoreAuth && device.auth) {
				return
			}
			mainWindow.webContents.send('scan-discovered', device)
		}
	})

	return discoverService
}

// 网卡服务
const IpRegexp =
	/^(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])$/
function installNetworks({ mainWindow, store }) {
	// 获取网卡（ip）可选列表
	installResp('get-network', async (event, data) => {
		const interfaces = Object.values(await macaddress.all())

		return {
			ips: interfaces.map(item => item.ipv4)
		}
	})
}

// 扫描设备得到的数据字段都是大写开头，这边进行转换
function parseScanDevice(device = {}) {
	device = JSON.parse(JSON.stringify(device))
	const {
		Authorized,
		ConfigPort,
		Header,
		Lati,
		Long,
		Location,
		MQTT,
		MQTT_Password,
		MQTT_Username,
		Model,
		Networks,
		Parent,
		SN,
		Source,
		Type,
		Version,
		WIFI_AP,
		WIFI_Enable,
		WIFI_Password,
		WIFI_Secret
	} = device

	const networks = Networks.map(item => ({
		dhcp: item.DHCP,
		dnsAlter: item.DNS_alter,
		dnsPrefer: item.DNS_prefer,
		gateway: item.Gateway,
		ip: item.IP,
		interface: item.Interface,
		mac: item.MAC,
		subnetMask: item.SubnetMask
	}))

	return {
		sn: SN.toLowerCase(),
		parent: Parent,
		type: Type,
		version: Version,
		networks: networks,
		mqtt: { broker: MQTT, username: MQTT_Username, password: MQTT_Password, domain: '' },
		location: { label: Location, long: Long, lati: Lati },
		source: Source,
		model: Model,
		wifi: { ap: WIFI_AP, enable: !!WIFI_Enable, password: WIFI_Password, secret: WIFI_Secret },
		authorized: Authorized,
		configPort: ConfigPort,
		header: Header
	}
}

// 注册证书监听
function installLicenseWatcher({ mainWindow, store }) {
	// 证书验证结果
	$licenseValidResult = { result: false, message: '', checked: false }
	// 引入证书监听器
	if (process.env.LICENSE_BUILD === 'true') {
		// 编译
		require('./license/build/build.js')
	} else {
		const logName = 'licenseWatcher'
		// 证书监听
		try {
			// 每10分钟检测一次
			$watcher = require('./license')({ checkInterval: 10 * 60 * 1000, sn: $$SN })
		} catch (error) {
			$log.error(logName, error.message)
		}
		if ($watcher) {
			// 监听 voerka 证书监视器事件
			$watcher
				.on('started', () => {
					// 当监视开始时
					$log.info(logName, 'license watch started', $watcher.certificate)
				})
				.on('valid', () => {
					// 将结果放到全局对象中，api就可以返回这个结果，弱化electron的依赖，后面可以脱离electron开发web版本
					// 当证书生效或恢复生效时
					$licenseValidResult.result = Object.keys($watcher.licenseData).reduce((data, cur) => {
						data[cur.replace('$', '')] = $watcher.licenseData[cur]
						return data
					}, {})
					$licenseValidResult.message = ''
					$licenseValidResult.checked = true

					// 发送事件给electron
					mainWindow.webContents.send('license-validate', { sn: $$SN, ...$licenseValidResult })
				})
				.on('invalid', e => {
					// 当证书失效时
					// $log.error(logName, 'license invalid', e.message)
					$licenseValidResult.result = false
					$licenseValidResult.message = e.message
					$licenseValidResult.checked = true
					// 发送事件给electron
					mainWindow.webContents.send('license-validate', { sn: $$SN, ...$licenseValidResult })
				})
				.on('error', e => {
					// 当监视异常时，也就是证书失效时
					$log.error(logName, 'license watch error', e.message)
				})
				.on('stopped', () => {
					// 当监视停止时
					$log.info(logName, 'license watch stoped')
				})

			// 启动监听
			$watcher.start()

			return $watcher
		}
	}
}

// 语音播报管理
function installTTS({ mainWindow, store }) {
	const tts = new WindowsTTS()

	// 获取当前的任务列表
	installResp('get-tts-tasks', async (event, data) => {
		// 返回结果
		return {
			tasks: tts.tasks,
			history: tts.history
		}
	})

	// 添加任务
	installResp('add-tts-task', async (event, data) => {
		// 返回结果
		return tts.addTask(data)
	})

	// 移除任务
	installResp('remove-tts-task', async (event, { id }) => {
		// 返回结果
		return tts.removeTask(id)
	})

	// 清除任务
	installResp('clean-tts-tasks', async event => {
		// 返回结果
		return tts.clean()
	})

	// 更新播报器设置
	installResp('update-tts', async (event, data) => {
		tts.update(data)
		return tts.options
	})

	return tts
}

// 数据库管理
function installDBManage({ mainWindow, store }) {
	// 打开数据库所在文件夹
	installResp('show-db', async (event, data) => {
		const dbConfig = appPath.loadSequelizeConfig()
		shell.showItemInFolder(dbConfig.storage)
	})
}

// 用户配置管理
function installUserConfigManage({ mainWindow, store }) {
	// 打开数据库所在文件夹
	installResp('get-user-config', async (event, data) => {
		return $userConfig
	})

	// 打开数据库所在文件夹
	installResp('update-user-config', async (event, data) => {
		// 下发属性变更事件
		$messager.sendHostAttrs(data)
		return appPath.updateUserConfig(data)
	})
}

// USB串口服务
function installSerialport({ mainWindow, store }) {
	$log.info('+++++++++++++installSerialport++++++++++++++++++++++')
	createSeriport(mainWindow)
	installResp('start-scan-seriport', async () => {
		startScanSeriport()
		// 解决设备发现之后设备更新使得设备发现列表中的设备信息与实际不一致问题
		let devices = Object.values($seriportsInfos)
		let data = []
		for (let i = 0; i < devices.length; i++) {
			const newDevice = await $db.Device.findByPk(devices[i].sn)
			if (newDevice) {
				data.push(mergeDeepRight(devices[i], newDevice.dataValues))
			} else {
				devices[i].authorized = false
				data.push(devices[i])
			}
		}
		mainWindow.webContents.send('scan-seriport-discovered', data)
	})

	installResp('get-scan-seriport-status', async () => {
		const res = getStatus()
		return res
	})

	installResp('stop-scan-seriport', () => {
		stopScanSeriport()
	})
	installResp('set-usb-config', (event, data) => {
		$log.info('set-usb-config data=====', data)
		sendMessage(data)
	})

	installResp('get-usb-serialports', () => {
		$log.info('$portsInfo=====', $portsInfo)
		return Object.values($portsInfo)
	})

	installResp('select-usb-serialport', (event, data) => {
		$log.info('select-usb-serialport', data)
		addDevice(data)
	})
	installResp('close-usb-serialport', (event, data) => {
		$log.info('close-usb-serialport', data)
		closeSeriport(data)
	})
}
// 主入口方法
exports.main = async function main({ store, mainWindow } = {}) {
	// 10s后启动mqtt服务端
	setTimeout(() => {
		serveMqtt()
			.then(res => {
				$log.info('mqtt server started', res)
			})
			.catch(err => {
				console.log('mqtt server error', err.message)
			})
	}, 10 * 1000)

	// 启动后端接口
	require('./server')

	// 前端监听窗口关闭删除token
	// 因为本项目是只有一个窗口的应用可以这么做
	mainWindow.on('close', () => {
		mainWindow.webContents.send('window-close')
	})

	// 设备序列号
	$$SN = await getSN()

	// 注册配置
	installConfig({ mainWindow, store })

	// 注册证书监听
	installLicenseWatcher({ mainWindow, store })

	// 注册依赖服务
	const deps = installDeps({ mainWindow, store })

	require('./server')

	// 语音播报
	$tts = installTTS({ mainWindow, store })

	// 数据库管理
	installDBManage({ mainWindow, store })

	// 用户配置管理
	installUserConfigManage({ mainWindow, store })

	// 注册扫描服务
	// 全局对象
	$discoverService = await installDiscover({ mainWindow, store })

	// 网络
	installNetworks({ mainWindow, store })

	// 串口服务
	installSerialport({ mainWindow, store })

	// 注册设备证书监听 暂时弃用
	// const { installDevicesLicenseWatcher } = require('./server/config/licenses')
	// installDevicesLicenseWatcher()

	// 应用退出前操作
	app.on('before-quit', async () => {
		// 关闭扫描
		await $discoverService.stop()
		// TODO: 停止服务
	})
}
