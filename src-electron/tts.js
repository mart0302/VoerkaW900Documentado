const { spawn } = require("child_process");
const EventEmitter = require("events");
const iconv = require("iconv-lite");
const { pick, cloneDeep } = require("lodash");
/**
 * Función de transmisión de voz tts
 *
 *Requisitos comerciales:
 * 1. Repita el mensaje "en secuencia"
 *
 * Función:
 * 1. Permite configurar el número de veces que se puede transmitir un mensaje, es decir, "un mensaje se puede transmitir varias veces".
 * 2. Admite la transmisión repetida inactiva de todos los mensajes, pero con tiempo de espera, es decir, "un grupo contiene varios mensajes, cada mensaje se transmite varias veces y un grupo se repite después de la transmisión". El concepto es, de mayor a menor, grupo->elemento->tiempo.
 * 3. Fin de un grupo: se activa un nodo (lógica), que puede ser un tiempo de espera o un nuevo mensaje. Cuando finalice, esperará a que finalice la transmisión actual antes de finalizar.
 * 4. tts pausa, continuar, iniciar, finalizar
 *
 * Método de exposición:
 * 1. addTask agrega una tarea
 * 2. removeTask elimina la tarea
 * 3. actualizar parámetros de actualización
 * 4. deshabilitar deshabilitar transmisión
 * 5. habilitar Habilitar transmisión
 *
 * Estructura de datos de la tarea:
 * {
 * volumen, // volumen 0 ~ 100
 * tasa, // velocidad -10 ~ 10
 * texto: '', // texto
 * veces, // veces
 * }
 *
 *Solo aplicable a la lógica actual (w900)
 *
 * Etiqueta:
 * [Sin usar] Es posible que las nuevas versiones deban optimizarse y agregar funciones.
 * [Abandonar] Los requisitos cambian, abandonan, conservan y evitan que los requisitos vuelvan a cambiar.
 *
 * TODO: Extraerlo en una biblioteca separada y mejorar d.ts
 */
const PowerShellBin = "powershell.exe";

const EVENT = {
    TASK_ADDED: "task_added",
    TASK_PICKED: "task_picked",
    TASK_START: "task_start",
    TASK_END: "task_end",
    TASK_KILLED: "task_killed",
    GROUP_START: "group_start",
    GROUP_END: "group_end",
    MODE_CHANGED: "mode_changed",
    REMOVE_TASK: "remove_task",
};

const STATUS = {
    IDLE: "idle", // inactivo
    PLAYING: "playing", // En el aire
};

const MODE = {
    STANDARD: "standard", // Modo estándar (si hay un mensaje en la cola de mensajes, se transmitirá desde la cola de mensajes)
    LOOP: "loop", // Modo cíclico (estado inactivo, cola de historial de transmisión cíclica)
};

const DATA_TYPE = {
    TASKS: "tasks", // Cola de tareas (o pila)
    HISTORY: "history", // Cola de tareas históricas
};

const STRUCTURE_TYPE = {
    STACK: "stack", // Pila, LIFO
    QUEUE: "queue", // Cola, primero en entrar, primero en salir
};

