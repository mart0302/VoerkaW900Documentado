const { TRANSACTION_RESULT, EVENT_CODE } = require('@voerka/messager')
const { Op, QueryTypes } = require('sequelize')
/**
 * Interfaz de clase estadística
 *
 * Método: post
 *
 * Parámetros básicos:
 *  - start  tiempo de inicio, timestamp
 *  - end tiempo final, timestamp
 *  - group agrupación de dispositivos
 *  - dimensions: [] dimensiones, actualmente no disponible
 *  - measure: métrica, actualmente no disponible, especifica COUNT(id)
 *  - timeDimension: dimensión temporal, agrupación temporal puede ser hourly(deshabilitado), daily, weekly(deshabilitado), monthly
 */

/** Métodos de utilidad */

const TIME_DIMENSION = {
	HOURLY: 'hourly',
	DAILY: 'daily',
	WEEKLY: 'weekly',
	MONTHLY: 'monthly'
}
exports.TIME_DIMENSION = TIME_DIMENSION

/**
 * Ensambla la consulta SQL para agrupar por intervalos de tiempo
 */
function groupByTime({
	dimension = TIME_DIMENSION.DAILY,
	field,
	asField = 'timestamp',
	table,
	selects = [],
	wheres = [],
	groupbys = [],
	orderbys = []
} = options) {
	let format = ''
	if (dimension === TIME_DIMENSION.DAILY) {
		format = '%Y-%m-%d 00:00:00'
	} else if (dimension === TIME_DIMENSION.HOURLY) {
		// format = '%Y-%m-%d %H:00:00'
		// 数据爆炸，所以不开放
	} else if (dimension === TIME_DIMENSION.WEEKLY) {
		// format = '%W'
		// 按周目前做不了，比较麻烦
	} else if (dimension === TIME_DIMENSION.MONTHLY) {
		format = '%Y-%m-01 00:00:00'
	}
	if (format) {
		const select = `strftime('%s', strftime('${format}', ${field})) * 1000 as ${asField}`
		selects.push(select)
		groupbys.push(asField)
		orderbys.push(`${asField} ASC`)
	}
	return {
		selects: selects.join(','),
		groupbys: groupbys.join(','),
		orderbys: orderbys.join(','),
		sql: `SELECT
      ${selects}
    FROM
      ${table}
    ${wheres.length ? `WHERE ${wheres.join(' AND ')}` : ''}
    ${groupbys.length ? `GROUP BY ${groupbys.join(',')}` : ''}
    ${orderbys.length ? `ORDER BY ${orderbys.join(',')}` : ''}`
	}
}

/**
 * Análisis de duración de llamadas
 * Modelo: Llamada (transacción de llamada)
 * Métrica: número de veces
 * Dimensión: duración del procesamiento, es decir, agrupar por duración, group by duration
 * Procesamiento de dimensión: unidad de división (unit, milisegundos), es decir, dividir por duración de procesamiento 0-2 minutos, 2-4 minutos...
 * la duración debe procesarse, la unidad de división como parámetro
 *
 * Si es un análisis de duración de procesamiento de llamadas para todo el período, entonces es una agrupación, duration, se puede usar un gráfico de barras
 * Si se agrega agrupación temporal, por día, por semana, por mes, el gráfico de barras o columnas sería difícil de ver,
 * sería mejor usar un gráfico de barras apiladas en el frontend
 * Actualmente la interfaz lo soporta, pero el frontend debe procesar los datos después de recibirlos para usar barras apiladas
 */
exports.callDuration = async (req, res, next) => {
	try {
		const { timeDimension, unit, start, end, group } = req.body

		if (start > end) {
			throw $APIError.BadRequest('error.start_greater_than_end')
		}

		// 拼凑查询
		const wheres = [`code = ${EVENT_CODE.APPLICATION_CALL}`, `result >= ${TRANSACTION_RESULT.COMPLETED}`]
		if (start) {
			wheres.push(`startTime >= datetime(${Math.floor(start / 1000)}, 'unixepoch')`)
		}
		if (end) {
			wheres.push(`startTime <= datetime(${Math.floor(end / 1000)}, 'unixepoch')`)
		}
		if (group) {
			wheres.push(`\`group\` like '${group}%'`)
		}

		const { sql } = groupByTime({
			dimension: timeDimension,
			field: 'startTime',
			// sqlite floor parece tener problemas, en el caso de >=0 cast(x as int) = floor(x)
			table: 'Transactions',
			wheres,
			selects: [`cast(duration / ${unit} as int) AS interval`, `count(id) AS \`count\``],
			groupbys: ['interval']
		})
		// 查询
		const transactions = await $db.sequelize.query(sql, { type: QueryTypes.SELECT })
		return res.json({
			data: transactions
		})
	} catch (error) {
		return next(error)
	}
}

