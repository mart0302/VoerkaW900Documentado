// const log = require('electron-log')
const log = $log
/*
 Returns pid, takes onClose
 */
function spawn(cmd, params = [], opts, { onClose, stdOut, stdErr } = {}) {
	if (!cmd) {
		log.error(`Command name was not available. Please run again.`)
	}

	log.info(`Running "${cmd} ${params.join(' ')}"`)

	const runner = require('child_process').spawn(cmd, params, opts)

	runner.on('exit', code => {
		onClose && onClose(code)
	})

	runner.stdout.on('data', data => {
		stdOut && stdOut(data)
	})

	runner.stderr.on('data', data => {
		stdErr && stdErr(data)
	})

	return runner
}

module.exports.spawn = spawn

function spawnPromise(cmd, params = [], opts) {
	return new Promise((r, j) => {
		let out = '',
			err = ''
		spawn(cmd, params, opts, {
			onClose(code) {
				if (code) {
					j(new Error(err.trim()))
				} else {
					r(out.trim())
				}
			},
			stdOut(data) {
				out += data
			},
			stdErr(data) {
				err += data
			}
		})
	})
}

module.exports.spawnPromise = spawnPromise

/*
 Returns nothing, takes onFail
 */
module.exports.spawnSync = function (cmd, params = [], opts) {
	if (!cmd) {
		log.error(`Command name was not available. Please run again.`)
	}

	log.info(`[sync] Running "${cmd} ${params.join(' ')}"`)

	console.log('opts', opts, Date.now())

	const runner = require('child_process').spawnSync(cmd, params, opts)

	// 可以直接打印
	// runner.stderr
	// runner.stdout
	console.log('opts', opts, Date.now())

	return runner
}