class WindowsTTS {
    constructor(options = {}, eventBus) {
        // Elementos de configuración básicos
        this.options = Object.assign(
            {
                debug: false, // Modo de depuración, salida de impresión de eventos
                enabled: true, // Si habilitar o no el “consumo”. Si es falso, significa que no está habilitado, no hay transmisión de voz, no hay tarea de consumo, pero se pueden agregar tareas.
                loopEnabled: false, // Habilitar bucle
                loopTimeout: 0, // Tiempo de espera de transmisión de bucle, segundos
                loopTurns: 1, // Número de rondas de transmisión en bucle
                sort: "asc", // En el modo de bucle, el orden de transmisión es: la última descripción primero, y el ascenso más antiguo primero.
                times: 1, // Número de veces que se transmite un solo mensaje
                rate: 0, // Velocidad del habla, -10 ~ 10
                volume: 100, // volumen, 0 ~ 100
            },
            options
        );

        // Aviso de bucle, falso no está habilitado
        // this._loopTip = { text: 'Entrar en la transmisión en bucle', times: 1 }
        this._loopTip = false;

        // Instancia de bus de eventos
        this._eventBus = eventBus || new EventEmitter();

        // estado
        this._mode = MODE.STANDARD; // Modo estándar
        this._process = false; // Proceso de transmisión actual
        this._group = false; // Grupo de difusión actual
        this._status = STATUS.IDLE; // Estado actual
        this._structure = STRUCTURE_TYPE.QUEUE; // Modo de estructura de datos actual

        this._data = {}; // Grupo de mapeo de datos [no utilizado]
        this._tasks = []; // Actualmente no se informa sobre la pila de tareas. Esta función es "primero en entrar, primero en salir" y no hay restricción de peso, por lo que solo se necesita una pila.
        this._history = []; // Cola de tareas históricas, para reproducción en bucle cuando está inactivo. Nota: Solo cuando se elimine de la cola histórica, el mensaje se saldrá verdaderamente.

        this._index = 0; // Índice de historia
        this._turn = 0; // La ronda actual de transmisión en bucle

        // Escucha de eventos
        // Fin de la transmisión de un solo mensaje
        this._eventBus.on(EVENT.TASK_END, (payload) => {
            // Tarea tts única completada
            this._log("single tts task end", payload);
            // En el modo estándar, si el grupo de tareas no está vacío, se acelerará y finalizará el grupo de tareas actual y entrará en el siguiente grupo de tareas [abandonado]
            // si (este._modo === MODO.ESTÁNDAR && este._tareas.longitud) {
            // esto._stopPlay()
            // }
            // Actualizar reproducción
            this._updatePlay();
        });
        // Cambio de modo
        this._eventBus.on(EVENT.MODE_CHANGED, (payload) => {
            if (payload === MODE.LOOP) {
                // Reiniciar ronda
                this._turn = 0;
                // Iniciar transmisión de bucle
                this._playTaskInLoop();
            }
        });
    }

    /**
     * Actualizar propiedades
     * @param {*} param0
     */
    update(options = {}) {
        const oldOptions = cloneDeep(this.options);
        // Filtrar los que pertenecen a las opciones
        options = pick(options, Object.keys(this.options));
        // Propiedades de anulación
        Object.assign(this.options, options);
        // Trato especial
        if ("enabled" in options) {
            const { enabled } = options;
            // Trato especial
            if (oldOptions.enabled && !enabled) {
                this.disable();
            } else if (!oldOptions.enabled && enabled) {
                // Anteriormente cerrado, ahora abierto
                this.enable();
            }
        }
    }

    /**
     * Desactivar el consumo
     */
    disable() {
        this.options.enabled = false;
        // Finalizar sólo el grupo actual
        this._stopPlay();
        // this._kill(this._process)
    }

    /**
     * Habilitar el consumo
     */
    enable() {
        // Migrar todas las tareas de la cola de tareas a la cola de historial
        this._history.push(...this._tasks);
        this._tasks = [];
        // Permitir
        this.options.enabled = true;
        this._playTaskInStandard();
    }

    /**
     * Empujar tareas a la pila
     */
    addTask(task = {}) {
        // Normalización
        task = this._normalizeTask(task);
        // Eliminar primero, no permitir identificaciones duplicadas
        this.removeTask(task.id);
        // Empujar
        this._tasks.push(task);
        // Boletín
        this._broadcast(EVENT.TASK_ADDED, task);
        // Devuelve la tarea (incluido el id para que pueda eliminarse)
        return task;
    }

    /**
     * Eliminar una tarea
     * Eliminar de la cola de tareas o del historial
     * Supongamos que una llamada finaliza antes de transmitirse, entonces no se transmitirá y se eliminará de la cola de tareas.
     * Supongamos que una llamada ha entrado en la cola de historial y siempre se informa en el modo de bucle, pero finaliza ahora; entonces, elimínela de la cola de tareas.
     */
    removeTask(id) {
        // ¿Es la tarea de reproducción actual?
        if (this._group) {
            const { tasks, task } = this._group;
            // Si se trata de una tarea que se está informando actualmente, fuerza su conteo a 0
            if (task.id === id) {
                task.end = true;
            }
            const target = tasks.find((item) => item.id === id);
            if (target) {
                target.end = true;
            }
        }
        // Tareas en cola
        const tasksIndex = this._tasks.findIndex((item) => item.id === id);
        if (tasksIndex > -1) {
            this._broadcast(EVENT.REMOVE_TASK, {
                target: DATA_TYPE.TASKS,
                index: tasksIndex,
            });
            this._tasks.splice(tasksIndex, 1);
        }
        // Tareas de la cola de historial
        const historyIndex = this._history.findIndex((item) => item.id === id);
        if (historyIndex > -1) {
            this._broadcast(EVENT.REMOVE_TASK, {
                target: DATA_TYPE.HISTORY,
                index: historyIndex,
            });
            this._history.splice(historyIndex, 1);
        }
    }

