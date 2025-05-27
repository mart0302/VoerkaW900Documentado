// 安装方法 https://zhuanlan.zhihu.com/p/436672864
// 使用方法 https://blog.csdn.net/Naisu_kun/article/details/121492829
//获取serialport实例
const { SerialPort } = require('serialport')

const { mergeDeepRight } = require('ramda')
const { getUsbInfoMsg, getHeartBeatInfo } = require('../server/config/seriportMessager/getMessage')
/**
 * 串口类，用于串口通讯
 * 给串口发消息时，每隔500ms发送一次，如果3次超时没回，则关闭串口。这样做1可以避免串口未能及时回复消息而导致串口不可用问题；2可以避免占用别人的串口。
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
		// 所有存储串口实例
		this._stopResend = false // 控制是否重发消息动作
		this._timeout = 0 // 发送消息超时次数
		this._connects = {}
		this._path = options.path // 串口名称
		this._infos = {}
		this.sn = '' // 串口对应的USB序列号
		this._status = STATUS.INIT
		this.onClosed = onClosed
		this._options = mergeDeepRight(
			{
				autoOpen: false, // 自动打开端口
				baudRate: 115200, // 波特率
				dataBits: 8, // 数据位
				parity: 'none', // 校验
				stopBits: 1, // 停止位，可选1、2
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
		}) // 发送错误时触发；
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

	// 获取USB信息
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
				// 重发数据定时器,默认500ms没回就重发一次
				if (this._stopResend) {
					this.stopReSend()
				} else if (this._timeout > 2) {
					//重发3次都没回，停止重发并且关闭串口
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

	// 每隔30s给串口发送心跳包
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
				// 异常导致连接断开
				this._timer && clearInterval(this._timer)
				this._timer = null
			}
		}, HEART_BEAT)
	}
}
