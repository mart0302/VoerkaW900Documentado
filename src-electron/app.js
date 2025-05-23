/**
 * Aplicar el método principal para implementar la lógica empresarial.
 * interacción ipc: xxx (solicitud); xxx-syncid-reply (respuesta)
 * Durante el proceso de interacción ipc, si los datos devueltos tienen _error, significa que hay un error; de lo contrario, los datos son exitosos.
 */
// Cargar variables de entorno
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

// Inicializar el directorio de la aplicación
appPath.init()

// Registro de eventos de comunicación IPC
function installResp(name, response, resp = true) {
	ipcMain.on(name, async (event, data) => {
		const res = await response(event, data)
		if (resp) {
			event.reply(`${name}-${data._sync}-reply`, res === undefined ? {} : res)
		}
	})
}

exports.installResp = installResp

// servicios dependientes
const DEPENDENCIES = [
	{
		name: 'emqx',
		description: 'dependencies.emqx_description', // Como todavía no hay internacionalización del backend de Electron, lo escribiré en el frontend por ahora.
		log_event: 'emqx-log',
		bin: appPath.resolve.extraFiles('emqx/bin'),
		start: 'emqx start',
		stop: 'emqx stop',
		disabled: true, // La nueva versión ya no usa emqx como servidor mqtt, sino que usa la versión nodejs de aedes, así que deshabilítela
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

// Clase de servicio dependiente
class Dep {
	constructor(win, options = {}) {
		this.win = win
		this.options = options
		// Estado actual del servicio
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
		// comprobar estado
		try {
			const res = await this.options.check.call(this)
			// No utilice _changeStatus para comprobar el estado, de lo contrario se activará el evento
			this.status = !!res
			return res
		} catch (error) {
			this.log(`check status, error: ${error.message}`)
			return this.status
		}
	}

	// TODO: Se habilitará la comprobación del estado
	_changeStatus(value) {
		if (this.status !== value) {
			this.status = !!value
			this.win.webContents.send('dep-change', this.info)
		}
	}

	// imprimir registro
	log(data) {
		$log.info(this.name, data)
// El front-end ya no muestra registros
		/*
		este.win.webContents.send(
			este.opciones.log_event,
			`[${this.name}@${new Date().toLocaleString()}] ${data.toString()}`
		)
    */
	}

	// Iniciar servicios dependientes
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

	// Iniciar servicios dependientes
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

	// Después de que la ventana regresa, debe haber un espacio entre eventos; de lo contrario, el estado de verificación real puede ser inexacto.
	_takeARest() {
		return new Promise(r => setTimeout(r, 3000))
	}
}

// Registrar servicios dependientes 
function installDeps({ mainWindow, store }) {
	const deps = DEPENDENCIES.filter(item => !item.disabled).map(item => new Dep(mainWindow, item))
	// Obtener la lista de servicios (el cliente del navegador puede solicitarla activamente;
	// combinado con el evento `dep-change`, se puede lograr una actualización en tiempo real)	
	installResp('get-deps', async event => {
		// Verificar uno por uno el estado de los servicios dependientes
		for (let index = 0; index < deps.length; index++) {
			const dep = deps[index]
			await dep.check()
		}
		// Devolver resultado
		return deps.map(dep => {
			return dep.info
		})
	})

	// Iniciar todos los servicios
	installResp('start-deps', async () => {
		// Iniciar servicios en lote
		const res = await execDeps(deps, 'start')
		return res
	})
	// TODO: Detener todos los servicios dependientes al cerrar el software

	// Iniciar servicio
	installResp('start-dep', async (event, data) => {
		const dep = findDep(deps, data)
		const res = await dep.start()
		return res
	})
	// Detener servicio
	installResp('stop-dep', async (event, data) => {
		const dep = findDep(deps, data)
		const res = await dep.stop()
		return res
	})
	return deps
}

// Encuentra servicios dependientes
function findDep(deps, data) {
	return deps.find(item => item.name === data.name)
}

// Iniciar/detener servicios en lotes
function execDeps(deps, cmd) {
	const doings = deps.map(dep => dep[cmd]())
	return Promise.all(doings)
}

//Configuración predeterminada
// Si no es absolutamente necesario, la configuración se puede guardar en el almacenamiento local del frontend
// Para determinar si una configuración se debe guardar en el backend o en el frontend, vea si pertenece al frontend o al backend. Si es ambos, pertenece al backend.
const CONFIG_KEY = 'config'
const DEFAULT_CONFIG = {}
// Relacionado con la configuración
function installConfig({ mainWindow, store }) {
	if (!store.has(CONFIG_KEY)) {
		store.set(CONFIG_KEY, DEFAULT_CONFIG)
	}

	// Obtener configuración
	installResp('get-config', async event => {
		// Devolver resultado
		return store.get(CONFIG_KEY)
	})
	// Establecer configuración
	installResp('set-config', async (event, data = {}) => {
		const oldConfig = store.get(CONFIG_KEY)
		const newConfig = _.merge(_.cloneDeep(oldConfig), data)
		store.set(CONFIG_KEY, newConfig)
		// Disparar evento de actualización de configuración
		mainWindow.webContents.send('config-change', { update: data, new: newConfig, old: oldConfig })
		// Devolver resultado
		return newConfig
	})
}

// Servicio de descubrimiento dispositivos
async function installDiscover({ mainWindow, store }) {
	const discoverService = new DiscoverService()
	// TODO: Desde el inicio de la operación del software, cualquier archivo escaneado se enviará a este grupo de caché. Si no se limpia, puede haber fugas de memoria, pero la probabilidad es pequeña.
	// La limpieza puede provocar que el dispositivo secundario no encuentre el dispositivo principal durante la autenticación. Esta es la única manera de lograr esta función.
	discoverService.cache = {}

	// Dispositivo de búsqueda de base de datos
	// Se utiliza para ignorar la autenticación y usar el caché, que se mantendrá automáticamente.
	const getDeviceFromDb = useCache(
		async sn => {
			try {
				const device = await $db.Device.findByPk(sn)
				return !!device
			} catch (error) {
				return false
			}
		},
		{ max: 200, life: 30 * 1000 } // De forma predeterminada, si se elimina el dispositivo, seguirá autenticado en la lista de descubrimiento.
	)

	// Si se debe ignorar la autenticación
	let ignoreAuth = false

	// Abra el software para iniciar el servicio de descubrimiento
	await discoverService.start()

	// Obtener si el escaneo está actualmente en progreso
	installResp('get-discover-status', async event => {
		// devolver resultados
		return { discovering: discoverService.inDiscovering }
	})

	//Comenzar a escanear
	installResp('start-scan', async (event, data) => {
		const { ip, ignoreAuthorized } = data
		ignoreAuth = ignoreAuthorized
	// TODO: Especifique la tarjeta de red a escanear, que se verificará actualizando voerka-discover
		const { host } = $userConfig
		$log.info('start-scan ip and networkInterface====', ip, host)
		let { err } = await discoverService.startDiscoverers({ ip, networkInterface: host })
		// devolver resultados
		err = err ? err.message || String(err) : undefined
		return { _error: err }
	})

	// Detener el escaneo
	installResp('stop-scan', async event => {
		let { err } = await discoverService.stopDiscoverers()
		// devolver resultados
		err = err ? err.message || String(err) : undefined
		return { _error: err }
	})

	//Configurar el dispositivo descubierto (configuración de multidifusión)
	installResp('multicast-config', async (event, data) => {
		const config = _.pick(data, ['sn', 'source', 'targetIP', 'cmd', 'payload'])
		$log.info(`multicast-config: ${JSON.stringify(config)}`)
		let { err } = await discoverService.configDiscovered(config)
		// No estoy seguro de qué es err
		err = err ? err.message || String(err) : undefined
		// devolver resultados
		return { _error: err }
	})

	//Resultados del escaneo
	discoverService.on('discovered', async device => {
		// El dispositivo es el dispositivo descubierto, consulte el protocolo para obtener más detalles
		//Hay un error en discoverService. Aún quedarán efectos residuales después de cerrar el escaneo.
		if (discoverService.inDiscovering) {
			// Convertir
			device = parseScanDevice(device)
			// retención de caché
			discoverService.cache[device.sn] = device
			// Verificar si está autenticado (porque los datos escaneados ya tienen un campo autorizado (no está clara su función), para poder distinguirlo hay que darle otro nombre)
			device.auth = await getDeviceFromDb(device.sn)
			// Ignorar la autenticación y regresar directamente si el dispositivo ha sido autenticado
			if (ignoreAuth && device.auth) {
				return
			}
			mainWindow.webContents.send('scan-discovered', device)
		}
	})

	return discoverService
}

// Servicio de tarjeta de red
const IpRegexp =
	/^(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])\.(\d{1,2}|1\d\d|2[0-4]\d|25[0-5])$/
function installNetworks({ mainWindow, store }) {
	// Obtener la lista opcional de tarjetas de red (ip)
	installResp('get-network', async (event, data) => {
		const interfaces = Object.values(await macaddress.all())

		return {
			ips: interfaces.map(item => item.ipv4)
		}
	})
}

// Los campos de datos obtenidos al escanear el dispositivo comienzan todos con mayúsculas, así que conviértalos aquí
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

//Supervisión del certificado de registro
function installLicenseWatcher({ mainWindow, store }) {
	// Resultado de la verificación del certificado
	$licenseValidResult = { result: false, message: '', checked: false }
	//Introduzca el oyente del certificado
	if (process.env.LICENSE_BUILD === 'true') {
		// compilar
		require('./license/build/build.js')
	} else {
		const logName = 'licenseWatcher'
		//Monitoreo de certificados
		try {
			// Verificar cada 10 minutos
			$watcher = require('./license')({ checkInterval: 10 * 60 * 1000, sn: $$SN })
		} catch (error) {
			$log.error(logName, error.message)
		}
		if ($watcher) {
			// Escuche los eventos del monitor de certificados de Voerka
			$watcher
				.on('started', () => {
					// Cuando comienza el monitoreo
					$log.info(logName, 'license watch started', $watcher.certificate)
				})
				.on('valid', () => {
				// Guardamos el resultado de la validación de la licencia en un objeto global ($licenseValidResult).
				// Esto permite que el estado de la licencia pueda ser accedido por cualquier módulo del sistema,
				// y eventualmente expuesto mediante una API REST si se migra la aplicación a un entorno web.
				// De este modo, se desacopla la lógica de validación de Electron, facilitando una futura versión sin dependencias de escritorio.

					$licenseValidResult.result = Object.keys($watcher.licenseData).reduce((data, cur) => {
						data[cur.replace('$', '')] = $watcher.licenseData[cur]
						return data
					}, {})
					$licenseValidResult.message = ''
					$licenseValidResult.checked = true

					//Enviar eventos a electron
					mainWindow.webContents.send('license-validate', { sn: $$SN, ...$licenseValidResult })
				})
				.on('invalid', e => {
					// Cuando el certificado expira
					// $log.error(logName, 'licencia inválida', e.message)
					$licenseValidResult.result = false
					$licenseValidResult.message = e.message
					$licenseValidResult.checked = true
					//Enviar eventos a electron
					mainWindow.webContents.send('license-validate', { sn: $$SN, ...$licenseValidResult })
				})
				.on('error', e => {
					
				// Cuando ocurre una excepción de monitoreo, es decir, cuando el certificado expira
					$log.error(logName, 'license watch error', e.message)
				})
				.on('stopped', () => {
					// Cuando se detiene el monitoreo
					$log.info(logName, 'license watch stoped')
				})

			// Empezar a escuchar
			$watcher.start()

			return $watcher
		}
	}
}

// Gestión de transmisiones de voz
function installTTS({ mainWindow, store }) {
	const tts = new WindowsTTS()

	// Obtener la lista de tareas actual
	installResp('get-tts-tasks', async (event, data) => {
		// devolver resultados
		return {
			tasks: tts.tasks,
			history: tts.history
		}
	})

	// Agregar tarea
	installResp('add-tts-task', async (event, data) => {
		// Devolver resultado
		return tts.addTask(data)
	})

	// Eliminar tarea
	installResp('remove-tts-task', async (event, { id }) => {
		// Devolver resultado
		return tts.removeTask(id)
	})

	// Limpiar tareas
	installResp('clean-tts-tasks', async event => {
		// Devolver resultado
		return tts.clean()
	})

	// Actualizar configuración del sintetizador
	installResp('update-tts', async (event, data) => {
		tts.update(data)
		return tts.options
	})

	return tts
}

// Gestión de base de datos
function installDBManage({ mainWindow, store }) {
	//Abre la carpeta donde se encuentra la base de datos
	installResp('show-db', async (event, data) => {
		const dbConfig = appPath.loadSequelizeConfig()
		shell.showItemInFolder(dbConfig.storage)
	})
}

//Gestión de la configuración de usuarios
function installUserConfigManage({ mainWindow, store }) {
	//Abre la carpeta donde se encuentra la base de datos
	installResp('get-user-config', async (event, data) => {
		return $userConfig
	})

	//Abre la carpeta donde se encuentra la base de datos
	installResp('update-user-config', async (event, data) => {
		// Enviar evento de cambio de atributo
		$messager.sendHostAttrs(data)
		return appPath.updateUserConfig(data)
	})
}

//Servicio de puerto serie USB
function installSerialport({ mainWindow, store }) {
	$log.info('+++++++++++++installSerialport++++++++++++++++++++++')
	createSeriport(mainWindow)
	installResp('start-scan-seriport', async () => {
		startScanSeriport()
		// Resuelve el problema de que la información del dispositivo en la lista de descubrimiento de dispositivos es inconsistente con la información real del dispositivo debido a la actualización del dispositivo después del descubrimiento del dispositivo
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

//Método principal de entrada 
exports.main = async function main({ store, mainWindow } = {}) {
	// El servidor MQTT se iniciará después de 10 segundos
	setTimeout(() => {
		serveMqtt()
			.then(res => {
				$log.info('mqtt server started', res)
			})
			.catch(err => {
				console.log('mqtt server error', err.message)
			})
	}, 10 * 1000)

	// Iniciar la interfaz del backend
	require('./server')

	// El frontend escucha el cierre de la ventana para eliminar el token
	// sto se puede hacer porque este proyecto solo tiene una ventana
	mainWindow.on('close', () => {
		mainWindow.webContents.send('window-close')
	})

	// Número de serie del dispositivo
	$$SN = await getSN()

	//Registrar configuración
	installConfig({ mainWindow, store })

	// Registrar escucha de certificados
	installLicenseWatcher({ mainWindow, store })

	//Registrar servicios dependientes
	const deps = installDeps({ mainWindow, store })

	require('./server')

	// Síntesis de voz (TTS - Text To Speech)
	$tts = installTTS({ mainWindow, store })

	//Gestión de base de datos
	installDBManage({ mainWindow, store })

	// Gestión de configuración del usuario
	installUserConfigManage({ mainWindow, store })

	//  Registrar servicio de escaneo
	// Objeto global
	$discoverService = await installDiscover({ mainWindow, store })

	//Red
	installNetworks({ mainWindow, store })

	//  Servicio de puerto serial
	installSerialport({ mainWindow, store })

	//  Registrar monitor de certificados de dispositivos (temporalmente en desuso)
	// const { installDevicesLicenseWatcher } = require('./server/config/licenses')
	// installDevicesLicenseWatcher()

	//Operaciones antes de salir de la aplicación
	app.on('before-quit', async () => {
		// Detener el escaneo
		await $discoverService.stop()
		//  Detener el servicio
	})
}
