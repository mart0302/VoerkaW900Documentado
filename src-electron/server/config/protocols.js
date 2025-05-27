// protocolos
const Struct = require('varstruct')

exports.CMD = {
	0: 0,
	4: 4,
	SEND_MESSAGE: 224, // E0=enviar mensaje
	UPDATE_FREQ_NET: 226, // E2=modificar canal del reloj usando dirección local
	SET_ADDR: 227, // E3=registrar dirección de grupo usando dirección local
	SET_TIME: 228, // E4=modificar reloj del dispositivo usando dirección local o dirección de difusión (FF FF FF FF)
	CHECK_ONLINE: 229, // E5=consultar si el reloj está encendido usando su "dirección local"
	CLEAR_MESSAGE: 230, // E6=borrar historial de mensajes del reloj de forma inalámbrica usando dirección local, de grupo o difusión (FF FF FF FF)
	SET_REMENDER_TIME: 231, // E7=configurar duración de recordatorio de mensajes de forma inalámbrica usando dirección local, de grupo o difusión (FF FF FF FF)
	WRITE_LAUNCHER: 1, // escribir datos al emisor, como configuración de número de red y frecuencia
	READ_LAUNCHER: 2 // leer datos del emisor, obtener número de red y frecuencia
}

// cabecera del mensaje
exports.MessagePackagesStruct = Struct([
	{ name: 'payload', type: Struct.VarBuffer(Struct.Byte) }, // datos
	{ name: 'checkSum', type: Struct.Byte } // suma de verificación = suma de todos los bytes de datos tomando el byte menos significativo
])

// enviar mensaje al reloj, comando: E0
exports.WatchSendMessageStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'msgId', type: Struct.Byte }, // 0~255
	{ name: 'addr', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'message', type: Struct.VarBuffer(Struct.Byte) }
])

// borrar mensajes del reloj, comando: E6
exports.WatchClearMessageStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'msgId', type: Struct.Byte }, // 0~255
	{ name: 'addr', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'message', type: Struct.Array(2, Struct.Byte) }
])

// modificar valor de frecuencia y número de ID de red del reloj, comando: E2
exports.WatchFreqIdStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'netId', type: Struct.Byte },
	{ name: 'sn', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'length', type: Struct.Byte },
	{ name: 'frequencyId', type: Struct.Array(4, Struct.Byte) },
	{ name: 'dataCheck', type: Struct.Byte }
])

// configurar dirección de grupo, comando: E3
exports.WatchAddrStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'netId', type: Struct.Byte },
	{ name: 'sn', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'length', type: Struct.Byte },
	{ name: 'addr', type: Struct.Array(5, Struct.Byte) },
	{ name: 'dataCheck', type: Struct.Byte }
])

// configurar hora del reloj, comando: E4
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

// configurar tiempo de pantalla encendida y zumbador, comando: E7
exports.WatchRemenderStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // 0x55
	{ name: 'netId', type: Struct.Byte },
	{ name: 'sn', type: Struct.Array(4, Struct.Byte) },
	{ name: 'cmd', type: Struct.Byte },
	{ name: 'length', type: Struct.Byte },
	{ name: 'reminder', type: Struct.Array(2, Struct.Byte) }
])

// cabecera del emisor
exports.LauncherPackagesStruct = Struct([
	{ name: 'payload', type: Struct.VarBuffer(Struct.Byte) }, // datos
	{ name: 'checkSum', type: Struct.Byte }, // suma de verificación = suma de todos los bytes de datos tomando el byte menos significativo
	{ name: 'tail', type: Struct.Array(2, Struct.Byte) } // final de paquete fijo 0D 0A
])

