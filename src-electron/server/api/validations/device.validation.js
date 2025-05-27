const Joi = require('joi')

module.exports = {
	// 设备认证
	authorizeDevices: {
		body: {
			devices: Joi.array().items(
				Joi.object({
					sn: Joi.string().min(12).max(12).lowercase().required(),
					parent: Joi.string().empty('').default(''),
					type: Joi.string().required(), // 设备类型
					title: Joi.string().empty('').default(''), // 设备名称
					version: Joi.string().empty('').default(''), // 固件版本
					networks: Joi.array().items(
						Joi.object({
							// 网络
							dhcp: Joi.boolean().default(false),
							dnsAlter: Joi.string()
								.ip({ version: ['ipv4'] })
								.empty('')
								.default(''),
							dnsPrefer: Joi.string()
								.ip({ version: ['ipv4'] })
								.empty('')
								.default(''),
							gateway: Joi.string()
								.ip({ version: ['ipv4'] })
								.empty('')
								.default(''),
							ip: Joi.string()
								.ip({ version: ['ipv4'] })
								.empty('')
								.default(''),
							interface: Joi.string().empty('').default(''),
							mac: Joi.string().empty('').default(''),
							subnetMask: Joi.string()
								.ip({ version: ['ipv4'] })
								.empty('')
								.default('')
						})
					),
					mqtt: Joi.object({
						// mqtt, { broker, username, password, domain }
						broker: Joi.string().empty('').default(''),
						username: Joi.string().empty('').default(''),
						password: Joi.string().empty('').default(''),
						domain: Joi.string().empty('').default('')
					}),
					location: Joi.object({
						// 安装位置， { label, long, lati }
						label: Joi.string().empty('').default(''),
						long: Joi.number().default(0),
						lati: Joi.number().default(0)
					}),
					// 以下数据仅做保留，其实没有用
					source: Joi.string().empty('').default(''),
					model: Joi.string().empty('').default(''),
					wifi: Joi.object({
						// { ap: WIFI_AP, enable: WIFI_Enable, password: WIFI_Password, secret: WIFI_Secret }
						ap: Joi.string().empty('').default(''),
						enable: Joi.boolean().default(false),
						password: Joi.string().empty('').default(''),
						secret: Joi.number().default(0)
					}),
					authorized: Joi.boolean().default(false),
					configPort: Joi.number().default(0),
					header: Joi.string().empty('').default('')
				})
			)
		}
	},

	// 设备升级
	upgradeDevices: {
		body: {
			devices: Joi.array().items(Joi.string().min(12).max(12).lowercase()).required(),
			package: Joi.string().required()
		}
	},

	// 手动创建设备
	createDevice: {
		body: {
			sn: Joi.string().min(12).max(12).lowercase().required(),
			parent: Joi.string().empty('').default(''),
			type: Joi.string().required(), // 设备类型
			title: Joi.string().empty('').default(''), // 设备名称
			version: Joi.string().empty('').default(''), // 固件版本
			networks: Joi.array().items(
				Joi.object({
					// 网络
					dhcp: Joi.boolean().default(false),
					dnsAlter: Joi.string()
						.ip({ version: ['ipv4'] })
						.empty('')
						.default(''),
					dnsPrefer: Joi.string()
						.ip({ version: ['ipv4'] })
						.empty('')
						.default(''),
					gateway: Joi.string()
						.ip({ version: ['ipv4'] })
						.empty('')
						.default(''),
					ip: Joi.string()
						.ip({ version: ['ipv4'] })
						.empty('')
						.default(''),
					interface: Joi.string().empty('').default(''),
					mac: Joi.string().empty('').default(''),
					subnetMask: Joi.string()
						.ip({ version: ['ipv4'] })
						.empty('')
						.default('')
				})
			),
			mqtt: Joi.object({
				// mqtt, { broker, username, password, domain }
				broker: Joi.string().empty('').default(''),
				username: Joi.string().empty('').default(''),
				password: Joi.string().empty('').default(''),
				domain: Joi.string().empty('').default('')
			}),
			location: Joi.object({
				// 安装位置， { label, long, lati }
				label: Joi.string().empty('').default(''),
				long: Joi.number().default(0),
				lati: Joi.number().default(0)
			}),
			// 以下数据仅做保留，其实没有用
			source: Joi.string().empty('').default('MULTICAST'),
			model: Joi.string().empty('').default(''),
			wifi: Joi.object({
				// { ap: WIFI_AP, enable: WIFI_Enable, password: WIFI_Password, secret: WIFI_Secret }
				ap: Joi.string().empty('').default(''),
				enable: Joi.boolean().default(false),
				password: Joi.string().empty('').default(''),
				secret: Joi.number().default(0)
			}),
			authorized: Joi.boolean().default(false),
			configPort: Joi.number().default(0),
			header: Joi.string().empty('').default('meeyi'),
			// 新增个性化配置属性
			attrs: Joi.object({
				// 不同设备，配置不一样
			}),
			online: Joi.boolean()
		}
	},

	// 更新设备
	updateDevice: {
		body: {
			parent: Joi.string().empty(''),
			type: Joi.string(), // 设备类型
			title: Joi.string().empty(''), // 设备名称
			version: Joi.string().empty(''), // 固件版本
			networks: Joi.array().items(
				Joi.object({
					// 网络
					dhcp: Joi.boolean().default(false),
					dnsAlter: Joi.string()
						.ip({ version: ['ipv4'] })
						.empty('')
						.default(''),
					dnsPrefer: Joi.string()
						.ip({ version: ['ipv4'] })
						.empty('')
						.default(''),
					gateway: Joi.string()
						.ip({ version: ['ipv4'] })
						.empty('')
						.default(''),
					ip: Joi.string()
						.ip({ version: ['ipv4'] })
						.empty('')
						.default(''),
					interface: Joi.string().empty('').default(''),
					mac: Joi.string().empty('').default(''),
					subnetMask: Joi.string()
						.ip({ version: ['ipv4'] })
						.empty('')
						.default('')
				})
			),
			mqtt: Joi.object({
				// mqtt, { broker, username, password, domain }
				broker: Joi.string().empty(''),
				username: Joi.string().empty(''),
				password: Joi.string().empty(''),
				domain: Joi.string().empty('')
			}),
			location: Joi.object({
				// 安装位置， { label, long, lati }
				label: Joi.string().empty(''),
				long: Joi.number(),
				lati: Joi.number()
			}),
			// 以下数据仅做保留，其实没有用
			source: Joi.string().empty(''),
			model: Joi.string().empty(''),
			wifi: Joi.object({
				// { ap: WIFI_AP, enable: WIFI_Enable, password: WIFI_Password, secret: WIFI_Secret }
				ap: Joi.string().empty(''),
				enable: Joi.boolean(),
				password: Joi.string().empty(''),
				secret: Joi.number()
			}),
			authorized: Joi.boolean(),
			configPort: Joi.number(),
			header: Joi.string().empty(''),
			// 新增个性化配置属性
			attrs: Joi.object({
				// 不同设备，配置不一样
			})
		}
	},

	// 批量删除
	removeDevices: {
		body: {
			ids: Joi.array().items(Joi.string().min(12).max(12))
		}
	},

	// 获取列表
	listDevices: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0),
			online: Joi.boolean()
		}
	}
}
