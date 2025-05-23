/**
 * tts数据更新hook
 */
const path = require('path')
const fse = require('fs-extra')
const { upload: uploadConfig } = requireConfig('vars')
const { tts: ttsConfig } = uploadConfig
const { destination } = ttsConfig
const ttsPath = appPath.resolve.data(destination)

// tts新增时查找是否需要发通知给网关
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

// tts更新时查找是否需要发通知给网关
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

// tts删除记录，删除相关文件
$db.TtsAudio.addHook('afterDestroy', async (ttsAudio, options) => {
	const { fileName } = ttsAudio
	// 删除证书文件
	// 删除文件
	fse.removeSync(path.join(ttsPath, fileName))
})
