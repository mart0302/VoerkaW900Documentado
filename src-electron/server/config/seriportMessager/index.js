const SerialPort = require('serialport')

const { mergeDeepRight } = require('ramda')
const SerialMessager = require('../../../seriport')
const usbDetect = require('usb-detection')

const { MessageStruct } = require('../../../server/config/protocols')

usbDetect.startMonitoring()
// https://github.com/MadLittleMods/node-usb-detection
const {
	getUsbInfoMsg,
	getReplyInfo,
	decodeMessage,
	str_pad,
	getW300RUsbSettings,
	getW300LUsbSettings
} = require('../seriportMessager/getMessage')
const { USE_DEVICE, DEVICES_TYPE } = require('../constant')
let serialMessagers = {}
$portsInfo = {} // 串口信息，普通串口
let snProt = {} // 串口与sn的关联
let isDiscovering = false
$seriportsInfos = {} // 串口设备信息，信息体与网关一致
let _mainWindow = null
let readBufs = {} // 数据包

const DEVICE_INFO = {
	attrs: {},
	authorized: false,
	configPort: 0,
	header: 'MEEYI',
	location: { label: '', long: -1.0141398605385109e27, lati: -359404910149632 },
	model: USE_DEVICE,
	mqtt: { broker: '', domain: '', username: '', password: '' },
	networks: [
		{
			ip: '192.168.0.123',
			dhcp: false,
			dnsAlter: '223.6.6.6',
			dnsPrefer: '223.5.5.5',
			gateway: '192.168.111.1',
			interface: 'eth0',
			mac: '',
			subnetMask: '255.255.255.0'
		}
	],
	nodeId: null,
	online: true,
	parent: '',
	sn: '',
	source: 'MULTICAST',
	status: {},
	title: '',
	type: '',
	version: '',
	wifi: { ap: '', enable: false, password: '', secret: 0 },
	workerID: 0
}
usbDetect.on('add', async function (device) {
	const friendlyName = device.deviceName
	$log.info('__________attach_________', device, $portsInfo)
	let port = Object.values($portsInfo).filter(item => item.friendlyName == friendlyName)
	$log.info('__________attach port_________', port)
	if (port.length) {
		const path = port[0].path
		serialMessagers[path].openPort()
	} else {
		// 服务启动后才插上USB导致$portsInfo不存在该串口
		let ports = await SerialPort.SerialPort.list()
		port = ports.filter(item => item.friendlyName == friendlyName)
		if (port.length) {
			port = port[0]
			$portsInfo[port.path] = port
			addDevice({ path: port.path })
		}
	}
})

module.exports.createSeriport = async function (mainWindow) {
	_mainWindow = mainWindow
	let ports = await SerialPort.SerialPort.list()
	$log.info('____________________list ports +++++++++++++', ports)
	ports.map(port => {
		$portsInfo[port.path] = port
		addDevice({ path: port.path })
	})
}

async function onClosed(path) {
	const usb = Object.values(snProt).filter(item => item.id == path)
	if (usb.length) {
		const { sn } = usb[0]
		const usbDevice = await $db.Device.findByPk(sn)
		_mainWindow.webContents.send('serial_closed', { sn, path })
		$log.info('=========onClosed=====', usbDevice)
		if ($seriportsInfos[sn]) {
			delete $seriportsInfos[sn]
		}
		if (readBufs[path]) {
			delete readBufs[path]
		}
		if (usbDevice) {
			// 上报结果
			await $db.Device.update({ online: false }, { where: { sn: sn } })
			_mainWindow.webContents.send('seriport-status', { ...usbDevice, online: false })
		}
	} else {
		_mainWindow.webContents.send('serial_closed', { path })
	}
	// 串口关闭后更新设备发现列表，预防设备已拔出，依然显示设备
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
	_mainWindow.webContents.send('scan-seriport-discovered', data)
}

