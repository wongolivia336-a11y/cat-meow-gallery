/* =====================================================================
   meow gallery —— 桌宠主进程
   ---------------------------------------------------------------------
   目标：一个透明、置顶、平时完全穿透的窗口，
   泡泡飘在你真实的桌面上、飘在你的代码和 Figma 上面。

   为什么是桌宠而不是屏保：
   屏保是"你不在的时候"出现的，一动鼠标就退出。
   而"工作间隙的休息"这个场景里，你人就坐在电脑前 —— 屏保根本不会启动。
   ===================================================================== */

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const {
  app, BrowserWindow, Tray, Menu, ipcMain, screen, session, protocol, net, nativeImage
} = require("electron");

const ROOT = path.join(__dirname, "..");

/*
  自定义协议，而不是 loadFile()。
  file:// 的 origin 是 null，不算安全上下文，getUserMedia 会被直接拒绝 ——
  录音功能会莫名其妙地静默失败。注册一个 secure 的私有协议才能拿到麦克风。
*/
protocol.registerSchemesAsPrivileged([
  {
    scheme: "meow",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
  }
]);

let win = null;
let tray = null;
let controlMode = false; // true = 控制界面模式，整窗可交互

function serveAppProtocol() {
  protocol.handle("meow", (request) => {
    const url = new URL(request.url);
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const target = path.join(ROOT, rel || "index.html");

    // 路径穿越防护：拼出来的路径必须还在项目目录内
    if (!target.startsWith(ROOT)) {
      return new Response("forbidden", { status: 403 });
    }
    return net.fetch(pathToFileURL(target).toString());
  });
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();

  win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    hasShadow: false,
    // 平时不可聚焦，避免抢走你正在打字的窗口的焦点
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // "screen-saver" 层级能压过大部分全屏应用
  win.setAlwaysOnTop(true, "screen-saver");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadURL("meow://app/index.html");

  // 默认整块穿透。forward:true 很关键：
  // 窗口不接收点击，但仍然把 mousemove 转发给渲染进程，
  // 我们才能知道"鼠标现在是不是悬在某颗泡泡上"。
  win.setIgnoreMouseEvents(true, { forward: true });

  win.on("closed", () => { win = null; });
}

function setControlMode(on) {
  if (!win) return;
  controlMode = on;
  win.setIgnoreMouseEvents(!on, { forward: true });
  win.setFocusable(on);
  if (on) win.focus();
  win.webContents.send("pet:control-mode", on);
  buildTray();
}

/*
  托盘图标。
  ⚠️ 这不是装饰 —— 桌宠没有任务栏图标、没有窗口边框，
  托盘是用户退出这个程序的唯一入口。图标加载失败 = 应用关不掉。
  所以这里逐个候选文件试，并且兜底画一个纯色圆点，绝不允许出现空图标。
*/
function loadTrayIcon() {
  const candidates = ["domi-tray.png", "domi-reference.png"];

  for (const name of candidates) {
    const img = nativeImage.createFromPath(path.join(ROOT, "assets", name));
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
  }

  // 所有素材都没有时的兜底：一个 16x16 的橘色圆点，至少点得到
  const size = 16;
  const canvas = nativeImage.createFromDataURL(
    "data:image/svg+xml;base64," +
      Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
          `<circle cx="8" cy="8" r="7" fill="#f4744d" stroke="#443e37" stroke-width="1.5"/></svg>`
      ).toString("base64")
  );
  return canvas.isEmpty() ? nativeImage.createEmpty() : canvas;
}

function buildTray() {
  const menu = Menu.buildFromTemplate([
    {
      label: controlMode ? "✓ 控制界面" : "打开控制界面",
      click: () => setControlMode(!controlMode)
    },
    { type: "separator" },
    { label: "退出 meow gallery", click: () => app.quit() }
  ]);

  if (!tray) {
    tray = new Tray(loadTrayIcon());
    tray.setToolTip("meow gallery");
    tray.on("click", () => setControlMode(!controlMode));
  }
  tray.setContextMenu(menu);
}

app.whenReady().then(() => {
  serveAppProtocol();

  // 没有这个处理器，渲染进程请求麦克风时会一直挂着不返回
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(permission === "media");
  });

  createWindow();
  buildTray();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

/*
  渲染进程报告"鼠标下有没有泡泡"，主进程据此开关穿透。
  控制界面模式下忽略这个信号 —— 那时整窗都该可交互。
*/
ipcMain.on("pet:interactive", (event, on) => {
  if (!win || controlMode) return;
  win.setIgnoreMouseEvents(!on, { forward: true });
});

ipcMain.on("pet:exit-control", () => setControlMode(false));

// 桌宠没有任务栏图标，关掉最后一个窗口不等于退出 —— 退出走托盘菜单
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
