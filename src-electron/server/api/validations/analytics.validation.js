const Joi = require('joi')
const { TIME_DIMENSION } = require('../controllers/analytics.controller')
const { pick } = require('lodash')

const analytics = {
	/*  - start  开始时间，时间戳
	 *  - end 结束时间，时间戳
	 *  - group 设备分组
	 *  - dimensions: [] 维度，目前不开放
	 *  - measure: 指标，目前不开放，指定 COUNT(id)
	 *  - timeDimension: 时间维度，时间分组可选hourly(禁用)、daily、weekly（禁用）、monthly
	 */
	start: Joi.number(),
	end: Joi.number(),
	group: Joi.string().empty('').default(''),
	timeDimension: Joi.string()
		.valid(...Object.values(TIME_DIMENSION))
		.empty('')
		.default('')
}

module.exports = {
	// 呼叫时长
	callDuration: {
		body: {
			...analytics,
			unit: Joi.number().default(60 * 1000)
		}
	},
	// 呼叫结果
	callResult: {
		body: {
			...analytics
		}
	},

	// 呼叫统计
	callStatistics: {
		body: pick(analytics, ['start', 'end', 'group'])
	},

	// 呼叫统计
	alarmStatistics: {
		body: pick(analytics, ['start', 'end', 'group'])
	}
}
