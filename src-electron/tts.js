const { spawn } = require('child_process')
const EventEmitter = require('events')
const iconv = require('iconv-lite')
const { pick, cloneDeep } = require('lodash')
/**
 * tts 语音播报功能
 *
 * 业务需求：
 *  1. “按顺序”对消息重复播报
 *
 * 功能：
 *  1. 支持同一条消息设置播报次数，即"一条消息可以播报多次"
 *  2. 支持空闲重复播报全部，但有超时，即"一组包含多条消息，每条消息播报多次，一组播完重复执行"，概念由大到小：组->条->次
 *  3. 一组的结束：某个节点（逻辑）触发，可以是超时、或者来新的消息，结束时会等待当前“次”播报结束再结束
 *  4. tts暂停、继续、开始、结束
 *
 * 暴露方法：
 *  1. addTask 添加任务
 *  2. removeTask 移除任务
 *  3. update 更新参数
 *  4. disable 禁用播报
 *  5. enable 启用播报
 *
 * task数据结构：
 *  {
 *    volume, // 音量 0 ~ 100
 *    rate, // 速度 -10 ~ 10
 *    text: '', // 文本
 *    times, // 次数
 *  }
 *
 * 只适用于当前逻辑（w900）
 *
 * 标签：
 *  【未使用】 新版本可能要优化添加的功能
 *  【废弃】 需求变动，弃用，保留，防止需求再次变回
 *
 * TODO: 抽出来形成一个单独的库，并完善d.ts
 */
const PowerShellBin = 'powershell.exe'

const EVENT = {
	TASK_ADDED: 'task_added',
	TASK_PICKED: 'task_picked',
	TASK_START: 'task_start',
	TASK_END: 'task_end',
	TASK_KILLED: 'task_killed',
	GROUP_START: 'group_start',
	GROUP_END: 'group_end',
	MODE_CHANGED: 'mode_changed',
	REMOVE_TASK: 'remove_task'
}

const STATUS = {
	IDLE: 'idle', // 空闲
	PLAYING: 'playing' // 播报中
}

const MODE = {
	STANDARD: 'standard', // 标准模式（消息队列有消息，则播报消息队列）
	LOOP: 'loop' // 循环模式（空闲情况，循环播报历史队列）
}

const DATA_TYPE = {
	TASKS: 'tasks', // 任务队列（或栈）
	HISTORY: 'history' // 历史任务队列
}

const STRUCTURE_TYPE = {
	STACK: 'stack', // 栈，后进先出
	QUEUE: 'queue' // 队列，先进先出
}

class WindowsTTS {
	constructor(options = {}, eventBus) {
		// 基本配置项
		this.options = Object.assign(
			{
				debug: false, // 调试模式，事件打印输出
				enabled: true, // 是否启用“消费”，为false代表不启用不语音播报，不消费任务，但是可以添加任务
				loopEnabled: false, // 启用循环播报
				loopTimeout: 0, // 循环播报超时时间，秒
				loopTurns: 1, // 循环播报的轮数
				sort: 'asc', // 循环模式下，播报顺序，desc最新先播，asc最旧的先播
				times: 1, // 单条消息播报次数
				rate: 0, // 语速, -10 ~ 10
				volume: 100 // 音量, 0 ~ 100
			},
			options
		)

		// 循环播报提示，false不启用
		// this._loopTip = { text: '进入循环播报', times: 1 }
		this._loopTip = false

		// 事件总线实例
		this._eventBus = eventBus || new EventEmitter()

		// 状态
		this._mode = MODE.STANDARD // 标准模式
		this._process = false // 当前播报进程
		this._group = false // 当前播报组
		this._status = STATUS.IDLE // 当前状态
		this._structure = STRUCTURE_TYPE.QUEUE // 当前数据结构模式

		this._data = {} // 数据映射池【未使用】
		this._tasks = [] // 当前未播报任务栈，本次功能先进先出，无权重等限制，所以只需要一个栈就行了
		this._history = [] // 历史任务队列，供空闲时循环播放，注意：只有从历史队列中移除，这个消息才真正退出

		this._index = 0 // 历史索引
		this._turn = 0 // 当前循环播报的轮次

		// 事件监听
		// 单个消息播报结束
		this._eventBus.on(EVENT.TASK_END, payload => {
			// 单次tts任务结束
			this._log('single tts task end', payload)
			// 在标准模式下，如果任务池非空则快马加鞭，结束当前任务组进入下一个任务组【废弃】
			// if (this._mode === MODE.STANDARD && this._tasks.length) {
			//   this._stopPlay()
			// }
			// 更新播放
			this._updatePlay()
		})
		// 模式改变
		this._eventBus.on(EVENT.MODE_CHANGED, payload => {
			if (payload === MODE.LOOP) {
				// 重置轮次
				this._turn = 0
				// 启动循环播报
				this._playTaskInLoop()
			}
		})
	}

