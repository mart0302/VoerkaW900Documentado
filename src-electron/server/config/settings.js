const { merge } = require('lodash')

// cargar settings de la base de datos a memoria
module.exports = class Settings {
	constructor(db) {
		this.db = db
		this.data = {}
	}

	// cargar
	async load() {
		const data = (await this.db.Setting.findAll()).map(item => item.toJSON())
		this.data = data.reduce((total, item) => {
			total[item.key] = item.value
			return total
		}, {})
	}

	// actualizar configuración
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

	// obtener
	get(key) {
		return this.data[key]
	}
}
