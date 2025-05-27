const Struct = require('varstruct')
const {
	SendMessageStruct,
	UsbLsettingStruct,
	MessageStruct,
	CallerMessageStruct,
	CMD
} = require('../../../server/config/protocols')
const { buf_hex, getSum } = require('../../../utils.js')

module.exports.getHeartBeatInfo = () => {
	// '550102030400000002010102'
	let getInfo = SendMessageStruct.encode({
		header: 85, //头部
		sn: '1234', //随便写的sn
		cmd: 0, //命令
		sid: 0, //会话标识符
		flags: 0, //会话标识符
		payload: Buffer.from([1, 1]), //呼叫器传来的数据
		checksum: 2 //校验和=data所有字节累加取低位字节
	})
	return getInfo // buf_hex(getInfo)
}

// 应答消息
module.exports.getReplyInfo = () => {
	// '550102030400000002010102'
	let getInfo = SendMessageStruct.encode({
		header: 85, //头部
		sn: '1234', //随便写的sn
		cmd: 0, //命令
		sid: 0, //会话标识符
		flags: 0, //会话标识符
		payload: Buffer.from([1]), //呼叫器传来的数据
		checksum: 1 //校验和=data所有字节累加取低位字节
	})
	return getInfo // buf_hex(getInfo)
}

// 获取USB信息消息体
/**返回字符串 */
module.exports.getUsbInfoMsg = () => {
	let getInfo = SendMessageStruct.encode({
		header: 85, //头部
		sn: '1234', //随便写的sn
		cmd: 6, //命令
		sid: 0, //会话标识符
		flags: 0, //会话标识符
		payload: Buffer.from([1]), //呼叫器传来的数据
		checksum: 1 //校验和=data所有字节累加取低位字节
	})
	return getInfo // buf_hex(getInfo)
}

function hex2buf(str) {
	let hex_array = []
	for (let i = 0; i < str.length; i++) {
		if ((i + 1) % 2 == 0) {
			hex_array.push(parseInt(str[i - 1] + str[i], 16))
		}
	}
	let uarray = new Uint8Array(hex_array)
	let buf = Buffer.from(uarray)
	return buf
}