    /**
     * Borrar todas las tareas actuales
     */
    clean() {
        this._data = {}; // Grupo de mapeo de datos [no utilizado]
        this._tasks = []; // Actualmente no se informa sobre la pila de tareas. Esta función es "primero en entrar, primero en salir" y no hay restricción de peso, por lo que solo se necesita una pila.
        this._history = []; // Cola de tareas históricas, para reproducción en bucle cuando está inactivo. Nota: Solo cuando se elimine de la cola histórica, el mensaje se saldrá verdaderamente.

        // this._index = 0 // Índice de historia
        this._turn = 0; // La ronda actual de transmisión en bucle
    }

    /**
     * Obtener el estado habilitado
     */
    get enabled() {
        return this.options.enabled;
    }

    // Lista de tareas que aún no han sido anunciadas
    get tasks() {
        return this._tasks;
    }

    // Una lista de tareas que se han anunciado pero no se han eliminado y que esperan ser jugadas en rotación.
    get history() {
        return this._history;
    }

    /**
     * Impresión de depuración
     */
    _log(...params) {
        const { debug } = this.options;
        debug && console.debug(WindowsTTS.name, "DEBUG", ...params);
    }

    /**
     * Tareas de impresión
     * @param {*} task
     */
    _logTask(func, task) {
        this._log(func, task.id, task.text);
    }

    /**
     * Grupo de tareas de impresión
     * @param {*} task
     */
    _logGroup(func, group) {
        this._log(func, group.id, group.tasks.length);
    }

    /**
     * Modo de configuración
     * @param {*} mode
     */
    _setMode(mode) {
        if (this._mode !== mode) {
            this._mode = mode;
            this._broadcast(EVENT.MODE_CHANGED, mode);
        }
    }

    /**
     * Reportar un incidente
     * Originalmente, no planeamos introducir un bus de eventos, pero como no sabíamos cuándo terminaría la transmisión real, de todos modos introducimos un bus de eventos.
     * Pero la lógica de procesamiento posterior no se moverá al bus de eventos.
     */
    _broadcast(event, payload) {
        // Activación de una señal de bus de eventos
        this._eventBus.emit(event, payload);
        // Procesamiento (la última parte en realidad se puede escribir en la lógica de monitoreo del bus de eventos, pero debe escribirse en 4 lugares, por lo que no está escrita)
        switch (event) {
            // Nueva misión
            case EVENT.TASK_ADDED:
                // Ingresar al modo estándar (con cola de tareas agregada)
                this._setMode(MODE.STANDARD);
                // Imprimir
                this._logTask(event, payload);
                // Entra una nueva tarea, determine si se está transmitiendo
                if (!this._group) {
                    // No->Crear grupo y anunciar
                    this._playTaskInStandard();
                } else {
                    // Sí->Finalizar grupo actual [Abandonado]
                    // this._stopPlay()
                }
                break;
            // Selección de tareas
            case EVENT.TASK_PICKED:
                // Imprimir
                this._logTask(event, payload);
                break;
            // Comienza la transmisión grupal
            case EVENT.GROUP_START:
                // Imprimir
                this._logGroup(event, payload);
                break;
            // Fin de la transmisión grupal
            case EVENT.GROUP_END:
                // Imprimir
                this._logGroup(event, payload);
                // La multidifusión finaliza y comienza la siguiente multidifusión
                if (this._mode === MODE.STANDARD) {
                    this._playTaskInStandard();
                } else {
                    // En modo bucle
                    this._playTaskInLoop();
                }
                break;
            // Cambio de modo
            case EVENT.MODE_CHANGED:
                this._log(event, payload);
                break;
            // Eliminación de tareas
            case EVENT.REMOVE_TASK:
                this._log(event, payload);
                break;
            default:
                break;
        }
    }

    /**
     * Normalizar los datos de la tarea
     */
    _normalizeTask(task = {}) {
        const { volume, rate, times } = this.options;
        return Object.assign(
            {
                id: Math.random().toString(36), // id
                index: this._index++, // Índice de historia global, indicando el orden
                volume, // volumen
                rate, // velocidad
                text: "", // texto
                times, // frecuencia
                timestamp: Date.now(),
            },
            task
        );
    }