	/**
	 * 更新属性
	 * @param {*} param0
	 */
	update(options = {}) {
		const oldOptions = cloneDeep(this.options)
		// 过滤掉之属于options
		options = pick(options, Object.keys(this.options))
		// 覆盖属性
		Object.assign(this.options, options)
		// 特殊处理
		if ('enabled' in options) {
			const { enabled } = options
			// 预先打开，现在关闭
			if (oldOptions.enabled && !enabled) {
				this.disable()
			} else if (!oldOptions.enabled && enabled) {
				// 原先关闭，现在打开
				this.enable()
			}
		}
	}

	/**
	 * 禁用消费
	 */
	disable() {
		this.options.enabled = false
		// 仅结束当前组
		this._stopPlay()
		// this._kill(this._process)
	}

	/**
	 * 启用消费
	 */
	enable() {
		// 将任务队列里的全部迁移到历史队列里
		this._history.push(...this._tasks)
		this._tasks = []
		// 启用
		this.options.enabled = true
		this._playTaskInStandard()
	}

	/**
	 * 任务入栈
	 */
	addTask(task = {}) {
		// 规范化
		task = this._normalizeTask(task)
		// 先删除，不允许id重复
		this.removeTask(task.id)
		// 入栈
		this._tasks.push(task)
		// 通报
		this._broadcast(EVENT.TASK_ADDED, task)
		// 返回任务（包含id，这样才能移除）
		return task
	}

	/**
	 * 移除任务
	 * 从任务队列或历史队列中移除
	 * 假设有条呼叫，还没来得及播报就已经结束了，那就不播报了，从任务队列移除
	 * 假设有条呼叫，已经进入历史队列中，总是在循环模式下被播报到，但是此时结束了，那就从任务队列中移除
	 */
	removeTask(id) {
		// 是否是当前的播放任务
		if (this._group) {
			const { tasks, task } = this._group
			// 如果是现在正在播报的任务强制其次数为0
			if (task.id === id) {
				task.end = true
			}
			const target = tasks.find(item => item.id === id)
			if (target) {
				target.end = true
			}
		}
		// 队列任务
		const tasksIndex = this._tasks.findIndex(item => item.id === id)
		if (tasksIndex > -1) {
			this._broadcast(EVENT.REMOVE_TASK, { target: DATA_TYPE.TASKS, index: tasksIndex })
			this._tasks.splice(tasksIndex, 1)
		}
		// 历史队列任务
		const historyIndex = this._history.findIndex(item => item.id === id)
		if (historyIndex > -1) {
			this._broadcast(EVENT.REMOVE_TASK, { target: DATA_TYPE.HISTORY, index: historyIndex })
			this._history.splice(historyIndex, 1)
		}
	}

	/**
	 * 清除当前的所有任务
	 */
	clean() {
		this._data = {} // 数据映射池【未使用】
		this._tasks = [] // 当前未播报任务栈，本次功能先进先出，无权重等限制，所以只需要一个栈就行了
		this._history = [] // 历史任务队列，供空闲时循环播放，注意：只有从历史队列中移除，这个消息才真正退出

		// this._index = 0 // 历史索引
		this._turn = 0 // 当前循环播报的轮次
	}

	/**
	 * 获取启用状态
	 */
	get enabled() {
		return this.options.enabled
	}

	// 尚未播报的任务列表
	get tasks() {
		return this._tasks
	}

	// 已经播报但未移除的任务列表，等待轮播
	get history() {
		return this._history
	}

	/**
	 * 调试打印
	 */
	_log(...params) {
		const { debug } = this.options
		debug && console.debug(WindowsTTS.name, 'DEBUG', ...params)
	}

	/**
	 * 打印任务
	 * @param {*} task
	 */
	_logTask(func, task) {
		this._log(func, task.id, task.text)
	}

	/**
	 * 打印任务组
	 * @param {*} task
	 */
	_logGroup(func, group) {
		this._log(func, group.id, group.tasks.length)
	}

	/**
	 * 设置模式
	 * @param {*} mode
	 */
	_setMode(mode) {
		if (this._mode !== mode) {
			this._mode = mode
			this._broadcast(EVENT.MODE_CHANGED, mode)
		}
	}

