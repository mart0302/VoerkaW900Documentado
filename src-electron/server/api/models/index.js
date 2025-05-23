module.exports = function (sequelize) {
	const Device = require('./device')(sequelize)
	const Event = require('./event')(sequelize)
	const Transaction = require('./transaction')(sequelize)
	const KeyMap = require('./keyMap')(sequelize)
	const Navigation = require('./navigation')(sequelize, { Device })
	const Package = require('./package')(sequelize)
	const Setting = require('./setting')(sequelize)
	const User = require('./user')(sequelize)
	const Notification = require('./notification')(sequelize)
	// const License = require('./license')(sequelize, { Device })
	const Department = require('./department')(sequelize, { User })
	const Position = require('./position')(sequelize)
	const ScheduleGroup = require('./scheduleGroup')(sequelize)
	const ShiftScheduler = require('./shiftScheduler')(sequelize)

	const TtsAudio = require('./ttsAudio')(sequelize)

	/** 数据库表关联 */
	// 事件与设备关联(单向:因为一个设备的事件是在太多了，不适合做外键，适合写专门的接口获取)
	// 设备删除（主表删除），事件删除（从表跟随删除）
	Event.belongsTo(Device, { as: 'source', foreignKey: 'sn', onDelete: 'CASCADE' })

	// 事件与事务关联(双向)
	// 默认事务删除（主表删除），事件tid设置未NULL（SET NULL）
	Event.belongsTo(Transaction, { as: 'transaction', foreignKey: 'tid' })
	Transaction.hasMany(Event, { as: 'events', foreignKey: 'tid' })
	Transaction.belongsTo(Device, { as: 'source', foreignKey: 'sn', onDelete: 'CASCADE' })

	// License.belongsTo(Device, { as: 'source', foreignKey: 'sn', onDelete: 'CASCADE' })

	return {
		Device,
		Event,
		Transaction,
		KeyMap,
		Navigation,
		Package,
		Setting,
		User,
		Notification,
		// License,
		Department,
		Position,
		ScheduleGroup,
		ShiftScheduler,
		TtsAudio
	}
}
