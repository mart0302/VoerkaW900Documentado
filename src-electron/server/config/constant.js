// 用户角色
const ADMIN = 'admin'
const USER = 'user'
const ROLES = [ADMIN, USER]

// 用户路由
const ROUTES = {
	HOME: '/',
	Login: '/login',
	Notice: '/notice',
	Device: '/device',
	DeviceDiscover: '/device/deviceDiscover',
	DeviceManage: '/device/manage',
	SerialPort: '/device/serialPort',
	Record: '/record',
	CallEvent: '/record/callEvent',
	DeviceEvent: '/record/deviceEvent',
	Alarm: '/record/alarm',
	Analytics: '/analytics',
	Resource: '/resource',
	Department: '/resource/department',
	Position: '/resource/position',
	User: '/resource/user',
	Shift: '/resource/shift',
	Settings: '/settings',
	License: '/license'
}

exports.ADMIN = ADMIN
exports.USER = USER
exports.ROLES = ROLES
exports.ROUTES = ROUTES

// settings - keys
// 设备类型
exports.DEVICE_TYPES = 'device_types'
// 当前选择的网络
// networkd = { host, domain }
// host 作用于：
// 1. 设备认证时，给设备设置的主mqtt连接地址
// 2. 设备升级时，给设备的升级包下载地址
// domain 作用于： mqtt通信
exports.NETWORK = 'network'

// 呼叫配置（事务超时、告警超时）
exports.CALL_SETTINGS = 'call_settings'

/** voerka相关 */
// 事件类型
const EVENT_TYPE = {
	EVENT: 'event',
	ALARM: 'alarm'
}
exports.EVENT_TYPE = EVENT_TYPE

// 资源类型
// 按键映射
exports.RES_TYPE_KEYMAP = 'keyMap'

// 按键的类型
exports.KEYMAP_TYPE = {
	CANCEL: 'cancel',
	CALL: 'call',
	ALARM: 'alarm'
}

// 设备
exports.RES_TYPE_DEVICE = 'device'
// 用户
exports.RES_TYPE_USER = 'user'

// 可多绑设备类型,暂时硬编码，后期再改成可配置
exports.MULTIPLE_BIND_DEVICES = {
	lora_watch: { mode: '', counts: 10, method: 'brunch' },
	nx1_wlcall_gateway: { mode: 'transfer', counts: 0, method: 'all' }
}

// Usb设备model，用于过滤在串口设备列表显示
exports.USE_DEVICE = 'usb'

// 设备类型
exports.DEVICES_TYPE = {
	LORA: 'W300L', // USB的LORA模块
	GENERAL: 'W300R', // USB的W300R表示315或者433
	JEIXUN: 'W300J', // USB的捷讯模块
	WLCALLER: 'wlcaller' // 呼叫器设备类型
}

// 设备默认属性
exports.DEVICE_ATTRS = {
	nx1led: {
		animate: 7, // 显示的方式 默认的7立即打出  0—没有特效显示  1-左移显示 2-右移显示  3-上移显示 4-下移显示
		speed: 20, // 改变上下左右移动速度 默认的值是20秒
		showDuration: 5, // 停留间隔（发送显示后停留一段时间发送下一条） 时间单位是秒
		automaticpinout: 0, // 销号时间，0表示表示不销号，时间单位是秒
		speak: false, //  DISPLAYER.voiceBroadCast,	//TTS语音播报启用 true
		volume: 30, // 提醒音量
		chordName: 1, // 和弦铃声名称
		// 以下为w900需要显示的属性
		standbyDisplay: 1, // 默认屏显示模式
		standbytext: '', // 默认屏文本
		soundReminder: false, // 声音提醒
		reminderMethod: 'chord' // 提醒方式
	}
}

// 通知状态
exports.NOTICE_STATUS = {
	DRAFT: 'draft',
	SENT: 'sent',
	UNREAD: 'unread',
	READ: 'read'
}

// 对讲语音推送类型；0：全部，1： 呼叫消息， 2：通知消息
exports.INTERCOM_PUSH_TYPE = {
	ALL: '0',
	CALL: '1',
	NOTICE: '2'
}
