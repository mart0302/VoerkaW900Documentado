const fs = require('fs')
const extract = require('extract-zip')
const path = require('path')
const macaddress = require('macaddress')
const {
	CMD,
	WatchAddrStruct,
	MessagePackagesStruct,
	WatchFreqIdStruct,
	WatchRemenderStruct,
	WatchSetTimeStruct,
	WatchSendMessageStruct,
	WatchClearMessageStruct,
	LauncherDataStruct,
	LauncherFreqIdStruct,
	LauncherPackagesStruct,
	getHeader
} = require('./server/config/protocols')
const iconv = require('iconv-lite')
// 拷贝并解压
module.exports.copyAndUnzip = function (sourceFile, destFile, { onProgress, onError, onSuccess }) {
	fs.stat(sourceFile, function (err, stat) {
		const filesize = stat.size
		let bytesCopied = 0
		let unziped = false

		const readStream = fs.createReadStream(sourceFile)
		readStream.on('data', async function (buffer) {
			bytesCopied += buffer.length
			const porcentage = ((bytesCopied / filesize) * 100).toFixed(2)
			if (porcentage >= 100 && !unziped) {
				unziped = true
				// 解压缩
				await extract(destFile, { dir: path.dirname(destFile) })
				// 回调
				onProgress && onProgress(Number(porcentage))
				onSuccess && onSuccess()
			} else {
				onProgress && onProgress(Number(porcentage))
			}
		})
		readStream.on('end', function () {
			// onSuccess && onSuccess()
		})
		readStream.on('error', function (err) {
			onError && onError(err)
		})
		readStream.pipe(fs.createWriteStream(destFile))
	})
}

// 缓存
module.exports.useCache = function (fetch, { max = 200, life = 3 * 60 * 1000 } = {}) {
	// 缓存池
	const caches = {}

	// 清理缓存
	function cleanCache() {
		const hits = Object.entries(caches)
		const nowTime = Date.now()
		if (hits.length > max) {
			hits.forEach(item => {
				const [id, hit] = item
				if (hit.expired < nowTime) {
					delete caches[id]
				}
			})
		}
	}

	// 从缓存中获取
	async function get(id) {
		const hit = caches[id]
		if (!hit || hit.expired < Date.now()) {
			const value = await fetch(id)
			if (value) {
				caches[id] = { expired: Date.now() + life, value }
				return value
			} else {
				return null
			}
		} else {
			return hit.value
		}
	}

	// 查询设备
	return async id => {
		// 获取
		const value = await get(id)

		// 维护缓存
		cleanCache()

		return value
	}
}

// 获取序列号
module.exports.getSN = async function () {
	// 获取第一个（默认）网卡的mac作为序列号
	// 如果用户添加了网卡，只要不是拆掉原本的网卡就可以继续用
	const mac = await macaddress.one()
	return mac.replace(/\:/g, '')
}