	/**
	 * 通报事件
	 * 原本不打算引入事件总线，但是由于不知道实际播报什么时候结束，所以还是引入事件总线了
	 * 但是后面的处理逻辑就不挪到事件总线里了
	 */
	_broadcast(event, payload) {
		// 触发事件总线信号
		this._eventBus.emit(event, payload)
		// 处理(后面这一部分实际上可以写到事件总线监听的逻辑里，但是要写4处，所以就没有写了)
		switch (event) {
			// 新任务
			case EVENT.TASK_ADDED:
				// 标准模式的进入(有任务队列添加进来)
				this._setMode(MODE.STANDARD)
				// 打印
				this._logTask(event, payload)
				// 新任务进来，判断是否正在播报
				if (!this._group) {
					// 否->创建组，并播报
					this._playTaskInStandard()
				} else {
					// 是->结束当前组【废弃】
					// this._stopPlay()
				}
				break
			// 任务选取
			case EVENT.TASK_PICKED:
				// 打印
				this._logTask(event, payload)
				break
			// 组播报开始
			case EVENT.GROUP_START:
				// 打印
				this._logGroup(event, payload)
				break
			// 组播报结束
			case EVENT.GROUP_END:
				// 打印
				this._logGroup(event, payload)
				// 组播结束，开始下一次组播
				if (this._mode === MODE.STANDARD) {
					this._playTaskInStandard()
				} else {
					// 循环模式下
					this._playTaskInLoop()
				}
				break
			// 模式改变
			case EVENT.MODE_CHANGED:
				this._log(event, payload)
				break
			// 任务移除
			case EVENT.REMOVE_TASK:
				this._log(event, payload)
				break
			default:
				break
		}
	}

	/**
	 * 规范化任务数据
	 */
	_normalizeTask(task = {}) {
		const { volume, rate, times } = this.options
		return Object.assign(
			{
				id: Math.random().toString(36), // id
				index: this._index++, // 全局历史索引，表明先后
				volume, // 音量
				rate, // 速度
				text: '', // 文本
				times, // 次数
				timestamp: Date.now()
			},
			task
		)
	}

	/**
	 * 正常模式下播报
	 */
	_playTaskInStandard() {
		// 如果禁用消费则不消费
		if (!this.options.enabled) {
			return
		}
		// 启动下一个任务组
		const task = this._pickTask()
		if (task) {
			this._startPlay([task])
		}
	}

	/**
	 * 循环模式下
	 */
	_playTaskInLoop() {
		const { enabled, loopEnabled, loopTurns } = this.options
		// 如果禁用消费则不消费
		if (!enabled) {
			return
		}
		// 如果禁用循环则不循环
		if (!loopEnabled) {
			return
		}
		// 如果循环播报的轮次已经超过就不播报了
		if (this._turn >= loopTurns) {
			return
		}
		// 播报历史任务
		let history = cloneDeep(this._history)
		// 排序
		let sort
		if (this.options.sort === 'desc') {
			sort = (a, b) => b.index - a.index
			this._loopTip && history.length && history.push(this._loopTip)
		} else {
			sort = (a, b) => a.index - b.index
			this._loopTip && history.length && history.unshift(this._loopTip)
		}
		history.sort(sort)
		// 进入循环播报之后，每条只播1次
		history.forEach(item => {
			item.times = 1
		})
		// 更新轮次
		this._turn++
		// 启动循环播报
		this._startPlay(history)
	}

	/**
	 * 消费任务
	 */
	_consumeTask(list) {
		if (this._structure === STRUCTURE_TYPE.STACK) {
			return list.pop()
		} else {
			return list.shift()
		}
	}
	/**
	 * 从task中挑选任务进行播报
	 * 如果之后将栈更换为队列或者映射池，或者增加权重控制，只需更改这些接口逻辑
	 */
	_pickTask() {
		const task = this._consumeTask(this._tasks)
		if (task) {
			// 添加进历史队列
			this._history.push(task)
			// 广播
			this._broadcast(EVENT.TASK_PICKED, task)
		} else {
			// 设置模式
			this._setMode(MODE.LOOP)
		}
		return task
	}

	/**
	 * 更新播报
	 */
	_updatePlay() {
		const nowTime = Date.now()
		const group = this._group
		let { id, end, timestamp, timeout, tasks, task, times } = group
		// 是否超时
		if (timeout && nowTime - timestamp > timeout) {
			end = true
		}
		// 是否播报结束
		if ((!tasks || !tasks.length) && !task) {
			end = true
		}
		// 修改group状态
		group.end = end
		// 如果group已经完蛋了就退出
		if (group.end) {
			this._group = false
			// 触发播报结束的事件
			this._broadcast(EVENT.GROUP_END, group)
			return
		}
		// 未结束
		if (!task) {
			task = group.tasks.shift() // 因为历史队列已经被事先排序过了
			times = 0
			group.task = task // 当前进行到哪个任务
			group.times = times // 当前任务已经播报的次数(还没播完)
		}
		// 任务被提前结束
		if (task.end) {
			group.task = false
			return this._updatePlay()
		}
		// 该任务最后一次播报
		if (times >= task.times - 1) {
			group.task = false
		}
		// 累加次数
		group.times = times + 1
		// 播报
		this._speak(id, task)
	}

