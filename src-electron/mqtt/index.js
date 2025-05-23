const { createServer } = require('aedes-server-factory')

function serveTCP({ aedes, port }, onSuccess, onFailure) {
	const server = createServer(aedes)
	server.listen(port, function () {
		console.log('server(TCP) started and listening on port ', port)
		onSuccess && onSuccess()
	})
	server.on('error', function (err) {
		onFailure && onFailure(err)
	})
}

function serveWS({ aedes, port }, onSuccess, onFailure) {
	const httpServer = createServer(aedes, { ws: true })
	httpServer.listen(port, function () {
		console.log('server(TCP) started and listening on port ', port)
		onSuccess && onSuccess()
	})
	httpServer.on('error', function (err) {
		onFailure && onFailure(err)
	})
}

function serve(options = {}) {
	const { tcp = 1883, ws = 8083 } = options
	const aedes = require('aedes')()

	return Promise.all([
		new Promise((resolve, reject) => {
			serveTCP({ aedes, port: tcp }, resolve, reject)
		}),
		new Promise((resolve, reject) => {
			serveWS({ aedes, port: ws }, resolve, reject)
		})
	]).then(() => {
		return options
	})
}

module.exports = serve
