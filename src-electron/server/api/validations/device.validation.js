const Joi = require('joi')

module.exports = {
	//Autenticación del dispositivo
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
							// red
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
						// Ubicación de la instalación, {etiqueta, longitud, latitud}
						label: Joi.string().empty('').default(''),
						long: Joi.number().default(0),
						lati: Joi.number().default(0)
					}),
					// Los siguientes datos son solo reservados y en realidad son inútiles.
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

	//Actualización del dispositivo
	upgradeDevices: {
		body: {
			devices: Joi.array().items(Joi.string().min(12).max(12).lowercase()).required(),
			package: Joi.string().required()
		}
	},

	// Crear un dispositivo manualmente
	createDevice: {
		body: {
			sn: Joi.string().min(12).max(12).lowercase().required(),
			parent: Joi.string().empty('').default(''),
			type: Joi.string().required(), // tipo de dispositivo
			title: Joi.string().empty('').default(''), // nombre del dispositivo
			version: Joi.string().empty('').default(''), //versión de firmware
			networks: Joi.array().items(
				Joi.object({
					// red
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
				// Ubicación de la instalación, {etiqueta, longitud, latitud}
				label: Joi.string().empty('').default(''),
				long: Joi.number().default(0),
				lati: Joi.number().default(0)
			}),
			// Los siguientes datos son solo reservados y en realidad son inútiles.
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
			// Agregar propiedades de configuración personalizadas
			attrs: Joi.object({
				// Diferentes dispositivos tienen diferentes configuraciones
			}),
			online: Joi.boolean()
		}
	},

	//Actualizar dispositivo
	updateDevice: {
		body: {
			parent: Joi.string().empty(''),
			type: Joi.string(), // tipo de dispositivo
			title: Joi.string().empty(''), // nombre del dispositivo
			version: Joi.string().empty(''), //versión de firmware
			networks: Joi.array().items(
				Joi.object({
					// red
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
				// Ubicación de la instalación, {etiqueta, longitud, latitud}
				label: Joi.string().empty(''),
				long: Joi.number(),
				lati: Joi.number()
			}),
			// Los siguientes datos son solo reservados y en realidad son inútiles.
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
			// Agregar propiedades de configuración personalizadas
			attrs: Joi.object({
				// Diferentes dispositivos tienen diferentes configuraciones
			})
		}
	},

	// eliminación por lotes
	removeDevices: {
		body: {
			ids: Joi.array().items(Joi.string().min(12).max(12))
		}
	},

	// Obtener la lista
	listDevices: {
		query: {
			limit: Joi.number().integer().min(1).max(100).default(20),
			offset: Joi.number().integer().min(0).default(0),
			online: Joi.boolean()
		}
	}
}
