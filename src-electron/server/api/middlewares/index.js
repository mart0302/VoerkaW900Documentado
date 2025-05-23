const validate = require('express-validation')
const { pick, padStart } = require('lodash')
const multer = require('multer')
const { CMD } = require('../../config/protocols')
const { encodeMessage } = require('../../../utils.js')

// 过滤数据 & 校验数据 中间件
exports.validate = schema => (req, res, next) => {
	// query 如果为空字符串，表示不查询这个数据，剔除
	Object.keys(req.query).forEach(key => {
		if (req.query[key].trim() === '') {
			delete req.query[key]
		}
	})
	// 过滤数据，如果schema中无定义，数据不传递到下一级中间件
	req.body = pick(req.body, Object.keys(schema.body || {}))
	// 有报错就报错了
	validate(schema)(req, res, next)
}

// multer上传中间件
const getMulter = options => {
	const upload = multer(options).single('file')

	const { limits = {} } = options
	const { fileSize = 200 * 1024, files = 1 } = limits

	let maxSize = Math.floor(fileSize / 1024)
	maxSize = maxSize > 1024 ? Math.floor(fileSize / 1024) + 'MB' : maxSize + 'KB'

	return (req, res, next) => {
		upload(req, res, error => {
			if (error) {
				if (error.message === 'File too large') {
					return next($APIError.BadRequest(req.__('error.upload_file_too_large', maxSize)))
				} else if (error.message === 'Too many files') {
					return next($APIError.BadRequest(req.__('error.upload_too_many_files', files)))
				}
			}
			next(error)
		})
	}
}

// 二次封装上传中间件
exports.upload = options => {
	const { types, maxSize, destination } = options
	const typesArr = types.split(',')
	return getMulter({
		dest: destination,
		limits: { fileSize: maxSize, files: 1 },
		fileFilter(req, file, cb) {
			const { mimetype } = file
			if (!mimetype || !typesArr.some(item => mimetype.indexOf(item) > -1)) {
				return cb($APIError.BadRequest(req.__('error.upload_file_type_error', types)))
			}
			return cb(null, true)
		}
	})
}

// 编码中间件
exports.encode = (req, res, next) => {
	const data = req.body
	const { action } = req.params
	if (!action || typeof action !== 'string') {
		throw $APIError.BadRequest('error.action_error')
	}
	if (['wireless_watch_transparent', 'wireless_transmitter_transparent'].indexOf(action) == -1) {
		next()
	} else {
		let { cmd } = data
		if (!CMD[cmd]) {
			throw $APIError.BadRequest('error.action_error')
		}
		$log.info('encode device, action++++++++++++++', data, action)
		let message = encodeMessage(data)
		req.body = { message }
		next()
	}
}
// 证书认证、软件激活
exports.activated = (req, res, next) => {
	if ($licenseValidResult.result) {
		next()
	} else {
		next(new $APIError.Forbidden())
	}
}
