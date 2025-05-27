/**
 * Hook de actualización de datos TTS
 */
const path = require('path')
const fse = require('fs-extra')
const { upload: uploadConfig } = requireConfig('vars')
const { tts: ttsConfig } = uploadConfig
const { destination } = ttsConfig
const ttsPath = appPath.resolve.data(destination)

// Al crear un nuevo TTS, verificar si es necesario enviar una notificación a la puerta de enlace
$db.TtsAudio.addHook('afterCreate', async (ttsAudio, options) => {
	const validAudios = await $db.TtsAudio.findAll({
		where: { gatewaySn: ttsAudio.gatewaySn, status: false },
		order: [['orderId', 'ASC']]
	}) // ASC
	if (validAudios.length == 1) {
		const nextAudio = validAudios[0].toJSON()
		const { id, url, gatewaySn } = nextAudio
		$messager.postAction(
			{
				to: gatewaySn,
				sid: true,
				domain: $userConfig.domain
			},
			{
				action: 'intercom',
				msgId: parseInt(id),
				url: url
			}
		)
	}
})

// Al actualizar un TTS, verificar si es necesario enviar una notificación a la puerta de enlace
$db.TtsAudio.addHook('afterUpdate', async (ttsAudio, options) => {
	const validAudios = await $db.TtsAudio.findAll({
		where: { gatewaySn: ttsAudio.gatewaySn, status: false },
		order: [['orderId', 'ASC']]
	}) // ASC
	if (validAudios.length == 1) {
		const nextAudio = validAudios[0].toJSON()
		const { id, url, gatewaySn } = nextAudio
		$messager.postAction(
			{
				to: gatewaySn,
				sid: true,
				domain: $userConfig.domain
			},
			{
				action: 'intercom',
				msgId: parseInt(id),
				url: url
			}
		)
	}
})

// Al eliminar un registro TTS, eliminar los archivos relacionados
$db.TtsAudio.addHook('afterDestroy', async (ttsAudio, options) => {
	const { fileName } = ttsAudio
	// Eliminar archivo de certificado
	// Eliminar archivo
	fse.removeSync(path.join(ttsPath, fileName))
})