// hex求和
function getSum(data) {
	let sum = 0
	Object.keys(data).forEach(i => {
		sum += data[i]
	})
	return sum
}
// 编码
module.exports.encodeMessage = function (data) {
	let { netId, sn, cmd, lan = '' } = data
	sn = [parseInt(sn.slice(0, 3)), parseInt(sn.slice(3, 6)), parseInt(sn.slice(6, 9)), parseInt(sn.slice(9, 12))]
	$log.info('encodeMessage======', CMD[cmd])
	let header = getHeader(netId, sn, CMD[cmd])
	let payload
	switch (cmd) {
		case 'SEND_MESSAGE':
			let { msgId, unicastAddr, messages } = data
			$log.info('SEND_MESSAGE+++++++++++++', msgId, unicastAddr, messages, lan.value.lan)
			payload = WatchSendMessageStruct.encode({
				header: 122, // 7A
				msgId, // 消息id
				addr: unicastAddr.split('.').map(i => parseInt(i)), // 手表的组地址(单播)[42, 254, 187, 61],
				cmd: CMD[cmd], // 指令
				message: lan.value.lan == 'zh' ? iconv.encode(messages, 'gbk') : iconv.encode(messages, 'Windows-1250') // 解决波兰文乱码问题
			})
			break
		case 'CLEAR_MESSAGE':
			payload = WatchClearMessageStruct.encode({
				header: 122, // 7A
				msgId: data.msgId, // 消息id
				addr: data.unicastAddr.split('.').map(i => parseInt(i)), // 手表的组地址(单播)
				cmd: CMD[cmd], // 指令
				message: [1, 0]
			})
			$log.info('CLEAR_MESSAGE++++++++++++++++++')
			break
		case 'UPDATE_FREQ_NET':
			let { frequency, currentId } = data
			frequency = parseInt((frequency * 1000000000) / 61035)
			frequency = frequency.toString(16)
			$log.info('UPDATE_FREQ_NET+++++++++++++', frequency)
			let frequencyId = [
				parseInt(frequency.slice(0, 2), 16),
				parseInt(frequency.slice(2, 4), 16),
				parseInt(frequency.slice(4, 6), 16),
				currentId
			]
			payload = WatchFreqIdStruct.encode({
				...header,
				length: 5,
				frequencyId,
				dataCheck: parseInt(getSum(frequencyId)) & 0xff
			})
			break
		case 'SET_ADDR':
			let { id, netAddr } = data
			let addr = netAddr + '.' + id
			addr = addr.split('.').map(i => parseInt(i))
			$log.info('SET_ADDR++++++++++')
			payload = WatchAddrStruct.encode({
				...header,
				length: addr.length + 1,
				addr,
				dataCheck: parseInt(getSum(addr)) & 0xff
			})
			break
		case 'SET_TIME':
			let year = new Date().getFullYear()
			let yearHeight = parseInt(year.toString().substring(0, 2))
			let yearLow = parseInt(year.toString().substring(2, 4))
			let month = new Date().getMonth() + 1
			let day = new Date().getDate()
			let hour = new Date().getHours()
			let minute = new Date().getMinutes()
			let second = new Date().getSeconds()
			let week = new Date().getDay() - 1
			let time = [yearHeight, yearLow, month, day, hour, minute, second, week]
			payload = WatchSetTimeStruct.encode({
				...header,
				length: 9,
				yearHeight,
				yearLow,
				month,
				day,
				hour,
				minute,
				second,
				week,
				dataCheck: parseInt(getSum(time)) & 0xff
			})
			break
		case 'SET_REMENDER_TIME':
			let { brightTime, reminder } = data
			$log.info('SET_REMENDER_TIME++++++++++')
			payload = WatchRemenderStruct.encode({
				...header,
				length: 2,
				reminder: [brightTime, reminder]
			})
			break
		case 'WRITE_LAUNCHER':
			$log.info('WRITE_LAUNCHER++++++++++', data.frequency)
			let freq = Math.round((data.frequency * 1000000000) / 61035)
			$log.info('WRITE_LAUNCHER freq++++++++++', freq)
			freq = freq.toString(16)
			freq = [parseInt(freq.slice(0, 2), 16), parseInt(freq.slice(2, 4), 16), parseInt(freq.slice(4, 6), 16)]
			$log.info('WRITE_LAUNCHER freq++++++++++', freq)
			let dataMessage = LauncherDataStruct.encode({
				rate: 4,
				check: 0,
				frequency: freq,
				factor: 11,
				mode: 1,
				bandwidth: 7,
				moduleH: 0,
				moduleL: 2,
				netId: data.netId,
				power: 7,
				breathCycle: 0,
				breathTime: 4
			})
			payload = LauncherFreqIdStruct.encode({
				header: [175, 175, 0, 0, 175],
				direction: 128,
				cmd: CMD[cmd],
				data: dataMessage
			})
			break
		case 'READ_LAUNCHER':
			$log.info('READ_LAUNCHER++++++++++')
			let dataMsg = LauncherDataStruct.encode({
				rate: 0,
				check: 0,
				frequency: [0, 0, 0],
				factor: 0,
				mode: 0,
				bandwidth: 0,
				moduleH: 0,
				moduleL: 0,
				netId: 0,
				power: 0,
				breathCycle: 0,
				breathTime: 0
			})
			payload = LauncherFreqIdStruct.encode({
				header: [175, 175, 0, 0, 175],
				direction: 128,
				cmd: CMD[cmd],
				data: dataMsg
			})
			break
	}
	let message
	if (cmd === 'WRITE_LAUNCHER' || cmd === 'READ_LAUNCHER') {
		message = LauncherPackagesStruct.encode({
			payload,
			checkSum: parseInt(getSum(payload)) & 0xff,
			tail: [13, 10]
		})
	} else {
		message = MessagePackagesStruct.encode({
			payload,
			checkSum: parseInt(getSum(payload)) & 0xff // 取低位
		})
	}
	$log.info('encode+++++++++++++', message.toString('hex').slice(2).toUpperCase())
	// payload头部有一位payload的长度，需去掉
	return message.toString('hex').slice(2).toUpperCase()
}

// 解码
module.exports.decodeMessage = function (data) {
	let buffer = toBuffer(data)
	$log.info('decodeMessage  data is ======', buffer)
	let { payload } = LauncherPackagesStruct.decode(buffer)
	let messages = LauncherFreqIdStruct.decode(payload)
	messages = LauncherDataStruct.decode(messages.data)
	let { frequency, netId } = messages
	// buffer转十六进制
	frequency = buf_hex(frequency)
	//   频率转码计算公式：
	// DEC-HEX：DEC 频率值*10^9/61035 所得结果的整数位转换成 HEX
	// 比如：434MHz，434*1000000000/61035=7110674，转成 HEX 是 6C0812；
	// HEX-DEC：HEX 码转成 DEC 码所得结果*61035/10^9
	// 比如：6D0000 转成十进制是 7143424， 7143424*61035/10^9≈433.00MHz；
	frequency = Math.round((parseInt(frequency, 16) * 61035) / 1000000000)
	$log.info('decodeMessage  frequency is ======', frequency)
	return { frequency, netId }
}

function toBuffer(data) {
	let hex_array = [data.length - 3] // 22是包头长度
	for (i = 0; i < data.length; i++) {
		if ((i + 1) % 2 == 0) {
			hex_array.push(parseInt(data[i - 1] + data[i], 16))
		}
	}
	let uarray = new Uint8Array(hex_array)
	return Buffer.from(uarray)
}

// buffer转十六进制字符串
function buf_hex(buf) {
	let hexStr = ''
	buf.forEach(b => {
		let hex = b.toString(16)
		let zero = '00'
		let tmp = 2 - hex.length
		hexStr += zero.substr(0, tmp) + hex
	})
	return hexStr
}
module.exports.getSum = getSum

module.exports.buf_hex = buf_hex
