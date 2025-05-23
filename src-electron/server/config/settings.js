const { merge } = require('lodash')

// 加载数据库settings到内存
module.exports = class Settings {
	constructor(db) {
		this.db = db
		this.data = {}
	}

	// 加载
	async load() {
		const data = (await this.db.Setting.findAll()).map(item => item.toJSON())
		this.data = data.reduce((total, item) => {
			total[item.key] = item.value
			return total
		}, {})
	}

	// 更新配置
	async update(key, value, options = {}) {
		await this.db.Setting.upsert({
			...options,
			value: merge({}, this.data[key], value),
			key
		})
		const setting = await this.db.Setting.findByPk(key)
		this.data[key] = setting.value
		return setting
	}

	// 获取
	get(key) {
		return this.data[key]
	}
}