async function onData(data, path) {
	const { message = {}, originMsg = {} } = decodeMessage(data)
	const { sn1, sn2, sn3, sn4, cmd, payload, checksum } = originMsg
	$log.info('onData=======', message, originMsg, path, cmd)
	// sn需要补零凑成与网关一致，参考呼叫器方法
	const sn = '0000' + str_pad(sn1) + str_pad(sn2) + str_pad(sn3) + str_pad(sn4)
	snProt[sn] = { id: path, sn }
	// 查找数据库,判断设备是否已认证
	const device = await $db.Device.findByPk(sn)
	// 发送应答消息
	if (serialMessagers[path]) {
		const replyInfo = getReplyInfo()
		serialMessagers[path].sendData(replyInfo)
	}
	switch (cmd) {
		case 0:
			let usbInfos = {}
			// 如果当前串口处于重发数据状态，需停止
			if (serialMessagers[path]._resendTimer) {
				serialMessagers[path]._stopResend = true
				// 上报结果
				_mainWindow.webContents.send('send-message-to-seriport-success')
			}
			if (message.data) {
				// 设备发现USB信息
				const usbInfo = message.data.split(',')
				const model = usbInfo[1].split('=')[1]
				if (model == DEVICES_TYPE.LORA) {
					usbInfos = {
						sn,
						type: usbInfo[1].split('=')[1],
						version: usbInfo[2].split('=')[1],
						hardVersion: usbInfo[3].split('=')[1],
						attrs: {
							checkable: true,
							commMode: parseInt(usbInfo[4].split('=')[1]),
							rChannel: parseInt(usbInfo[5].split('=')[1]),
							sChannel: parseInt(usbInfo[6].split('=')[1]),
							power: parseInt(usbInfo[7].split('=')[1]),
							check: parseInt(usbInfo[8].split('=')[1]),
							path
						},
						online: true
					}
				} else if (model == DEVICES_TYPE.GENERAL) {
					usbInfos = {
						sn,
						type: usbInfo[1].split('=')[1],
						attrs: {
							checkable: false,
							commMode: parseInt(usbInfo[4].split('=')[1]),
							check: parseInt(usbInfo[5].split('=')[1]),
							path
						},
						version: usbInfo[2].split('=')[1],
						hardVersion: usbInfo[3].split('=')[1],
						online: true
					}
				}
				$log.info('usbInfos=======', usbInfos, model)
				$seriportsInfos[sn] = device?.dataValues
					? mergeDeepRight(device?.dataValues, usbInfos)
					: mergeDeepRight(DEVICE_INFO, usbInfos)
				if (isDiscovering) {
					// 上报结果
					_mainWindow.webContents.send('scan-seriport-discovered', Object.values($seriportsInfos))
				}
				// 查找数据库,判断设备是否已认证,更新设备状态
				if (device) {
					// 上报结果
					await $db.Device.update({ ...$seriportsInfos[sn], online: true }, { where: { sn: sn } })
					_mainWindow.webContents.send('seriport-status', { ...$seriportsInfos[sn], online: true })
				}
			}

			break
		case 4: // 直接发mqtt事件就好，模拟网关发出topic为/voerka/hispro/devices/0000000b0a10/events
			// 判断USB设备是否已认证，如果已认证才发送，否则不让扫描
			$log.info('device======', device)
			if (!device) break
			const callerSn = '000000' + str_pad(message.sn1) + str_pad(message.sn2) + str_pad(message.sn3)
			// 供设备发现呼叫器使用
			let callerDevice = mergeDeepRight(DEVICE_INFO, {
				sn: callerSn,
				type: 'wlcaller',
				version: device.dataValues.version,
				title: callerSn
			})
			let reg = new RegExp('\\w{1,2}', 'g')
			callerDevice.networks[0].mac = callerSn.match(reg).join(':')
			_mainWindow.webContents.send('scan-discovered', callerDevice)
			$messager.publishMessage(
				`/voerka/hispro/devices/${callerSn}/events`,
				$messager.defineMessage({
					from: callerSn,
					type: 6, // MESSAGE_TYPE.EVENTS,
					payload: {
						code: 4000,
						key: message.key,
						progress: 10,
						type: 6,
						message: ''
					}
				})
			)
			break
	}
}

module.exports.startScanSeriport = () => {
	isDiscovering = true
}

module.exports.stopScanSeriport = () => {
	isDiscovering = false
}

module.exports.getStatus = () => {
	return isDiscovering
}

module.exports.sendMessage = ({ device, data = null }) => {
	if (data) {
		// 转发数据，预留
	} else {
		// 设备配置
		const { sn, attrs, type } = device
		const port = snProt[sn]
		if (port && serialMessagers[port.id]) {
			let message = ''
			if (type == DEVICES_TYPE.LORA) {
				message = getW300LUsbSettings(attrs)
			} else if (type == DEVICES_TYPE.GENERAL) {
				message = getW300RUsbSettings(attrs)
			}
			serialMessagers[port.id].resendData(message)
		}
	}
}

function addDevice({ path }) {
	if ($portsInfo[path]) {
		serialMessagers[path] = new SerialMessager({ path }, onClosed)
		serialMessagers[path]._connect.on('data', data => {
			$log.info('addDevice ondata=====', data, path)
			if (data[0] == 85) {
				// 包头
				readBufs[path] = data
				checkData(path)
			} else if (readBufs[path]) {
				readBufs[path] = Buffer.concat([readBufs[path], data])
				checkData(path)
			}
		})
	}
}

function checkData(path) {
	try {
		let msg = MessageStruct.decode(readBufs[path])
		readBufs[path] = Buffer.alloc(0)
		$log.info('usbSerial onGatewayData cmd:', msg.cmd)
		onData(msg, path)
	} catch (e) {
		$log.error('usb onGatewayData error:', e.message)
	}
}

module.exports.closeSeriport = ({ path }) => {
	if (serialMessagers[path]) {
		serialMessagers[path].close()
	}
}

module.exports.addDevice = addDevice
