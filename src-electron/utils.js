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
// Copiar y descomprimir
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
				// Descomprimir
				await extract(destFile, { dir: path.dirname(destFile) })
				// Callback (función de retorno)
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

// Caché
module.exports.useCache = function (fetch, { max = 200, life = 3 * 60 * 1000 } = {}) {
	//  Pool de caché (almacenamiento temporal de datos en memoria)
	const caches = {}

	// Limpiar el caché
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

	// Obtener desde el caché
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

	// Consultar dispositivo
	return async id => {
		// Obtener (los datos)
		const value = await get(id)

		// Mantener el caché (limpiar si es necesario)
		cleanCache()

		return value
	}
}

// Obtener número de serie
module.exports.getSN = async function () {
	// Usar la dirección MAC de la primera (predeterminada) tarjeta de red como número de serie
	// Si el usuario agrega otra tarjeta de red, mientras no quite la original, podrá seguir usando el mismo número de serie
	const mac = await macaddress.one()
	return mac.replace(/\:/g, '')
}

// Calcular la suma de los valores (se asume que son bytes u otros números)
function getSum(data) {
	let sum = 0
	Object.keys(data).forEach(i => {
		sum += data[i]
	})
	return sum
}

// Codificar
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
				msgId, // ID del mensaje
				addr: unicastAddr.split('.').map(i => parseInt(i)), // Dirección unicast del reloj, por ejemplo [42, 254, 187, 61]
				cmd: CMD[cmd], // Comando
				message: lan.value.lan == 'zh' ? iconv.encode(messages, 'gbk') : iconv.encode(messages, 'Windows-1250') // 解决波兰文乱码问题
			})
			break
		case 'CLEAR_MESSAGE':
			payload = WatchClearMessageStruct.encode({
				header: 122, // 7A
				msgId: data.msgId, // ID del mensaje
				addr: data.unicastAddr.split('.').map(i => parseInt(i)), // Dirección unicast del reloj
				cmd: CMD[cmd],  // Comando
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
			checkSum: parseInt(getSum(payload)) & 0xff // Tomar solo los últimos 8 bits (baja)
		})
	}
	$log.info('encode+++++++++++++', message.toString('hex').slice(2).toUpperCase())
		// El encabezado del payload incluye un byte de longitud, se debe eliminar
	return message.toString('hex').slice(2).toUpperCase()
}

// Decodificar
module.exports.decodeMessage = function (data) {
	let buffer = toBuffer(data)
	$log.info('decodeMessage  data is ======', buffer)
	let { payload } = LauncherPackagesStruct.decode(buffer)
	let messages = LauncherFreqIdStruct.decode(payload)
	messages = LauncherDataStruct.decode(messages.data)
	let { frequency, netId } = messages
	// Convertir el buffer a hexadecimal
	frequency = buf_hex(frequency)
	// Fórmulas para la conversión de frecuencia:
	// DEC a HEX: frecuencia en DEC * 10^9 / 61035; el resultado entero se convierte a HEX
	// Ejemplo: 434MHz, 434*1000000000/61035 = 7110674, en HEX es 6C0812;
	// HEX a DEC: convertir el código HEX a DEC, luego multiplicar por 61035 / 10^9
	// Ejemplo: 6D0000 → decimal = 7143424; 7143424*61035 / 10^9 ≈ 433.00 MHz;
	frequency = Math.round((parseInt(frequency, 16) * 61035) / 1000000000)
	$log.info('decodeMessage  frequency is ======', frequency)
	return { frequency, netId }
}

function toBuffer(data) {
	let hex_array = [data.length - 3] 	// Crear un array hexadecimal inicializado con la longitud del dato menos 3 (22 es la longitud del encabezado del paquete)
	for (i = 0; i < data.length; i++) {
		if ((i + 1) % 2 == 0) {
			hex_array.push(parseInt(data[i - 1] + data[i], 16))
		}
	}
	// Crear un Uint8Array a partir del array de valores hexadecimales
	let uarray = new Uint8Array(hex_array)
	// Convertir el Uint8Array a un Buffer de Node.js y devolverlo
	return Buffer.from(uarray)
}

// Convierte un buffer a una cadena hexadecimal
function buf_hex(buf) {
	let hexStr = ''
	buf.forEach(b => {
		let hex = b.toString(16)
		let zero = '00'
		let tmp = 2 - hex.length
		// Añade ceros a la izquierda si el valor hexadecimal tiene solo 1 dígito
		hexStr += zero.substr(0, tmp) + hex
	})
	return hexStr
}
module.exports.getSum = getSum

module.exports.buf_hex = buf_hex
