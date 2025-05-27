const { resolve, join } = require('path')
const fs = require('fs-extra')
const { pick, merge } = require('lodash')

const isDev = process.env.NODE_ENV !== 'production'

const EXTRA_FILES_NAME = 'extraFiles'
const DATA_NAME = 'data' // 项目中的初始数据文件夹名称（供初始用户数据所用）
const USER_DATA_NAME = isDev ? 'W900Data' : process.env.USER_APP_DATA || 'Data' // 软件运行的用户数据文件夹名称，软件启动时会检查该目录存在否，不存在则拷贝“项目中的初始数据文件夹”
const DEV_PUBLIC_NAME = 'public' // asar = true && extraFiles = ['dist']
// const PROD_PUBLIC_NAME = 'resources/app'  // asar = false
const PROD_PUBLIC_NAME = 'dist'
const PACKAGES_NAME = 'packages'
const SERVER_NAME = 'server'

function getAppDir() {
	return process.cwd()
}

// 应用所在文件夹
const appDir = getAppDir()
// 应用额外文件（依赖服务）所在文件夹，比如emqx
const extraFilesDir = resolve(appDir, EXTRA_FILES_NAME)
// 应用静态文件夹，比如index.html
const publicDir = resolve(appDir, isDev ? DEV_PUBLIC_NAME : PROD_PUBLIC_NAME)
// 升级包文件夹
const packagesDir = resolve(publicDir, PACKAGES_NAME)
// 后端文件夹
const srcDir = __dirname
// 后端server文件夹
const serverDir = resolve(srcDir, SERVER_NAME)
// 初始数据文件夹
const defaultDataDir = resolve(appDir, DATA_NAME)
// 应用的数据文件夹应该放在用户目录下
const userDataDir = require('electron').app ? require('electron').app.getPath('userData') : appDir
const dataDir = resolve(userDataDir, USER_DATA_NAME)

// 加载sequelize配置
function loadSequelizeConfig(type = 'user') {
	const env = process.env.NODE_ENV || 'development'
	const configFile = join(process.env.SEQUELIZE_CONFIG_DIR, process.env.SEQUELIZE_CONFIG_NAME)
	const dir = type === 'user' ? dataDir : defaultDataDir

	const config = require(join(dir, configFile))[env]
	return {
		...config,
		storage: join(dir, config.storage)
	}
}

const configFile = join(process.env.USER_CONFIG_FILE_DIR, process.env.USER_CONFIG_FILE_NAME)
// 加载用户配置文件
function loadUserConfig() {
	// 全局对象
	try {
		$userConfig = require(join(dataDir, configFile))
	} catch (error) {
		// 用户手贱删除用户目录下的用户配置，则读取软件目录下的默认用户配置
		// 如果用户再次手贱删除，那后果字符
		// P.S. 当用户删除db.config.js就会导致软件用不了，我们如果考虑太多这类的问题那么就变成用户的保姆了
		$userConfig = require(join(userDataDir, configFile))
	}
	return $userConfig
}

// 更新用户配置
function updateUserConfig(data = {}) {
	// data = pick(data, Object.keys($userConfig))
	merge($userConfig, data)
	fs.writeFileSync(join(dataDir, configFile), JSON.stringify($userConfig, null, 2), 'utf8')
	return $userConfig
}

// 检查用户数据
function checkUserData() {
	if (!fs.existsSync(dataDir)) {
		fs.copySync(defaultDataDir, dataDir)
	}
}

module.exports = {
	// 目录
	appDir,
	extraFilesDir, // 废弃
	publicDir,
	packagesDir, // 废弃
	srcDir,
	serverDir,
	dataDir,
	defaultDataDir,
	// 目录方法
	resolve: {
		app: dir => join(appDir, dir),
		extraFiles: dir => join(extraFilesDir, dir),
		data: dir => join(dataDir, dir),
		defaultData: dir => join(defaultDataDir, dir),
		public: dir => join(publicDir, dir),
		packages: dir => join(packagesDir, dir),
		src: dir => join(srcDir, dir),
		server: dir => join(serverDir, dir)
	},

	require: {
		app: dir => require(join(appDir, dir)),
		extraFiles: dir => require(join(extraFilesDir, dir)),
		data: dir => require(join(dataDir, dir)),
		defaultData: dir => require(join(defaultDataDir, dir)),
		public: dir => require(join(publicDir, dir)),
		packages: dir => require(join(packagesDir, dir)),
		src: dir => require(join(srcDir, dir)),
		server: dir => require(join(serverDir, dir))
	},

	// sequelize相关
	// 获取配置文件
	loadSequelizeConfig,

	// 加载用户配置文件
	loadUserConfig,

	// 更新用户配置
	updateUserConfig,

	// 初始化
	init() {
		checkUserData()
		loadUserConfig()
	}
}