module.exports.decodeMessage = function (msg) {
	// 测试代码
	// let str = buf_hex(buf)
	// $log.info('decodeMessage===', str)
	// if (str == '01') {
	// 	// str =
	// 	// 	'55526d35140000006300534e3d2c4d6f64656c3d4c2c535f56657273696f6e3d56312e352e372820263039303731353036292c485f56657273696f6e3d56312e302c436f6d6d4d6f64653d312c525f4368616e6e656c3d312c535f4368616e6e656c3d312c506f7765723d37d6'
	// 	// SN=,Model=W300R,S_Version=V1.5.7(09071506),H_Version=V1.0,CommMode=1,Check=0
	// 	str =
	// 		'55526d35140000004d00534e3d2c4d6f64656c3d57333030522c535f56657273696f6e3d56312e352e37283039303731353036292c485f56657273696f6e3d56312e302c436f6d6d4d6f64653d312c436865636b3d30AE'
	// } else if (str == '02') {
	// 	// str =
	// 	// 	'55526d35150000004300534e3d2c4d6f64656c3d592c535f56657273696f6e3d56312e352e372820263039303731353036292c485f56657273696f6e3d56312e302c436f6d6d4d6f64653d3135'
	// 	// SN=,Model=W300L,S_Version=V1.5.7(09071506),H_Version=V1.0,CommMode=1,R_Channel=1,S_Channel=1,Power=7,Check=0
	// 	str =
	// 		'55526d35150000006d00534e3d2c4d6f64656c3d573330304c2c535f56657273696f6e3d56312e352e37283039303731353036292c485f56657273696f6e3d56312e302c436f6d6d4d6f64653d312c525f4368616e6e656c3d312c535f4368616e6e656c3d312c506f7765723d372c436865636b3d305e'
	// } else if (str == '03') {
	// 	str = '55526D3514040000050b0a1000082d'
	// } else if (str == '04') {
	// 	str = '5531323334000000010101'
	// } else if (str == '05') {
	// 	str =
	// 		'558908CAE300000056004D6F64656C3D57333030522C535F56657273696F6E3D56312E302C485F56657273696F6E3D56312E302C436F6D6D4D6F64653D332C525F4368616E6E656C3D312C535F4368616E6E656C3D312C506F7765723D3720AE'
	// } else if (str == '06') {
	// 	str =
	// 		'558908CAE30000005A00534E3D2C4D6F64656C3D573330304C2C535F56657273696F6E3D56312E302C485F56657273696F6E3D56312E302C436F6D6D4D6F64653D332C525F4368616E6E656C3D312C535F4368616E6E656C3D312C506F7765723D3720B2'
	// } else if (str == '07') {
	// 	str = '558908CAE3000000010101'
	// } else if (str == '08') {
	// 	str = '558908CAE3040000054F31BC8FCA31'
	// } else if (str == '09') {
	// 	str =
	// 		'558908CAE30000006200534E3D2C4D6F64656C3D573330304C2C535F56657273696F6E3D56312E302C485F56657273696F6E3D56312E302C436F6D6D4D6F64653D332C525F4368616E6E656C3D312C535F4368616E6E656C3D312C506F7765723D372C436865636B3D302020'
	// }

	// const buffer = buf // hex2buf(str)
	//解析数据
	let message = {}
	if (msg.cmd in CMD) {
		if (msg.cmd === 0) {
			// 设备信息
			let decodeString = Struct([
				{ name: 'status', type: Struct.Byte },
				{ name: 'data', type: Struct.String(msg.payload.length - 1) } //要提供长度
			])
			message = decodeString.decode(msg.payload)
		} else if (msg.cmd === 4) {
			message = CallerMessageStruct.decode(msg.payload)
			// 判断键值是否有效
			// [1,2,4,8,9]为有效键值
			// 对方一直发一个键值为 5或者F(十六进制)的数据，目前为止，我们公司只使用了1、2、4、8、9
			// 屏蔽掉无效键值
			// message.key = Object.keys({ ...presetScenes[0]?.keys, ...EXTRAL_DEVICE_KEY_MAP })[Math.floor(Math.random()*15)]
			// if (msg.cmd === 4 && message && message.key) {
			// 	message = null
			// }
		}
		return { message, originMsg: msg }
	}
}

function str_pad(num) {
	let hex = num.toString(16)
	let zero = '00'
	let tmp = 2 - hex.length
	return zero.substr(0, tmp) + hex
}

/**配置433模块 */
/**返回字符串 */
module.exports.getW300RUsbSettings = function (option = {}) {
	let settings = SendMessageStruct.encode({
		header: 85, //头部
		sn: '1234', //随便写的sn
		cmd: 20, //命令
		sid: 0, //会话标识符
		flags: 0, //会话标识符
		payload: Buffer.from([option.commMode, option.check]), //呼叫器传来的数据
		checksum: option.commMode + option.check //校验和=data所有字节累加取低位字节
	})
	return settings
}

/**配置Lora模块 */
/**返回字符串 */
module.exports.getW300LUsbSettings = function (option = {}) {
	const { commMode, rChannel, sChannel, power, check = false } = option
	if (!commMode || !rChannel || !sChannel || !power) return ''
	let payload = UsbLsettingStruct.encode({
		commMode, // 通讯模式
		rChannel, // 接收信道
		sChannel, // 转发信道
		power, // 发射功率
		check
	})
	let checksum = parseInt(getSum(payload)) & 0xff
	let settings = SendMessageStruct.encode({
		header: 85, //头部
		sn: '1234', //随便写的sn
		cmd: 21, //命令
		sid: 0, //会话标识符
		flags: 0, //会话标识符
		payload, //呼叫器传来的数据
		checksum //校验和=data所有字节累加取低位字节
	})
	return settings
}

module.exports.str_pad = str_pad

module.exports.hex2buf = hex2buf
