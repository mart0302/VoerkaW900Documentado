// 协议
const Struct = require('varstruct')

exports.CMD = {
	0: 0,
	4: 4,
	SEND_MESSAGE: 224, // E0=发送消息；
	UPDATE_FREQ_NET: 226, // E2=用本机地址修改手表信道；
	SET_ADDR: 227, // E3=用本机地址录入组地址；
	SET_TIME: 228, // E4=用本机地址、广播地址（FF FF FF FF）修改手表时钟；
	CHECK_ONLINE: 229, // E5=用手表自带的“本机地址”查询手表是否开机；
	CLEAR_MESSAGE: 230, // E6=用本机地址、组地址或广播地址（FF FF FF FF）无线清除手表上的历史消息记录；
	SET_REMENDER_TIME: 231, // E7=用本机地址、组地址或广播地址（FF FF FF FF）无线设置信息提醒时长；
	WRITE_LAUNCHER: 1, // 往发射器写数据,如配置网络号和频率
	READ_LAUNCHER: 2 // 往发射器读数据,获取网络号和频率
}

// 消息头部
exports.MessagePackagesStruct = Struct([
	{ name: 'payload', type: Struct.VarBuffer(Struct.Byte) }, // 数据
	{ name: 'checkSum', type: Struct.Byte } //校验和=data所有字节累加取低位字节
])

// 给手表发送消息 指令: E0
exports.WatchSendMessageStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'msgId', type: Struct.Byte }, // 0~255
	{ name: 'addr', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'message', type: Struct.VarBuffer(Struct.Byte) }
])

// 给手表清空消息 指令:E6
exports.WatchClearMessageStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'msgId', type: Struct.Byte }, // 0~255
	{ name: 'addr', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'message', type: Struct.Array(2, Struct.Byte) }
])

// 修改手表频率值和网络 ID 号  指令:E2
exports.WatchFreqIdStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'netId', type: Struct.Byte },
	{ name: 'sn', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'length', type: Struct.Byte },
	{ name: 'frequencyId', type: Struct.Array(4, Struct.Byte) },
	{ name: 'dataCheck', type: Struct.Byte }
])

// 配置组地址  指令:E3
exports.WatchAddrStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'netId', type: Struct.Byte },
	{ name: 'sn', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'length', type: Struct.Byte },
	{ name: 'addr', type: Struct.Array(5, Struct.Byte) },
	{ name: 'dataCheck', type: Struct.Byte }
])

// 设置手表时间  指令:E4
exports.WatchSetTimeStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'netId', type: Struct.Byte },
	{ name: 'sn', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'length', type: Struct.Byte },
	{ name: 'yearHeight', type: Struct.Byte },
	{ name: 'yearLow', type: Struct.Byte },
	{ name: 'month', type: Struct.Byte },
	{ name: 'day', type: Struct.Byte },
	{ name: 'hour', type: Struct.Byte },
	{ name: 'minute', type: Struct.Byte },
	{ name: 'second', type: Struct.Byte },
	{ name: 'week', type: Struct.Byte },
	{ name: 'dataCheck', type: Struct.Byte }
])

// 配置亮屏和蜂鸣时间 指令：E7
exports.WatchRemenderStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'netId', type: Struct.Byte },
	{ name: 'sn', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'length', type: Struct.Byte },
	{ name: 'reminder', type: Struct.Array(2, Struct.Byte) }
])

// 发射器头部
exports.LauncherPackagesStruct = Struct([
	{ name: 'payload', type: Struct.VarBuffer(Struct.Byte) }, // 数据
	{ name: 'checkSum', type: Struct.Byte }, //校验和=data所有字节累加取低位字节
	{ name: 'tail', type: Struct.Array(2, Struct.Byte) } // 包尾固定 0D 0A
])

