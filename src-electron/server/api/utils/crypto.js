const { createHash } = require('crypto')
const fs = require('fs')

const encryptFile = async (algorithm, path) => {
	const hash = createHash(algorithm)
	// Lectura completa
	// hash.update(fs.readFileSync(path))
	// Lectura por bloques
	return new Promise((r, j) => {
		const read = fs.createReadStream(path)
		read.on('data', chunk => {
			hash.update(chunk)
		})
		read.on('end', () => {
			r(hash.digest('hex'))
		})
		read.on('error', error => {
			j(error)
		})
		// Iniciar el flujo de lectura del archivo
		read.resume()
	})
}

const sha1File = content => encryptFile('sha1', content)

const md5File = content => encryptFile('md5', content)

const md5 = str => {
	const hash = createHash('md5')
	hash.update(str, 'utf8')
	return hash.digest('hex').toLowerCase()
}

module.exports = { sha1File, md5File, encryptFile, md5 }
