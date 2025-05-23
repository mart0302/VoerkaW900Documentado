require('dotenv-safe').load({
	path: '.env',
	sample: '.env.example'
})

const path = require('path')
appPath = require('../app-paths')
// require config目录下的模块
requireData = appPath.require.data
// require api目录下的模块
requireApi = mod => appPath.require.server(path.join('api', mod))
// require config目录下的模块
requireConfig = mod => appPath.require.server(path.join('config', mod))

// 创建数据库文件
// 指明数据库初始化为本地的数据库文件，不是用户目录数据库
process.env.SEQUELIZE_DB_TYPE = 'default'
const db = require('../server/config/database')
db.sequelize.sync()