// 呼叫结果分析
exports.callResult = async (req, res, next) => {
	try {
		const { timeDimension, start, end, group } = req.body

		if (start > end) {
			throw $APIError.BadRequest('error.start_greater_than_end')
		}

		// 拼凑查询
		const wheres = [`code = ${EVENT_CODE.APPLICATION_CALL}`, `result >= ${TRANSACTION_RESULT.COMPLETED}`]
		if (start) {
			wheres.push(`startTime >= datetime(${Math.floor(start / 1000)}, 'unixepoch')`)
		}
		if (end) {
			wheres.push(`startTime <= datetime(${Math.floor(end / 1000)}, 'unixepoch')`)
		}
		if (group) {
			wheres.push(`\`group\` like '${group}%'`)
		}

		const { sql } = groupByTime({
			dimension: timeDimension,
			field: 'startTime',
			// sqlite floor parece tener problemas, en el caso de >=0 cast(x as int) = floor(x)
			table: 'Transactions',
			wheres,
			selects: ['result', `count(id) AS \`count\``],
			groupbys: ['result']
		})
		// 查询
		const transactions = await $db.sequelize.query(sql, { type: QueryTypes.SELECT })
		return res.json({
			data: transactions
		})
	} catch (error) {
		return next(error)
	}
}

/**
 * Datos estadísticos de llamadas
 * @returns { total, finished, completed, notServiced, ignored, rejected, timeout, precaution }
 */
exports.callStatistics = async (req, res, next) => {
	try {
		const { start, end, group } = req.body

		if (start > end) {
			throw $APIError.BadRequest('error.start_greater_than_end')
		}

		const table = 'Transactions'
		// 拼凑查询
		const wheres = [`code = ${EVENT_CODE.APPLICATION_CALL}`]
		if (start) {
			wheres.push(`startTime >= datetime(${Math.floor(start / 1000)}, 'unixepoch')`)
		}
		if (end) {
			wheres.push(`startTime <= datetime(${Math.floor(end / 1000)}, 'unixepoch')`)
		}
		if (group) {
			wheres.push(`\`group\` like '${group}%'`)
		}
		// SELECT COUNT(case when result = 15 then 1 end) AS notServiced,   FROM Transactions WHERE code = 80000
		const selects = [
			`COUNT(id) AS total`,
			`COUNT(case when result >= ${TRANSACTION_RESULT.COMPLETED} then 1 end) AS finished`,
			`COUNT(case when result = ${TRANSACTION_RESULT.COMPLETED} then 1 end) AS completed`,
			`COUNT(case when result = ${TRANSACTION_RESULT.NOT_SERVICED} then 1 end) AS notServiced`,
			`COUNT(case when result = ${TRANSACTION_RESULT.IGNORED} then 1 end) AS ignored`,
			`COUNT(case when result = ${TRANSACTION_RESULT.REJECTED} then 1 end) AS rejected`,
			`COUNT(case when result = ${TRANSACTION_RESULT.TIMEOUT} then 1 end) AS timeout`,
			`COUNT(case when precaution = true then 1 end) AS precaution` // 超出预警的数量
		]

		// 查询
		const statistics = await $db.sequelize.query(
			`SELECT ${selects.join(',')} FROM ${table} WHERE ${wheres.join(' AND ')}`,
			{
				type: QueryTypes.SELECT
			}
		)
		return res.json(statistics[0] || {})
	} catch (error) {
		return next(error)
	}
}

/**
 * Estadísticas de alarmas
 * @returns { total, result }
 */
exports.alarmStatistics = async (req, res, next) => {
	try {
		const { start, end, group } = req.body

		if (start > end) {
			throw $APIError.BadRequest('error.start_greater_than_end')
		}

		const table = 'Events'
		// 拼凑查询
		const wheres = [`type = 'alarm'`]
		if (start) {
			wheres.push(`triggerTime >= datetime(${Math.floor(start / 1000)}, 'unixepoch')`)
		}
		if (end) {
			wheres.push(`triggerTime <= datetime(${Math.floor(end / 1000)}, 'unixepoch')`)
		}
		if (group) {
			wheres.push(`\`group\` like '${group}%'`)
		}
		const selects = [
			`COUNT(id) AS total`,
			`COUNT(case when result >= ${TRANSACTION_RESULT.COMPLETED} then 1 end) AS finished`
		]

		// 查询
		const statistics = await $db.sequelize.query(
			`SELECT ${selects.join(',')} FROM ${table} WHERE ${wheres.join(' AND ')}`,
			{
				type: QueryTypes.SELECT
			}
		)
		return res.json(statistics[0] || {})
	} catch (error) {
		return next(error)
	}
}
