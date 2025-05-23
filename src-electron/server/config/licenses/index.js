/**
 * 设备授权，暂时弃用
 */
const path = require('path')
const fs = require('fs-extra')
const { upload: uploadConfig } = requireConfig('vars')
const { license: licenseConfig } = uploadConfig
const { destination } = licenseConfig
const licensePath = appPath.resolve.data(destination)

$devicesWatcher = {}
// 注册证书监听
async function installDeviceLicenseWatcher({ sn, licenseFile }) {
	$log.info('start ============installDeviceLicenseWatcher')
	// 证书验证结果
	let licenseValidResult = { result: false, message: '', checked: false }
	// 引入证书监听器
	if (process.env.LICENSE_BUILD === 'true') {
		// 编译
		require('../../../license/build/build.js')
	} else {
		const logName = 'licenseWatcher'
		// 证书监听
		try {
			// 每10分钟检测一次
			$devicesWatcher[sn] = require('../../../license/devicesWatcher')({
				checkInterval: 10 * 60 * 1000,
				sn,
				licenseFile
			})
		} catch (error) {
			$log.error(logName, error.message)
		}
		if ($devicesWatcher[sn]) {
			// 监听 voerka 证书监视器事件
			$devicesWatcher[sn]
				.on('started', () => {
					// 当监视开始时
					$log.info(logName, `device ${sn} license watch started`, $devicesWatcher[sn].certificate)
				})
				.on('valid', () => {
					// 将结果放到全局对象中，api就可以返回这个结果，弱化electron的依赖，后面可以脱离electron开发web版本
					// 当证书生效或恢复生效时
					licenseValidResult.result = Object.keys($devicesWatcher[sn].licenseData).reduce((data, cur) => {
						data[cur.replace('$', '')] = $devicesWatcher[sn].licenseData[cur]
						return data
					}, {})
					licenseValidResult.message = ''
					licenseValidResult.checked = true

					// 发送事件给设备
					$log.info('installDeviceLicenseWatcher===license-validate:', { sn, ...licenseValidResult })
					$db.License.update({ ...licenseValidResult }, { where: { sn } })
					$messager.postAttrs(
						{ to: sn, sid: true, domain: $userConfig.domain }, // domain可加可不加，因为此项目是单domain的
						{ sn, ...licenseValidResult }
					)
				})
				.on('invalid', e => {
					// 当证书失效时
					// $log.error(logName, 'license invalid', e.message)
					licenseValidResult.result = null
					licenseValidResult.message = e.message
					licenseValidResult.checked = true

					// 发送事件给设备
					$log.info('installDeviceLicenseWatcher===license-invalid:', { sn, ...licenseValidResult })
					$db.License.update({ ...licenseValidResult }, { where: { sn } })
					$messager.postAttrs(
						{ to: sn, sid: true, domain: $userConfig.domain }, // domain可加可不加，因为此项目是单domain的
						{ sn, ...licenseValidResult }
					)
				})
				.on('error', e => {
					// 当监视异常时，也就是证书失效时
					$log.error(logName, `device ${sn} license watch error`, e.message)
				})
				.on('stopped', () => {
					// 当监视停止时
					$log.info(logName, `device ${sn} license watch stoped`)
				})

			// 启动监听
			$devicesWatcher[sn].start()

			return $devicesWatcher[sn]
		}
	}
}

async function installDevicesLicenseWatcher() {
	$log.info('start ============installDevicesLicenseWatcher')
	// 判断目标目录是否存在，不存在则返回
	if (!fs.existsSync(licensePath)) {
		return
	}
	const licenses = await $db.License.findAll()
	if (!licenses) {
		return
	}
	// 读取数据库查找证书文件路径
	licenses.map(async license => {
		$log.info('license-====', license)
		// 遍历文件证书创建设备证书监听
		installDeviceLicenseWatcher({ sn: license.sn, licenseFile: path.join(licensePath, license.fileName) })
	})
}

module.exports = {
	installDeviceLicenseWatcher: data => installDeviceLicenseWatcher(data),
	installDevicesLicenseWatcher: data => installDevicesLicenseWatcher(data)
}
