const path = require('path')
const i18n = require('i18n')
const fs = require('fs')
// 国际化
const directory = path.join(__dirname, '../api/locales')
const locales = fs.readdirSync(directory).map(item => path.parse(item).name)

i18n.configure({
	locales,
	defaultLocale: 'zh',
	directory
})

module.exports = i18n
