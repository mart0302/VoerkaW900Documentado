// Importa la función para crear servidores (TCP o WebSocket) usando Aedes
const { createServer } = require('aedes-server-factory')

// Función para levantar un servidor MQTT sobre TCP
function serveTCP({ aedes, port }, onSuccess, onFailure) {
	const server = createServer(aedes)
	server.listen(port, function () {
		console.log('server(TCP) started and listening on port ', port)
		onSuccess && onSuccess() // Llama a la función de éxito si se proporciona
	})
	server.on('error', function (err) {
		onFailure && onFailure(err) // Llama a la función de error si se produce un fallo
	})
}

// Función para levantar un servidor MQTT sobre WebSockets
function serveWS({ aedes, port }, onSuccess, onFailure) {
	const httpServer = createServer(aedes, { ws: true }) // Crea el servidor WS con Aedes
	httpServer.listen(port, function () {
		console.log('server(TCP) started and listening on port ', port)
		onSuccess && onSuccess() // Llama a la función de éxito si se proporciona
	})
	httpServer.on('error', function (err) {
		onFailure && onFailure(err)
	})
}

// Llama a la función de éxito si se proporciona
function serve(options = {}) {
	const { tcp = 1883, ws = 8083 } = options // Puertos por defecto para TCP y WS
	const aedes = require('aedes')() // Crea una instancia del broker MQTT Aedes

	// Inicia ambos servidores de forma paralela y espera a que ambos terminen
	return Promise.all([
		new Promise((resolve, reject) => { // Inicia servidor TCP
			serveTCP({ aedes, port: tcp }, resolve, reject)
		}),
		new Promise((resolve, reject) => {
			serveWS({ aedes, port: ws }, resolve, reject) // Inicia servidor WebSocket
		})
	]).then(() => {
		return options // Devuelve las opciones una vez que ambos servidores estén listos
	})
}

// Exporta la función para ser utilizada en otros módulos
module.exports = serve
