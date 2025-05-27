// roles de usuario
const ADMIN = 'admin'
const USER = 'user'
const ROLES = [ADMIN, USER]

// rutas de usuario
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
// tipos de dispositivo
exports.DEVICE_TYPES = 'device_types'
// red seleccionada actualmente
// networkd = { host, domain }
// host se usa para:
// 1. dirección de conexión mqtt principal que se configura al autenticar el dispositivo
// 2. dirección de descarga del paquete de actualización para el dispositivo
// domain se usa para: comunicación mqtt
exports.NETWORK = 'network'

// configuración de llamadas (tiempo de espera de transacción, tiempo de espera de alarma)
exports.CALL_SETTINGS = 'call_settings'

/** relacionado con voerka */
// tipos de evento
const EVENT_TYPE = {
	EVENT: 'event',
	ALARM: 'alarm'
}
exports.EVENT_TYPE = EVENT_TYPE

// tipos de recurso
// mapeo de teclas
exports.RES_TYPE_KEYMAP = 'keyMap'

// tipos de tecla
exports.KEYMAP_TYPE = {
	CANCEL: 'cancel',
	CALL: 'call',
	ALARM: 'alarm'
}

// dispositivo
exports.RES_TYPE_DEVICE = 'device'
// usuario
exports.RES_TYPE_USER = 'user'

// tipos de dispositivos que pueden tener múltiples vinculaciones, temporalmente codificado, se cambiará a configurable más adelante
exports.MULTIPLE_BIND_DEVICES = {
	lora_watch: { mode: '', counts: 10, method: 'brunch' },
	nx1_wlcall_gateway: { mode: 'transfer', counts: 0, method: 'all' }
}

// modelo de dispositivo USB, usado para filtrar en la lista de dispositivos serie
exports.USE_DEVICE = 'usb'

// tipos de dispositivo
exports.DEVICES_TYPE = {
	LORA: 'W300L', // módulo LORA USB
	GENERAL: 'W300R', // W300R USB representa 315 o 433
	JEIXUN: 'W300J', // módulo Jeixun USB
	WLCALLER: 'wlcaller' // tipo de dispositivo llamador
}

// atributos predeterminados del dispositivo
exports.DEVICE_ATTRS = {
	nx1led: {
		animate: 7, // modo de visualización, 7 por defecto muestra inmediatamente, 0-sin efectos especiales, 1-desplazamiento izquierda, 2-desplazamiento derecha, 3-desplazamiento arriba, 4-desplazamiento abajo
		speed: 20, // cambia la velocidad de movimiento arriba/abajo/izquierda/derecha, valor predeterminado 20 segundos
		showDuration: 5, // intervalo de permanencia (tiempo de espera después de mostrar antes de enviar el siguiente), unidad en segundos
		automaticpinout: 0, // tiempo de borrado, 0 significa no borrar, unidad en segundos
		speak: false, // TTS difusión de voz habilitada true
		volume: 30, // volumen de alerta
		chordName: 1, // nombre del tono de timbre
		// los siguientes son atributos que necesita mostrar w900
		standbyDisplay: 1, // modo de visualización de pantalla predeterminado
		standbytext: '', // texto de pantalla predeterminado
		soundReminder: false, // recordatorio de sonido
		reminderMethod: 'chord' // método de recordatorio
	}
}

// estados de notificación
exports.NOTICE_STATUS = {
	DRAFT: 'draft',
	SENT: 'sent',
	UNREAD: 'unread',
	READ: 'read'
}

// tipo de envío de voz de intercomunicador; 0: todo, 1: mensaje de llamada, 2: mensaje de notificación
exports.INTERCOM_PUSH_TYPE = {
	ALL: '0',
	CALL: '1',
	NOTICE: '2'
}