// datos del emisor
exports.LauncherDataStruct = Struct([
	{ name: 'rate', type: Struct.Byte }, // velocidad del puerto serie: 01~07:1200/2400/4800/9600/19200/38400/57600bps
	{ name: 'check', type: Struct.Byte }, // paridad del puerto serie: 00=sin paridad, 01=paridad impar, 02=paridad par; fijo en 00
	{ name: 'frequency', type: Struct.Array(3, Struct.Byte) }, // frecuencia*10^9/61035 convertido a HEX. Ej: 433MHz: 433*10^9/61035=7094290, es decir 6C4012
	{ name: 'factor', type: Struct.Byte }, // factor de expansión: 07=128, 08=256, 09=512, 0A=1024, 0B=2048, 0C=4096; no modificable, fijo en 2048
	{ name: 'mode', type: Struct.Byte }, // modo de trabajo: 00=estándar, 01=central, 02=nodo; no modificable, fijo en 01=central
	{ name: 'bandwidth', type: Struct.Byte }, // ancho de banda de expansión: 06=62.5, 07=125, 08=256, 09=512; no modificable, fijo en 07=125
	{ name: 'moduleH', type: Struct.Byte }, // byte alto del ID del módulo; fijo en 00
	{ name: 'moduleL', type: Struct.Byte }, // byte bajo del ID del módulo, fijo en 02
	{ name: 'netId', type: Struct.Byte }, // ID de red
	{ name: 'power', type: Struct.Byte }, // potencia de transmisión: 01=4, 02=7, 03=10, 04=13, 05=14, 06=17, 07=20 (dBm) fijo en 02=7
	{ name: 'breathCycle', type: Struct.Byte }, // ciclo de respiración: 00=2S, 01=4S, 02=6S, 03=8S, 04=10S, fijo en 00=2S
	{ name: 'breathTime', type: Struct.Byte } // tiempo de respiración: 00=2mS, 01=4mS, 02=8mS, 03=16mS, 04=32mS, 05=64mS; fijo en 04=32mS
])

// configurar valor de frecuencia y número de ID de red del emisor, comando: 1
exports.LauncherFreqIdStruct = Struct([
	{ name: 'header', type: Struct.Array(5, Struct.Byte) }, // fijo en AF AF 00 00 AF
	{ name: 'direction', type: Struct.Byte }, // dirección de datos, envío: 80, respuesta: 00
	{ name: 'cmd', type: Struct.Byte }, // código de identificación de comando, escribir datos: 1, leer datos: 2
	{ name: 'data', type: Struct.VarBuffer(Struct.Byte) }
])

exports.getHeader = (netId, sn, cmd) => {
	return {
		header: 122, // 7A
		netId, // ID de red del reloj
		sn, // número de serie del reloj
		cmd // comando
	}
}

// estructura del mensaje a enviar
exports.SendMessageStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // cabecera
	{ name: 'sn', type: Struct.String(4) }, // número de serie del gateway
	{ name: 'cmd', type: Struct.Byte }, // comando
	{ name: 'sid', type: Struct.Byte }, // identificador de sesión
	{ name: 'flags', type: Struct.Byte }, // identificador de sesión
	// { name: 'length', type: Struct.Byte}, // longitud de datos del mensaje, encode lo genera automáticamente
	{ name: 'payload', type: Struct.VarBuffer(Struct.Byte) }, // datos del llamador
	{ name: 'checksum', type: Struct.Byte } // suma de verificación = suma de todos los bytes de datos tomando el byte menos significativo
])

// mensaje recibido
exports.MessageStruct = Struct([
	{ name: 'header', type: Struct.Byte }, // cabecera, eliminada automáticamente por split
	{ name: 'sn1', type: Struct.Byte }, // comando
	{ name: 'sn2', type: Struct.Byte }, // comando
	{ name: 'sn3', type: Struct.Byte }, // comando
	{ name: 'sn4', type: Struct.Byte }, // comando
	{ name: 'cmd', type: Struct.Byte }, // comando
	{ name: 'sid', type: Struct.Byte }, // identificador de sesión
	{ name: 'flags', type: Struct.Byte }, // identificador de sesión
	// { name: 'length', type: Struct.Byte}, // longitud de datos del mensaje, se obtiene automáticamente al analizar
	{ name: 'payload', type: Struct.VarBuffer(Struct.Byte) }, // datos del llamador
	{ name: 'checksum', type: Struct.Byte } // suma de verificación = suma de todos los bytes de datos tomando el byte menos significativo
])

/***** Configuración del módulo USB tipo Lora */
exports.UsbLsettingStruct = Struct([
	{ name: 'commMode', type: Struct.Byte }, // modo de comunicación
	{ name: 'rChannel', type: Struct.Byte }, // canal de recepción
	{ name: 'sChannel', type: Struct.Byte }, // canal de reenvío
	{ name: 'power', type: Struct.Byte }, // potencia de transmisión
	{ name: 'check', type: Struct.Byte } // potencia de transmisión
])

// protocolo de mensajes de llamada

exports.CallerMessageStruct = Struct([
	//
	{ name: 'sn1', type: Struct.Byte }, // llamador
	{ name: 'sn2', type: Struct.Byte }, // llamador
	{ name: 'sn3', type: Struct.Byte }, // llamador - los tres sumados forman el sn del llamador
	{ name: 'flags', type: Struct.Byte }, // identificador de extensión, del bit menos significativo al más significativo
	{ name: 'key', type: Struct.Byte } // valor de la tecla
])
