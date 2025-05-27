// Si las variables de entorno no están cargadas, cargarlas
if (!process.env.JWT_SECRET) {
	require('dotenv-safe').load({
		path: '.env',
		sample: '.env.example'
	})
}

module.exports = {
	env: process.env.NODE_ENV,
	jwtSecret: process.env.JWT_SECRET,
	jwtExpirationDays: process.env.JWT_EXPIRATION_DAYS,
	logs: process.env.NODE_ENV === 'production' ? 'combined' : 'dev',
	upload: {
		temps: 'temps', // ubicación de almacenamiento temporal de archivos subidos
		image: {
			destination: process.env.IMAGE_DESTINATION,
			types: process.env.IMAGE_TYPES,
			maxSize: Number(process.env.IMAGE_MAX_SIZE)
		},
		package: {
			destination: process.env.PACKAGE_DESTINATION,
			types: process.env.PACKAGE_TYPES,
			maxSize: Number(process.env.PACKAGE_MAX_SIZE)
		},
		audio: {
			destination: process.env.AUDIO_DESTINATION,
			types: process.env.AUDIO_TYPES,
			maxSize: Number(process.env.AUDIO_MAX_SIZE)
		},
		tts: {
			destination: process.env.TTS_DESTINATION,
			types: process.env.TTS_TYPES,
			maxSize: Number(process.env.TTS_MAX_SIZE)
		},
		license: {
			destination: process.env.DEVICE_LICENSE_DIR
		}
	}
}