	/**
	 * 播报任务组
	 */
	_startPlay(tasks = []) {
		// 组播报超时时间
		const timeout = this._mode === MODE.LOOP ? this.options.loopTimeout * 1000 : 0
		// 组
		const group = this._normalizeGroup(tasks, timeout)
		// 通报(先通报再执行，因为开始可以早于实际开始，但是结束必须在实际结束之后)
		this._broadcast(EVENT.GROUP_START, group)
		// 赋值
		this._group = group
		// 启动播报
		this._updatePlay()
	}

	/**
	 * 结束当前任务组播报
	 * 只要组开始，起码已经播报了“1次”，满足停止要求
	 */
	_stopPlay() {
		// 如果当前有播报任务，就标记结束，会自动进入到_updatePlay逻辑中
		if (this._group) {
			this._group.end = true
		}
	}

	/**
	 * 创建任务组
	 * 如果是任务队列里的任务，是单个任务转任务组，无超时；
	 * 如果是历史任务，则是所有历史任务赚任务组，有超时；
	 * @param {*} tasks
	 */
	_normalizeGroup(tasks = [], timeout = 0) {
		return {
			id: Math.random().toString(36),
			timestamp: Date.now(),
			timeout,
			tasks: tasks.slice(),
			task: false,
			times: 0,
			end: false
		}
	}

	_saveWav(text, id, path, callback = () => {}) {
		const { rate, volume } = this.options
		const newPath = path.replace('/', '\\') //F:\\123.wav
		const cmd = [
			'Add-Type -AssemblyName System.speech',
			'$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer',
			'$lan = Get-Culture',
			'$lan =$lan.Name',
			`$speak.SetOutputToWaveFile("${newPath}\\${id}.wav")`,
			'$voice = $speak.GetInstalledVoices($lan).Item(0).VoiceInfo.Name',
			'$speak.SelectVoice($voice)',
			`$speak.Rate = ${rate}`,
			`$speak.Volume = ${volume}`,
			`$speak.Speak([Console]::In.ReadLine())`,
			'$speak.SetOutputToDefaultAudioDevice()',
			'exit'
		]
		const process = spawn(PowerShellBin, [cmd.join(';')])
		process.stdin.end(iconv.encode(text, 'gbk'))
		process.on('close', code => {
			if (code === 0) {
				// 正常播报结束，则继续播报
				callback(code)
			} else {
			}
		})
	}
	/**
	 * 播报
	 * @param {*} param0
	 */
	_speak(groupId, task = {}) {
		let { rate, volume, text = '', id } = task
		if (!text) {
			return false
		}
		rate = this.options.rate
		volume = this.options.volume
		// 构造命令
		const cmd = [
			'Add-Type -AssemblyName System.speech',
			'$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer',
			'$lan = Get-Culture',
			'$lan =$lan.Name',
			'$voice = $speak.GetInstalledVoices($lan).Item(0).VoiceInfo.Name',
			'$speak.SelectVoice($voice)',
			`$speak.Rate = ${rate}`,
			`$speak.Volume = ${volume}`,
			`$speak.Speak([Console]::In.ReadLine())`,
			'exit'
		]
		// 播报
		this._status = STATUS.PLAYING
		const process = spawn(PowerShellBin, [cmd.join(';')])
		process.stdin.end(iconv.encode(text, 'gbk'))
		// 结束回调
		process.on('close', code => {
			// 标记进程结束
			this._process = false
			// 设置状态
			this._status = STATUS.IDLE
			if (code === 0) {
				// 正常播报结束，则继续播报
				this._broadcast(EVENT.TASK_END, {
					groupId,
					id
				})
			} else {
				// 非正常播报结束，属于被强杀
				this._broadcast(EVENT.TASK_KILLED, {
					groupId,
					id
				})
			}
			// 保存文件
			// this._saveWav(rate, volume, text)
		})
		this._process = process
		return process
	}

	/**
	 * 强杀播报【未使用】
	 */
	_kill(process) {
		if (process && typeof process.kill === 'function') {
			const result = process.kill()
			return result
		}
		return false
	}
}

module.exports = WindowsTTS

/*** 测试 */
async function test() {
	const tts = new WindowsTTS()

	for (let index = 0; index < 5; index++) {
		// await new Promise(r => setTimeout(r, 1000))
		// 添加任务
		const task = tts.addTask({ text: `中餐厅01客厅0${index + 1}房请求支援`, times: 2 })
		if (index >= 2) {
			// 移除任务
			// tts.removeTask(task.id)
		}
	}

	// 更新播报器设置
	tts.update({ loopEnabled: true })

	setTimeout(() => {
		console.log('禁用...........')
		tts.disable()
	}, 20 * 1000)

	// 俄语
	// windows 语音识别-语音选择-选择俄语
	// tts.addTask({ text: `Я немного говорю по-русски`, times: 2 })
}

// test()
