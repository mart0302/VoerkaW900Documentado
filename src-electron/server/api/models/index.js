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

	/** Relaciones entre tablas de la base de datos */
	// Relación entre eventos y dispositivos (unidireccional: hay demasiados eventos para un dispositivo, 
	// no es adecuado usar clave externa, es mejor escribir una interfaz específica para obtenerlos)
	// Al eliminar dispositivo (tabla principal), se eliminan los eventos (tabla secundaria sigue la eliminación)
	Event.belongsTo(Device, { as: 'source', foreignKey: 'sn', onDelete: 'CASCADE' })

	// Relación entre eventos y transacciones (bidireccional)
	// Por defecto, al eliminar la transacción (tabla principal), el tid del evento se establece como NULL (SET NULL)
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