// 发射器数据
exports.LauncherDataStruct = Struct([
	{ name: 'rate', type: Struct.Byte }, // 串口速率：01~07:1200/2400/4800/9600/19200/38400/57600bps；
	{ name: 'check', type: Struct.Byte }, //串口校验：00=无校验，01=奇校验，02=偶校验；固定00
	{ name: 'frequency', type: Struct.Array(3, Struct.Byte) }, // 频率*10^9/61035结果转换成HEX。如433MHz：433*10^9/61035=7094290，即6C4012
	{ name: 'factor', type: Struct.Byte }, // 扩频因子：07=128，08=256，09=512，0A=1024，0B=2048，0C=4096；不可更改，固定2048
	{ name: 'mode', type: Struct.Byte }, // 工作模式：00=标准，01=中心，02=节点；不可更改，固定01=中心
	{ name: 'bandwidth', type: Struct.Byte }, // 扩频带宽：06=62.5，07=125，08=256，09=512；不可更改，固定07=125
	{ name: 'moduleH', type: Struct.Byte }, // 模块ID高位；固定00
	{ name: 'moduleL', type: Struct.Byte }, // 模块ID低位  固定02
	{ name: 'netId', type: Struct.Byte }, // 网络Id
	{ name: 'power', type: Struct.Byte }, // 发送功率：01=4，02=7，03=10，04=13，05=14，06=17，07=20 （dBm）固定 02=7
	{ name: 'breathCycle', type: Struct.Byte }, // 呼吸周期：00=2S，01=4S，02=6S，03=8S，04=10S   固定 00=2S
	{ name: 'breathTime', type: Struct.Byte } // 呼吸时间：00=2mS，01=4 mS，02=8 mS，03=16 mS，04=32 mS，05=64mS； 固定 04=32 mS
])

// 配置发射器频率值和网络 ID 号  指令:1
exports.LauncherFreqIdStruct = Struct([
	{ name: 'header', type: Struct.Array(5, Struct.Byte) }, // 固定AF AF 00 00 AF
	{ name: 'direction', type: Struct.Byte }, // 数据方向，发码：80,回码：00
	{ name: 'cmd', type: Struct.Byte }, // 指令识别码， 写数据: 1, 读数据：2
	{ name: 'data', type: Struct.VarBuffer(Struct.Byte) }
	// { name: 'dataCheck', type: Struct.Byte }
])

exports.getHeader = (netId, sn, cmd) => {
	return {
		header: 122, // 7A
		netId, // 手表的网络id
		sn, // 手表的sn
		cmd // 指令
	}
}

//要发送的消息结构
exports.SendMessageStruct = Struct([
	{ name: 'header', type: Struct.Byte }, //头部
	{ name: 'sn', type: Struct.String(4) }, //网关sn
	{ name: 'cmd', type: Struct.Byte }, //命令
	{ name: 'sid', type: Struct.Byte }, //会话标识符
	{ name: 'flags', type: Struct.Byte }, //会话标识符
	// { name: 'length', type: Struct.Byte},//消息数据长度,encode会自动产生
	{ name: 'payload', type: Struct.VarBuffer(Struct.Byte) }, //呼叫器传来的数据
	{ name: 'checksum', type: Struct.Byte } //校验和=data所有字节累加取低位字节
])

//接收到的消息
exports.MessageStruct = Struct([
	{ name: 'header', type: Struct.Byte }, //头部,由于split自动删除
	{ name: 'sn1', type: Struct.Byte }, //命令
	{ name: 'sn2', type: Struct.Byte }, //命令
	{ name: 'sn3', type: Struct.Byte }, //命令
	{ name: 'sn4', type: Struct.Byte }, //命令
	{ name: 'cmd', type: Struct.Byte }, //命令
	{ name: 'sid', type: Struct.Byte }, //会话标识符
	{ name: 'flags', type: Struct.Byte }, //会话标识符
	// { name: 'length', type: Struct.Byte},//消息数据长度，解析自动得出数据长度
	{ name: 'payload', type: Struct.VarBuffer(Struct.Byte) }, //呼叫器传来的数据
	{ name: 'checksum', type: Struct.Byte } //校验和=data所有字节累加取低位字节
])

/*****Lora类型 USB模块配置 */
exports.UsbLsettingStruct = Struct([
	{ name: 'commMode', type: Struct.Byte }, // 通讯模式
	{ name: 'rChannel', type: Struct.Byte }, // 接收信道
	{ name: 'sChannel', type: Struct.Byte }, // 转发信道
	{ name: 'power', type: Struct.Byte }, // 发射功率
	{ name: 'check', type: Struct.Byte } // 发射功率
])

// 呼叫消息协议

exports.CallerMessageStruct = Struct([
	//
	{ name: 'sn1', type: Struct.Byte }, //呼叫器
	{ name: 'sn2', type: Struct.Byte }, //呼叫器
	{ name: 'sn3', type: Struct.Byte }, //呼叫器  三个相加为呼叫器sn
	{ name: 'flags', type: Struct.Byte }, //扩展标识,从低位到高位
	{ name: 'key', type: Struct.Byte } //按键值
])
