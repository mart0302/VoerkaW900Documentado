// Método de instalación https://zhuanlan.zhihu.com/p/436672864
// Cómo usar https://blog.csdn.net/Naisu_kun/article/details/121492829
//Obtener la instancia del puerto serial
const { SerialPort } = require('serialport')

const { mergeDeepRight } = require('ramda')
const { getUsbInfoMsg, getHeartBeatInfo } = require('../server/config/seriportMessager/getMessage')
/**
 * Clase de puerto serie, utilizada para la comunicación del puerto serie.
 * Al enviar un mensaje al puerto serie, envíelo cada 500ms. Si no hay respuesta después de 3 tiempos de espera, el puerto serie se cerrará. Al hacerlo se puede 1. evitar que el puerto serie no esté disponible debido a que no responde a los mensajes a tiempo; 2. evitar ocupar los puertos seriales de otras personas.
 */

const HEART_BEAT = 30 * 1000
const SEND_MESSAGE_TIMEOUT = 500
const STATUS = {
	INIT: 'init',
	OPENED: 'opened',
	CLOSED: 'closed'
}

module.exports = class SerialMessager {
	constructor(options = {}, onClosed) {
		// Todas las instancias del puerto serie de almacenamiento
		this._stopResend = false // Controla si se debe reenviar la acción del mensaje
		this._timeout = 0 // Tiempos de espera para enviar mensajes
		this._connects = {}
		this._path = options.path //Nombre del puerto serie
		this._infos = {}
		this.sn = '' //Número de serie USB correspondiente al puerto serie
		this._status = STATUS.INIT
		this.onClosed = onClosed
		this._options = mergeDeepRight(
			{
				autoOpen: false, //Abrir el puerto automáticamente
				baudRate: 115200, // tasa de baudios
				dataBits: 8, //bits de datos
				parity: 'none', // Verificación
				stopBits: 1, // Bit de parada, opcional 1 o 2
				rts: true,
				cts: true
			},
			options
		)
		this.startPort()
	}

	startPort() {
		this._connect = new SerialPort(
			{
				...this._options
			},
			function (err) {
				if (err) {
					$log.error('open serial error: ', err.message)
					// mainWindow.webContents.send('serial_open_error', err.message)
					return
				}
			}
		)
		// this._connect.on('data', this.onData.bind(this)) // 收到数据时触发；
		this._connect.on('open', this.onConnected.bind(this)) // 端口打开时触发；
		this._connect.on('close', this.closePort.bind(this)) // 端口关闭时触发；
		// this._connect.on('drain', () => {}) // 如果write方法返回false，则再次调用write方法时将触发该事件
		this._connect.on('error', error => {
			$log.error('serialPort is error ___________________________', error.message)
		}) //Se activa al enviar un error;
		this.openPort()
	}

	openPort() {
		if (this._connect) {
			this._connect.open(err => {
				if (err) {
					$log.error('open serial port error:', err.message)
				}
			})
		}
	}

	close() {
		if (this._connect) {
			this._connect.close(err => {
				if (err) {
					$log.error('close serial port error:', err.message)
				}
			})
		}
	}
	on(...params) {
		if (this._client) {
			return this._client.on(...params)
		}
	}

	// Obtener información del USB
	onConnected() {
		$log.info('serialPort is opened ___________________________')
		this._status = STATUS.OPENED
		if (this._connect) {
			const data = getUsbInfoMsg()
			this.resendData(data)
			this.sendHeartBeat()
		}
	}

	closePort() {
		if (this._connect != null) {
			//close OpenPort
			if (this._timer) {
				$log.info('serialPort is closePort ___________________________')
				clearInterval(this._timer)
			}
			this.stopReSend()
			this.onClosed(this._path)
		}
	}

	stopReSend() {
		if (this._resendTimer) {
			$log.info('============stopReSend============')
			clearInterval(this._resendTimer)
			this._resendTimer = null
			this._stopResend = false
			this._timeout = 0
		}
	}

	resendData(data) {
		this.sendData(data)
		this._timeout += 1
		if (!this._stopResend) {
			this._resendTimer = setInterval(() => {
			// Temporizador de reenvío de datos, de manera predeterminada, reenvía una vez si no se recibe respuesta en 500 ms
				if (this._stopResend) {
					this.stopReSend()
				} else if (this._timeout > 2) {
					// Reenvío 3 veces pero no hay respuesta, dejo de reenviar y cierro el puerto serial
					this.stopReSend()
					this.close()
				} else if (this._resendTimer) {
					this.sendData(data)
					this._timeout += 1
				}
			}, SEND_MESSAGE_TIMEOUT)
		}
	}

	sendData(data) {
		$log.info('sendData====', data)
		this._connect._write(data, 'hex', err => {
			if (err) {
				$log.error('【serial】 sendData error====', err.message)
			}
		})
	}

	getInfos() {
		return this._infos
	}

	//Envía paquetes de latidos al puerto serie cada 30 segundos
	sendHeartBeat() {
		this._timer = setInterval(() => {
			if (this._connect !== null) {
				const info = getHeartBeatInfo()
				this._connect._write(info, 'hex', err => {
					if (err) {
						$log.error('【serial】sendHeartBeat error====', err.message)
					}
				})
			} else {
				//La excepción provocó que se desconectara la conexión
				this._timer && clearInterval(this._timer)
				this._timer = null
			}
		}, HEART_BEAT)
	}
}
