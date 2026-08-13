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

  // 把画布内桌宠的位置交给主进程。主进程直接读取系统光标做命中，
  // 避免透明穿透窗口来不及收到第一次 pointerdown。
  setPetHitbox(bounds) {
    ipcRenderer.send("pet:hitbox", {
      x: Number(bounds?.x),
      y: Number(bounds?.y),
      radius: Number(bounds?.radius)
    });
  },

  // 主进程通知：进入/退出控制界面模式
  onControlMode(handler) {
    ipcRenderer.on("pet:control-mode", (_event, on) => handler(Boolean(on)));
  },

  onShowtime(handler) {
    ipcRenderer.on("pet:showtime", () => handler());
  },

  onPetCorner(handler) {
    ipcRenderer.on("pet:corner", (_event, corner) => handler(String(corner)));
  },

  onAutoClear(handler) {
    ipcRenderer.on("pet:auto-clear", (_event, minutes) => handler(Number(minutes)));
  },

  onClearBubbles(handler) {
    ipcRenderer.on("pet:clear-bubbles", () => handler());
  },

  onLanguage(handler) {
    ipcRenderer.on("pet:language", (_event, language) => handler(String(language)));
  },

  setLanguage(language) {
    ipcRenderer.send("pet:set-language", language === "zh" ? "zh" : "en");
  },

  openPetMenu() {
    ipcRenderer.send("pet:open-menu");
  },

  showtimeDone() {
    ipcRenderer.send("pet:showtime-done");
  },

  exitControlMode() {
    ipcRenderer.send("pet:exit-control");
  }
});