    /**
     * Transmisión en modo normal
     */
    _playTaskInStandard() {
        // Si el consumo está deshabilitado, no hay consumo
        if (!this.options.enabled) {
            return;
        }
        // Iniciar el próximo grupo de tareas
        const task = this._pickTask();
        if (task) {
            this._startPlay([task]);
        }
    }

    /**
     * En modo bucle
     */
    _playTaskInLoop() {
        const { enabled, loopEnabled, loopTurns } = this.options;
        // Si el consumo está deshabilitado, no hay consumo
        if (!enabled) {
            return;
        }
        // Si el bucle está deshabilitado, no se produce ningún bucle.
        if (!loopEnabled) {
            return;
        }
        // Si se ha excedido la ronda de transmisión del bucle, no se transmitirá.
        if (this._turn >= loopTurns) {
            return;
        }
        // Informar sobre tareas históricas
        let history = cloneDeep(this._history);
        // Clasificación
        let sort;
        if (this.options.sort === "desc") {
            sort = (a, b) => b.index - a.index;
            this._loopTip && history.length && history.push(this._loopTip);
        } else {
            sort = (a, b) => a.index - b.index;
            this._loopTip && history.length && history.unshift(this._loopTip);
        }
        history.sort(sort);
        // Después de ingresar a la transmisión en bucle, cada mensaje solo se reproducirá una vez
        history.forEach((item) => {
            item.times = 1;
        });
        // Ronda de actualización
        this._turn++;
        // Iniciar transmisión de bucle
        this._startPlay(history);
    }

    /**
     * Tareas de consumo
     */
    _consumeTask(list) {
        if (this._structure === STRUCTURE_TYPE.STACK) {
            return list.pop();
        } else {
            return list.shift();
        }
    }
    /**
     * Seleccione una tarea de la lista de tareas para informar
     * Si más adelante cambia la pila a una cola o un grupo de mapeo, o agrega control de peso, solo necesita cambiar estas lógicas de interfaz.
     */
    _pickTask() {
        const task = this._consumeTask(this._tasks);
        if (task) {
            // Agregar a la cola del historial
            this._history.push(task);
            // transmisión
            this._broadcast(EVENT.TASK_PICKED, task);
        } else {
            // Modo de configuración
            this._setMode(MODE.LOOP);
        }
        return task;
    }

    /**
     * Anuncio de actualización
     */
    _updatePlay() {
        const nowTime = Date.now();
        const group = this._group;
        let { id, end, timestamp, timeout, tasks, task, times } = group;
        // Se acabó el tiempo
        if (timeout && nowTime - timestamp > timeout) {
            end = true;
        }
        // ¿Se acabó la transmisión?
        if ((!tasks || !tasks.length) && !task) {
            end = true;
        }
        // Modificar el estado del grupo
        group.end = end;
        // Si el grupo ha terminado, salir
        if (group.end) {
            this._group = false;
            // Evento que desencadena el final de la transmisión
            this._broadcast(EVENT.GROUP_END, group);
            return;
        }
        // Aún no terminado
        if (!task) {
            task = group.tasks.shift(); // Porque la cola del historial se ha ordenado de antemano
            times = 0;
            group.task = task; // ¿Qué tarea se está realizando actualmente?
            group.times = times; // El número de veces que se ha transmitido la tarea actual (aún no se ha completado)
        }
        // La tarea fue terminada antes de tiempo
        if (task.end) {
            group.task = false;
            return this._updatePlay();
        }
        // La última transmisión de esta misión.
        if (times >= task.times - 1) {
            group.task = false;
        }
        // Tiempos acumulados
        group.times = times + 1;
        // Transmisión
        this._speak(id, task);
    }

    /**
     * Grupo de trabajo sobre radiodifusión
     */
    _startPlay(tasks = []) {
        // Tiempo de espera de transmisión grupal
        const timeout =
            this._mode === MODE.LOOP ? this.options.loopTimeout * 1000 : 0;
        // Grupo
        const group = this._normalizeGroup(tasks, timeout);
        // Notificación (notificación antes de la ejecución, porque el inicio puede ser anterior al inicio real, pero el final debe ser posterior al final real)
        this._broadcast(EVENT.GROUP_START, group);
        // Asignación
        this._group = group;
        // Iniciar transmisión
        this._updatePlay();
    }

