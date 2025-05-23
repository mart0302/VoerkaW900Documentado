/**
 * easy-electron配置文件
 */
const fs = require('fs')
const path = require('path')

const resolve = target => path.resolve(__dirname, target)

module.exports = {
	// 版本2
	version: 2,

	// 脚本配置
	scripts: {
		serve: 'dev', // 开发环境服务器
		build: 'build' // 打包
	},

	// 【逻辑已覆盖】项目运行地址
	server: {
		host: 'localhost', // 默认localhost
		port: 3000, // 前端运行端口
		useInProd: false // 生产环境随机获取端口【本项目配置无效】
	},

	// 项目运行相关
	run: {
		// chokidar监听
		watcher: {
			dir: 'src-electron',
			options: {
				ignored: [resolve('./src-electron/server')]
			},
			debounce: 500
		}
	},

	// 项目打包位置
	build: {
		inDir: 'dist',
		outDir: 'dist_electron',
		cacheDir: 'dist_cache', // electron打包缓存目录，防止每次打包都下载依赖
		cacheIgnoreDeps: true
	},

	// 钩子
	hooks: {
		// easy-electron项目启动
		start({ logger }) {
			// 判断extraFiles是否包含emqx，否则提示让代码打包者去下载解压
			/*
			const emqxPath = resolve('./extraFiles/emqx')
			const emqxDlUrl = 'https://www.emqx.cn/downloads/broker/v4.1.5/emqx-windows-v4.1.5.zip'
			if (!fs.existsSync(emqxPath)) {
				logger.warn(`缺少"emqx"，请确保"${emqxPath}"存在\n`)
				logger.fatal(`请自行下载"${emqxDlUrl}"，并解压至该目录下\n`)
			}
      */
			// 由于emqx有问题，所以改为采用aedes作为mqtt服务端，代码仍保留，但是注释掉；改动详情请见2021.8.4的git提交记录
		},
		// easy-electron run执行
		runStart() {},
		// easy-electron build执行
		buildStart() {},
		buildEnd() {},
		end() {}
	},

	// electron 打包
	bundler: 'builder', // 'packager' or 'builder', 目前只支持builder

	packager: {
		// https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
		// OS X / Mac App Store
		// appBundleId: '',
		// appCategoryType: '',
		// osxSign: '',
		// protocol: 'myapp://path',
		// Windows only
		// win32metadata: { ... }
	},

	builder: {
		// https://www.electron.build/configuration/configuration
		appId: 'com.hyt.voerka.w900', // 应用id
		productName: 'VoerkaW900', // 产品名称，也是生成的安装文件名，即xxx.exe
		copyright: 'HYT Copyright © 2021', // 版权信息
		asar: true, // asar 打包
		extraFiles: ['./extraFiles', './data', './dist', '.env', '.env.example'], // 额外文件，直接拷贝到exe同级目录
		win: {
			// win相关配置
			icon: 'public/favicon.ico', // 图标，当前图标在根目录下，注意这里有两个坑
			// requestedExecutionLevel: 'highestAvailable', //获取管理员权限
			target: [
				{
					target: 'nsis', // 利用nsis制作安装程序
					arch: [
						'x64' // 64位
						// 'ia32' // 32位
					]
				}
			]
		},
		nsis: {
			oneClick: false, // 是否一键安装
			allowElevation: true, // 允许请求提升。 如果为false，则用户必须使用提升的权限重新启动安装程序
			allowToChangeInstallationDirectory: true, // 允许修改安装目录
			include: 'build/installer.nsh', // 安装目录配置
			installerIcon: 'public/favicon.ico', // 安装图标
			uninstallerIcon: 'public/favicon.ico', // 卸载图标
			installerHeaderIcon: 'public/favicon.ico', // 安装时头部图标
			// deleteAppDataOnUninstall: true,
			// warningsAsErrors: false,
			createDesktopShortcut: true, // 创建桌面图标
			createStartMenuShortcut: true, // 创建开始菜单图标
			shortcutName: 'VoerkaW900' // 图标名称(项目名称)
		}
	},

	// background 打包依赖项
	dependencies: [
		'aedes',
		'aedes-server-factory',
		'body-parser',
		'bytenode',
		'chokidar',
		'compression',
		'cors',
		'dotenv-safe',
		'electron-log',
		'electron-store',
		'express',
		'express-validation',
		'extract-zip',
		'fs-extra',
		'get-port',
		'helmet',
		'http-status',
		'i18n',
		'iconv-lite',
		'joi',
		'jwt-simple',
		'lodash',
		'macaddress',
		'method-override',
		'moment-timezone',
		'morgan',
		'mqtt',
		'ms',
		'multer',
		'openpgp',
		'passport',
		'passport-jwt',
		'rxjs',
		'sequelize',
		'sqlite3',
		'voerka-discover',
		'@voerka/messager',
		'varstruct',
		'dayjs',
		'serialport',
		'usb-detection'
	]
}
