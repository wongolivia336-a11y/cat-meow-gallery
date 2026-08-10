/*
  预加载脚本：渲染进程和主进程之间唯一的桥。

  contextIsolation 开着，所以页面里的代码拿不到 Node ——
  只能用下面这个明确列出来的小接口。这是 Electron 的基本安全姿势：
  网页永远不该有能力直接 require('fs')。
*/

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("meowPet", {
  isPet: true,

  // 鼠标是否悬在泡泡上 → 主进程据此开关点击穿透
  setInteractive(on) {
    ipcRenderer.send("pet:interactive", Boolean(on));
  },

  // 主进程通知：进入/退出控制界面模式
  onControlMode(handler) {
    ipcRenderer.on("pet:control-mode", (_event, on) => handler(Boolean(on)));
  },

  exitControlMode() {
    ipcRenderer.send("pet:exit-control");
  }
});
