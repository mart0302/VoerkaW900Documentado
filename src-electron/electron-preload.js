/**
 * This file is used specifically for security reasons.
 * Here you can access Nodejs stuff and inject functionality into
 * the renderer thread (accessible there through the "window" object)
 *
 * WARNING!
 * If you import anything from node_modules, then make sure that the package is specified
 * in package.json > dependencies and NOT in devDependencies
 *
 * Example (injects window.myAPI.doAThing() into renderer thread):
 *
 *   const { contextBridge } = require('electron')
 *
 *   contextBridge.exposeInMainWorld('myAPI', {
 *     doAThing: () => {}
 *   })
 */
const { contextBridge, ipcRenderer, shell } = require('electron')

contextBridge.exposeInMainWorld('$electron', {
	on: ipcRenderer.on.bind(ipcRenderer),
	once: ipcRenderer.once.bind(ipcRenderer),
	send: ipcRenderer.send.bind(ipcRenderer),
	shell
})