    /**
     * Finalizar la transmisión del grupo de tareas actual
     *Siempre que el grupo comience, se habrá transmitido al menos "1 vez", cumpliendo con el requisito de parada
     */
    _stopPlay() {
        // Si actualmente hay una tarea de transmisión, márquela como finalizada e ingrese automáticamente la lógica _updatePlay
        if (this._group) {
            this._group.end = true;
        }
    }

    /**
     * Crear un grupo de tareas
     * Si se trata de una tarea en la cola de tareas, es una tarea única para un grupo de tareas, sin tiempo de espera;
     * Si se trata de una tarea histórica, se agruparán todas las tareas históricas, con tiempos de espera;
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
            end: false,
        };
    }

    _saveWav(text, id, path, callback = () => {}) {
        const { rate, volume } = this.options;
        const newPath = path.replace("/", "\\"); //F:\\123.wav
        const cmd = [
            "Add-Type -AssemblyName System.speech",
            "$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer",
            "$lan = Get-Culture",
            "$lan =$lan.Name",
            `$speak.SetOutputToWaveFile("${newPath}\\${id}.wav")`,
            "$voice = $speak.GetInstalledVoices($lan).Item(0).VoiceInfo.Name",
            "$speak.SelectVoice($voice)",
            `$speak.Rate = ${rate}`,
            `$speak.Volume = ${volume}`,
            `$speak.Speak([Console]::In.ReadLine())`,
            "$speak.SetOutputToDefaultAudioDevice()",
            "exit",
        ];
        const process = spawn(PowerShellBin, [cmd.join(";")]);
        process.stdin.end(iconv.encode(text, "gbk"));
        process.on("close", (code) => {
            if (code === 0) {
                // La transmisión normal finaliza, luego continúa la transmisión
                callback(code);
            } else {
            }
        });
    }
    /**
     * Transmisión
     * @param {*} param0
     */
    _speak(groupId, task = {}) {
        let { rate, volume, text = "", id } = task;
        if (!text) {
            return false;
        }
        rate = this.options.rate;
        volume = this.options.volume;
        // Comando de Construcción
        const cmd = [
            "Add-Type -AssemblyName System.speech",
            "$speak = New-Object System.Speech.Synthesis.SpeechSynthesizer",
            "$lan = Get-Culture",
            "$lan =$lan.Name",
            "$voice = $speak.GetInstalledVoices($lan).Item(0).VoiceInfo.Name",
            "$speak.SelectVoice($voice)",
            `$speak.Rate = ${rate}`,
            `$speak.Volume = ${volume}`,
            `$speak.Speak([Console]::In.ReadLine())`,
            "exit",
        ];
        // Transmisión
        this._status = STATUS.PLAYING;
        const process = spawn(PowerShellBin, [cmd.join(";")]);
        process.stdin.end(iconv.encode(text, "gbk"));
        // Finalizar devolución de llamada
        process.on("close", (code) => {
            // Marcar el proceso como finalizado
            this._process = false;
            // Establecer estado
            this._status = STATUS.IDLE;
            if (code === 0) {
                // La transmisión normal finaliza, luego continúa la transmisión
                this._broadcast(EVENT.TASK_END, {
                    groupId,
                    id,
                });
            } else {
                // Finalizó la transmisión anormal, lo que significa ser asesinado a la fuerza.
                this._broadcast(EVENT.TASK_KILLED, {
                    groupId,
                    id,
                });
            }
            // Guardar el archivo
            // this._saveWav(rate, volume, text)
        });
        this._process = process;
        return process;
    }

    /**
     * Informe de muerte forzada 【No utilizado】
     */
    _kill(process) {
        if (process && typeof process.kill === "function") {
            const result = process.kill();
            return result;
        }
        return false;
    }
}

module.exports = WindowsTTS;

/*** prueba */
async function test() {
    const tts = new WindowsTTS();

    for (let index = 0; index < 5; index++) {
        // await new Promise(r => setTimeout(r, 1000))
        // Agregar una tarea
        const task = tts.addTask({
            text: `中餐厅01客厅0${index + 1}房请求支援`,
            times: 2,
        });
        if (index >= 2) {
            // Eliminar una tarea
            // tts.removeTask(task.id)
        }
    }

    // Actualizar la configuración del anunciador
    tts.update({ loopEnabled: true });

    setTimeout(() => {
        console.log("禁用...........");
        tts.disable();
    }, 20 * 1000);

    // Ruso
    // Reconocimiento de voz de Windows - Selección de voz - Seleccionar ruso
    // tts.addTask({ text: `Hablo un poco de ruso`, times: 2 })
}

// test()
