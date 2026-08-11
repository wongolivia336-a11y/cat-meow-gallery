/* =====================================================================
   多米桌宠：预渲染姿态 + 轻量状态机
   每个姿态只画一次；逐帧只 drawImage 和少量 transform。
   ===================================================================== */
(function () {
  "use strict";

  const INK = "#443e37";
  const SILVER = "#eeeae5";
  const STRIPE = "#8b8b89";
  const PINK = "#f77ea2";
  const EYE = "#a8c98d";
  const sprites = new Map();
  const mouse = { x: -1, y: -1 };
  let getItems = () => [];
  let mode = "idle";
  let phaseStarted = 0;
  let side = 1;
  let spawned = 0;
  let done = null;
  let showtimeTarget = 0;
  let corner = "bottom-left";
  let controlMode = false;

  const sequence = [
    ["walk-in", 2500], ["settle", 900], ["blow", 3600],
    ["watch", 1100], ["walk-out", 2100]
  ];

  function init(options) {
    getItems = options?.getItems || getItems;
    ["sleep", "look", "walk-1", "walk-2", "sit", "puff", "blow"].forEach(makeSprite);
    window.addEventListener("mousemove", (event) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
    }, { passive: true });
    window.BubbleField?.setOverlayDraw(draw);
  }

  function startShowtime(onDone) {
    if (mode !== "idle") return false;
    mode = "walk-in";
    phaseStarted = performance.now();
    side = Math.random() < 0.5 ? -1 : 1;
    spawned = 0;
    const items = getItems().filter((item) => item.audioUrl || item.audioKey);
    showtimeTarget = window.BubbleField?.ritualTargetCount(items.length) || 0;
    window.BubbleField?.clearAll(true);
    sequence[2][1] = Math.max(4200, showtimeTarget * 420);
    done = onDone || null;
    return true;
  }

  function setCorner(next) {
    if (["top-left", "top-right", "bottom-left", "bottom-right"].includes(next)) corner = next;
  }

  function setControlMode(on) {
    controlMode = Boolean(on);
  }

  function makeSprite(name) {
    if (sprites.has(name)) return sprites.get(name);
    const size = 280;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const c = canvas.getContext("2d");
    c.translate(size / 2, size / 2);
    c.lineCap = "round";
    c.lineJoin = "round";
    drawCat(c, name);
    const sprite = { canvas, size };
    sprites.set(name, sprite);
    return sprite;
  }

  function drawCat(c, pose) {
    const walking = pose.startsWith("walk");
    const sitting = ["sit", "puff", "blow"].includes(pose);
    const holdingWand = pose === "puff" || pose === "blow";
    c.save();
    c.translate(0, walking ? 12 : 22);

    // 身体和尾巴：折耳银渐层，白胸，深色尾尖。
    c.strokeStyle = INK;
    c.fillStyle = SILVER;
    c.lineWidth = 9;
    c.beginPath();
    c.moveTo(54, 54);
    c.bezierCurveTo(112, 44, 112, 118, 65, 112);
    c.bezierCurveTo(14, 126, -50, 124, -65, 78);
    c.bezierCurveTo(-78, 36, -30, 20, 54, 54);
    c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(58, 84);
    c.bezierCurveTo(125, 112, 126, 48, 88, 56);
    c.stroke();

    // 白胸。
    c.fillStyle = "#fdfcf9";
    c.beginPath();
    c.ellipse(-7, 72, 34, 50, 0, 0, Math.PI * 2);
    c.fill();

    // 爪：走路帧故意不对称。
    c.strokeStyle = INK; c.lineWidth = 8; c.fillStyle = "#fdfcf9";
    const lift = pose === "walk-2" ? -12 : 0;
    paw(c, -38, 106 + lift);
    if (holdingWand) {
      c.save();
      c.translate(43, 48);
      c.rotate(-0.42);
      paw(c, 0, 0);
      c.restore();
    } else {
      paw(c, 31, 106 - lift);
    }

    // 圆脸。
    c.fillStyle = SILVER;
    c.beginPath();
    c.ellipse(-6, -20, 79, 69, -0.03, 0, Math.PI * 2);
    c.fill(); c.stroke();

    // 微折耳：耳尖向外，左右不完全对称。
    c.beginPath();
    c.moveTo(-67, -52); c.lineTo(-76, -104); c.lineTo(-35, -75); c.closePath();
    c.fill(); c.stroke();
    c.beginPath();
    c.moveTo(51, -66); c.lineTo(76, -96); c.lineTo(73, -43); c.closePath();
    c.fill(); c.stroke();
    c.strokeStyle = "#d8939e"; c.lineWidth = 6;
    c.beginPath(); c.moveTo(-66, -88); c.lineTo(-43, -70); c.stroke();
    c.beginPath(); c.moveTo(66, -83); c.lineTo(61, -57); c.stroke();

    // 额头银灰细纹与眼线。
    c.strokeStyle = STRIPE; c.lineWidth = 7;
    [-30, -10, 12, 33].forEach((x, i) => {
      c.beginPath(); c.moveTo(x, -76); c.lineTo(x + (i - 1.5) * 3, -52); c.stroke();
    });

    const asleep = pose === "sleep";
    const puff = pose === "puff" || pose === "blow";
    c.strokeStyle = INK; c.fillStyle = EYE; c.lineWidth = 8;
    if (asleep || puff) {
      eyeArc(c, -34, -25); eyeArc(c, 29, -25);
    } else {
      eye(c, -34, -24, pose === "look" ? gaze(-34, -24) : { x: 0, y: 0 });
      eye(c, 29, -24, pose === "look" ? gaze(29, -24) : { x: 0, y: 0 });
    }

    // 粉鼻 + 右上方一撮黑色标记。
    c.fillStyle = "#ef9a9f"; c.strokeStyle = INK; c.lineWidth = 5;
    c.beginPath(); c.moveTo(-10, 6); c.lineTo(8, 5); c.lineTo(-1, 17); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = INK; c.beginPath(); c.ellipse(12, -2, 4, 7, -0.45, 0, Math.PI * 2); c.fill();

    // 招牌 ω 嘴；吹气时向侧面收拢。
    c.strokeStyle = INK; c.lineWidth = 6;
    c.beginPath(); c.moveTo(-1, 17);
    if (puff) c.bezierCurveTo(2, 28, 12, 28, 20, 21);
    else {
      c.bezierCurveTo(-4, 31, -19, 31, -21, 21);
      c.moveTo(-1, 17); c.bezierCurveTo(2, 31, 17, 31, 20, 21);
    }
    c.stroke();

    if (holdingWand) {
      c.strokeStyle = INK; c.lineWidth = 5;
      c.beginPath(); c.moveTo(49, 54); c.lineTo(62, 6); c.stroke();
      c.strokeStyle = PINK; c.lineWidth = 7;
      c.beginPath(); c.arc(65, -5, 14, 0, Math.PI * 2); c.stroke();
    }
    if (pose === "blow") {
      c.strokeStyle = "rgba(68,62,55,.55)"; c.lineWidth = 3;
      c.beginPath(); c.arc(39, 9, 13, -0.7, 0.55); c.stroke();
      c.beginPath(); c.arc(47, 4, 17, -0.6, 0.42); c.stroke();
    }
    c.restore();
  }

  function paw(c, x, y) {
    c.beginPath(); c.ellipse(x, y, 25, 16, 0, 0, Math.PI * 2); c.fill(); c.stroke();
  }

  function eyeArc(c, x, y) {
    c.beginPath(); c.arc(x, y, 17, Math.PI * 0.12, Math.PI * 0.88); c.stroke();
  }

  function eye(c, x, y, offset) {
    c.beginPath(); c.ellipse(x, y, 22, 26, 0, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = INK;
    c.beginPath(); c.ellipse(x + offset.x, y + offset.y, 8, 13, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = EYE;
  }

  function gaze(x, y) {
    if (mouse.x < 0) return { x: 0, y: 0 };
    const home = idlePosition(window.innerWidth, window.innerHeight);
    const dx = mouse.x - (home.x + x * 0.42);
    const dy = mouse.y - (home.y + y * 0.42);
    const length = Math.max(1, Math.hypot(dx, dy));
    return { x: dx / length * 7, y: dy / length * 7 };
  }

  function idlePosition(w, h) {
    // 控制界面的录音按钮在右下角：打开控制界面时强制暂避到左下。
    const active = controlMode ? "bottom-left" : corner;
    const left = active.endsWith("left");
    const top = active.startsWith("top");
    return { x: left ? 82 : w - 82, y: top ? 82 : h - 82 };
  }

  function draw(ctx, now, w, h) {
    if (mode === "idle") return drawIdle(ctx, now, w, h);
    drawShowtime(ctx, now, w, h);
  }

  function drawIdle(ctx, now, w, h) {
    const p = idlePosition(w, h);
    const awake = mouse.x >= 0 && Math.hypot(mouse.x - p.x, mouse.y - p.y) < 260;
    const pose = awake ? "look" : "sleep";
    const breath = awake ? 1 : 1 + Math.sin(now / 900) * 0.018;
    paint(ctx, pose, p.x, p.y, 0.46 * breath, 1);
  }

  function hitTestAt(x, y) {
    const p = idlePosition(window.innerWidth, window.innerHeight);
    const radius = mode === "idle" ? 72 : 115;
    return Math.hypot(x - p.x, y - p.y) <= radius;
  }

  function drawShowtime(ctx, now, w, h) {
    const entry = side < 0 ? -110 : w + 110;
    const stage = side < 0 ? w * 0.32 : w * 0.68;
    const floor = h - 116;
    const elapsed = now - phaseStarted;
    const duration = sequence.find(([name]) => name === mode)?.[1] || 1000;
    const t = Math.min(1, elapsed / duration);
    let x = stage;
    let pose = "sit";

    if (mode === "walk-in") {
      x = mix(entry, stage, ease(t));
      pose = Math.floor(elapsed / 190) % 2 ? "walk-1" : "walk-2";
    } else if (mode === "settle") {
      pose = "sit";
    } else if (mode === "blow") {
      const beat = (elapsed % 900) / 900;
      pose = beat < 0.48 ? "puff" : "blow";
      const wanted = Math.min(showtimeTarget, Math.floor(elapsed / 420) + 1);
      const items = getItems().filter((item) => item.audioUrl || item.audioKey);
      while (spawned < wanted && items.length) {
        const item = items[spawned % items.length];
        const mouthX = x + (side < 0 ? 74 : -74);
        window.BubbleField.spawnAt(item, mouthX, floor - 96, {
          velocity: {
            x: side < 0 ? 1.8 + spawned * 0.035 : -1.8 - spawned * 0.035,
            y: -1.5 - spawned * 0.035
          },
          radiusScale: 1.3
        });
        spawned += 1;
      }
    } else if (mode === "watch") {
      pose = "look";
    } else if (mode === "walk-out") {
      x = mix(stage, entry, ease(t));
      pose = Math.floor(elapsed / 190) % 2 ? "walk-1" : "walk-2";
    }

    ctx.save();
    if (side > 0) { ctx.translate(x, 0); ctx.scale(-1, 1); ctx.translate(-x, 0); }
    paint(ctx, pose, x, floor, 0.78, 1);
    ctx.restore();

    if (t >= 1) advance(now);
  }

  function advance(now) {
    const index = sequence.findIndex(([name]) => name === mode);
    if (index < sequence.length - 1) {
      mode = sequence[index + 1][0];
      phaseStarted = now;
      return;
    }
    mode = "idle";
    phaseStarted = now;
    const callback = done;
    done = null;
    callback?.();
  }

  function paint(ctx, name, x, y, scale, alpha) {
    const sprite = sprites.get(name) || makeSprite(name);
    const size = sprite.size * scale;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.drawImage(sprite.canvas, -size / 2, -size / 2, size, size);
    ctx.restore();
  }

  function mix(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  window.DomiPet = { init, startShowtime, setCorner, setControlMode, hitTestAt };
})();
