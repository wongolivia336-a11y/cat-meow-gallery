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
  const POSITION_KEY = "meow-gallery:pet-position";
  /*
    ------------------------------------------------------------------
    姿态帧
    ------------------------------------------------------------------
    原来是把 1536x1024 的整张精灵图按 3x2 刚性网格切。
    但这张素材的内容并不老实待在格子里：

      · walk 那只猫实际占 x 70..544，而格子只到 512 —— 尾巴被切掉 32px
      · blow 的两颗泡泡横跨在 x 998..1077，格子边界在 1024 —— 半颗在隔壁
      · 为了捞回那半颗泡泡加的补丁条取 x 952..1024，
        而隔壁那只猫延伸到 994 —— 于是把人家的黑色尾尖也一起贴了过来

    所以改成离线按连通域切好的独立帧（scripts/extract-frames.ps1），
    运行时不再有任何取样魔法数字。

    anchor 是身体的脚底中心，换姿态时以它对齐，猫才不会上下跳。
    数值来自切图脚本，同时写在 assets/domi/frames.json 里。
  */
  const FRAME_DATA = {
    sleep: { w: 461, h: 288, ax: 230, ay: 279 },
    sit:   { w: 405, h: 448, ax: 202, ay: 439 },
    paw:   { w: 394, h: 432, ax: 196, ay: 423 },
    walk:  { w: 490, h: 365, ax: 244, ay: 356 },
    puff:  { w: 396, h: 426, ax: 198, ay: 417 },
    blow:  { w: 473, h: 388, ax: 274, ay: 379 }
  };

  // 状态机里用的旧名字 -> 实际帧
  const POSE_ALIAS = {
    look: "sit", lick: "paw", "walk-1": "walk", "walk-2": "walk"
  };

  // 源图一个像素等于多少屏幕像素：旧代码把 512 的格子画成 280，沿用同一比例
  const PX_PER_SOURCE = 280 / 512;

  // 参考身高（sit 帧）。六个姿态共用它算地面线，换姿态才不会上下跳。
  const REFERENCE_HEIGHT = 448;

  /*
    吹泡棒棒口相对脚底 anchor 的偏移（源像素）。
    是从 assets/domi/blow.png 里按颜色扫出来的实测值，不是估的：
    棒子的红色环 bbox X 106..174 / Y 142..218，环心 (137,166)，anchor (274,379)。
    泡泡必须从这里冒出来 —— 之前写死 ±112px，泡泡飘在猫头顶上，
    看起来不像"吹"出来的，像"凭空出现"。
  */
  const WAND_OFFSET = { x: -137, y: -216 };

  const frames = new Map();
  const mouse = { x: -1, y: -1 };
  let getItems = () => [];
  let mode = "idle";
  let phaseStarted = 0;
  let side = 1;
  let spawned = 0;
  let done = null;
  let showtimeTarget = 0;
  let showtimeRadiusScale = 1;
  let corner = "bottom-left";
  let controlMode = false;
  let sheetReady = false;
  let customPosition = loadPosition();
  let drag = null;
  let wander = null;
  let nextWanderAt = 0;
  let lastPetPosition = null;
  let lastHitboxReport = 0;

  const sequence = [
    ["walk-in", 2500], ["settle", 900], ["blow", 3600],
    ["watch", 1100], ["walk-out", 2100]
  ];

  function init(options) {
    getItems = options?.getItems || getItems;
    ["sleep", "look", "walk-1", "walk-2", "sit", "puff", "blow"].forEach(makeSprite);
    Object.keys(FRAME_DATA).forEach((pose) => {
      const img = new Image();
      const entry = { img, ready: false };
      img.addEventListener("load", () => {
        entry.ready = true;
        sheetReady = true; // 至少有一帧可用就不再画程序化占位
      });
      img.src = `assets/domi/${pose}.png`;
      frames.set(pose, entry);
    });
    window.addEventListener("mousemove", (event) => {
      mouse.x = event.clientX;
      mouse.y = event.clientY;
    }, { passive: true });
    window.BubbleField?.setOverlayDraw(draw);
    scheduleWander(performance.now(), 7000, 15000);
  }

  function startShowtime(onDone) {
    if (mode !== "idle") return false;
    const items = getItems().filter((item) => item.audioUrl || item.audioKey);
    if (!items.length) {
      window.BubbleField?.clearAll(true);
      onDone?.();
      return false;
    }
    mode = "walk-in";
    phaseStarted = performance.now();
    side = Math.random() < 0.5 ? -1 : 1;
    spawned = 0;
    showtimeTarget = window.BubbleField?.ritualTargetCount(items.length) || 0;
    showtimeRadiusScale = window.BubbleField?.ritualRadiusScale(items.length) || 1;
    window.BubbleField?.clearAll(true);
    sequence[2][1] = Math.max(4200, showtimeTarget * 420);
    done = onDone || null;
    return true;
  }

  function setCorner(next) {
    if (["top-left", "top-right", "bottom-left", "bottom-right"].includes(next)) {
      corner = next;
      customPosition = null;
      localStorage.removeItem(POSITION_KEY);
      wander = null;
      scheduleWander(performance.now(), 5000, 11000);
    }
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
    if (!controlMode && customPosition) {
      return { x: customPosition.x * w, y: customPosition.y * h };
    }
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
    let p = idlePosition(w, h);
    if (!controlMode && !drag && !wander && now >= nextWanderAt) startWander(now, w, h, p);
    if (wander) {
      const progress = Math.min(1, (now - wander.started) / wander.duration);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      p = { x: mix(wander.from.x, wander.to.x, eased), y: mix(wander.from.y, wander.to.y, eased) };
      lastPetPosition = p;
      reportHitbox(p, 78);
      customPosition = { x: p.x / w, y: p.y / h };
      const step = (now - wander.started) / 135;
      const bob = Math.abs(Math.sin(step * Math.PI)) * 5;
      const lean = Math.sin(step * Math.PI) * 0.035;
      const facing = wander.to.x >= wander.from.x ? 1 : -1;
      paintWalk(ctx, p.x, p.y - bob, 0.46, 1, step, { facing, rotate: lean });
      if (progress >= 1) finishWander(now);
      return;
    }
    const awake = mouse.x >= 0 && Math.hypot(mouse.x - p.x, mouse.y - p.y) < 260;
    lastPetPosition = p;
    reportHitbox(p, 78);
    const lickMoment = Math.floor(now / 1400) % 13 === 10;
    const pose = awake ? "look" : lickMoment ? "lick" : "sleep";
    const breath = awake ? 1 : 1 + Math.sin(now / 900) * 0.018;
    const dragLift = drag ? 7 : 0;
    paint(ctx, drag ? "look" : pose, p.x, p.y - dragLift, 0.46 * breath, 1, { rotate: drag ? -0.035 : 0 });
    if (!awake && !drag && pose === "sleep") drawSleepMarks(ctx, now, p.x, p.y);
  }

  function startWander(now, w, h, from) {
    const margin = 86;
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.min(300, Math.max(120, Math.min(w, h) * (0.18 + Math.random() * 0.16)));
    const to = {
      x: Math.max(margin, Math.min(w - margin, from.x + Math.cos(angle) * distance)),
      y: Math.max(margin, Math.min(h - margin, from.y + Math.sin(angle) * distance * 0.55))
    };
    const actualDistance = Math.hypot(to.x - from.x, to.y - from.y);
    if (actualDistance < 64) return scheduleWander(now, 2500, 5000);
    wander = { from: { ...from }, to, started: now, duration: Math.max(1800, actualDistance / 0.075) };
  }

  function finishWander(now) {
    customPosition = { x: wander.to.x / window.innerWidth, y: wander.to.y / window.innerHeight };
    localStorage.setItem(POSITION_KEY, JSON.stringify(customPosition));
    wander = null;
    scheduleWander(now, 12000, 26000);
  }

  function scheduleWander(now, minimum, maximum) {
    nextWanderAt = now + minimum + Math.random() * (maximum - minimum);
  }

  function drawSleepMarks(ctx, now, x, y) {
    ctx.save();
    ctx.font = '700 18px "Comic Sans MS", cursive';
    ctx.textAlign = "center";
    ctx.fillStyle = INK;
    for (let index = 0; index < 3; index += 1) {
      const cycle = ((now / 2300) + index * 0.26) % 1;
      const alpha = Math.sin(cycle * Math.PI) * 0.58;
      const drift = Math.sin(cycle * Math.PI * 2 + index) * 4;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `700 ${14 + index * 4}px "Comic Sans MS", cursive`;
      ctx.save();
      ctx.translate(x + 43 + index * 13 + drift, y - 55 - cycle * 34 - index * 7);
      ctx.rotate(-0.12 + index * 0.05);
      ctx.fillText(index === 0 ? "z" : "Z", 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }

  function hitTestAt(x, y) {
    const p = lastPetPosition || idlePosition(window.innerWidth, window.innerHeight);
    const radius = mode === "idle" ? 72 : 115;
    return Math.hypot(x - p.x, y - p.y) <= radius;
  }

  function reportHitbox(position, radius) {
    const now = performance.now();
    if (now - lastHitboxReport < 48) return;
    lastHitboxReport = now;
    window.meowPet?.setPetHitbox?.({ x: position.x, y: position.y, radius });
  }

  function beginDrag(x, y) {
    if (!hitTestAt(x, y)) return false;
    if (mode !== "idle") {
      mode = "idle";
      phaseStarted = performance.now();
      const callback = done;
      done = null;
      callback?.();
    }
    const p = lastPetPosition || idlePosition(window.innerWidth, window.innerHeight);
    wander = null;
    drag = { dx: x - p.x, dy: y - p.y };
    return true;
  }

  function dragTo(x, y) {
    if (!drag) return false;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const px = Math.max(76, Math.min(w - 76, x - drag.dx));
    const py = Math.max(76, Math.min(h - 76, y - drag.dy));
    customPosition = { x: px / w, y: py / h };
    return true;
  }

  function endDrag() {
    if (!drag) return false;
    drag = null;
    if (customPosition) localStorage.setItem(POSITION_KEY, JSON.stringify(customPosition));
    scheduleWander(performance.now(), 9000, 18000);
    return true;
  }

  function loadPosition() {
    try {
      const value = JSON.parse(localStorage.getItem(POSITION_KEY));
      if (Number.isFinite(value?.x) && Number.isFinite(value?.y)) {
        return { x: Math.max(0.04, Math.min(0.96, value.x)), y: Math.max(0.06, Math.min(0.94, value.y)) };
      }
    } catch (error) {}
    return null;
  }

  function drawShowtime(ctx, now, w, h) {
    const entry = side < 0 ? -110 : w + 110;
    const stage = side < 0 ? w * 0.32 : w * 0.68;
    /*
      这是桌宠的中心线，不是地面线。
      地面在它下方 (448/2)*PX_PER_SOURCE*0.78 ≈ 96px 处，
      所以要留够余量，否则脚会被窗口底边切掉。
    */
    const floor = h - 170;
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
      const beat = (elapsed % 1050) / 1050;
      pose = "puff";
      const wanted = Math.min(showtimeTarget, Math.floor(elapsed / 420) + 1);
      const items = getItems().filter((item) => item.audioUrl || item.audioKey);
      while (spawned < wanted && items.length) {
        // 目标数量可能超过录音数：循环取用，同一段声音会被吹成好几颗
        const item = items[spawned % items.length];
        /*
          从棒口冒出来，位置由实测偏移算出，不再拍脑袋。
          facing 翻转时 x 偏移要跟着镜像 —— 猫朝左，棒子就在它右边。
        */
        const facingNow = side < 0 ? -1 : 1;
        const px = PX_PER_SOURCE * 0.78;
        const ground = floor + (REFERENCE_HEIGHT / 2) * px;
        const wandX = x + WAND_OFFSET.x * px * facingNow;
        const wandY = ground + WAND_OFFSET.y * px;

        window.BubbleField.spawnAt(item, wandX, wandY, {
          velocity: {
            x: (side < 0 ? 1.15 : -1.15) + spawned * 0.03 * (side < 0 ? 1 : -1),
            y: -1.05 - spawned * 0.03
          },
          radiusScale: showtimeRadiusScale
        });
        spawned += 1;
      }
    } else if (mode === "watch") {
      pose = "look";
    } else if (mode === "walk-out") {
      x = mix(stage, entry, ease(t));
      pose = Math.floor(elapsed / 190) % 2 ? "walk-1" : "walk-2";
    }

    const facing = side < 0 ? -1 : 1;
    lastPetPosition = { x, y: floor };
    reportHitbox(lastPetPosition, 118);
    if (mode === "walk-in" || mode === "walk-out") {
      const stride = elapsed / 150;
      const bob = Math.abs(Math.sin(stride * Math.PI)) * 8;
      const lean = Math.sin(stride * Math.PI) * 0.045 * (mode === "walk-out" ? -1 : 1);
      paintWalk(ctx, x, floor - bob, 0.78, 1, stride, { facing, rotate: lean });
    } else if (mode === "settle") {
      const settle = smoothstep(t);
      paint(ctx, "walk-1", x, floor - (1 - settle) * 5, 0.78, 1 - settle, { facing });
      paint(ctx, "sit", x, floor, 0.78 * (0.96 + settle * 0.04), settle, { facing });
    } else if (mode === "blow") {
      const beat = (elapsed % 1050) / 1050;
      const exhale = smoothstep(Math.min(1, beat / 0.58));
      const release = beat < 0.58 ? exhale : 1 - smoothstep((beat - 0.58) / 0.42);
      const puffAlpha = Math.max(0, 1 - release);
      const blowAlpha = Math.min(1, release * 1.35);
      const breathe = 1 + Math.sin(beat * Math.PI) * 0.018;
      paint(ctx, "puff", x, floor, 0.78 * breathe, puffAlpha, { facing, rotate: -0.012 * release });
      paint(ctx, "blow", x, floor - release * 2, 0.78 * breathe, blowAlpha, { facing, rotate: 0.012 * release });
    } else if (mode === "watch") {
      const arrive = smoothstep(Math.min(1, t * 2.4));
      paint(ctx, "sit", x, floor, 0.78, 1 - arrive, { facing });
      paint(ctx, "look", x, floor, 0.78, arrive, { facing });
    } else {
      paint(ctx, pose, x, floor, 0.78, 1, { facing });
    }

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

  /*
    按 anchor（脚底中心）落位，整帧一次画完。
    没有取样矩形，也就没有"取多了带进邻居、取少了切掉尾巴"这类问题。
  */
  function paint(ctx, name, x, y, scale, alpha, motion = {}) {
    const pose = POSE_ALIAS[name] || name;
    const frame = frames.get(pose);
    const data = FRAME_DATA[pose];

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.rotate(motion.rotate || 0);
    ctx.scale(motion.facing || 1, 1);

    if (frame?.ready && data) {
      const px = PX_PER_SOURCE * scale;
      /*
        传进来的 y 是桌宠的中心（hitTest 和拖拽都按中心算），不是地面。
        所以要把脚底 anchor 放到 y 下方一个**固定**距离处 ——

        关键在"固定"：如果按各自帧高去算，sleep(288) 和 sit(448) 的
        脚底会落在两条不同的线上，换姿态时猫会上下跳。
        统一用 sit 当参考高度，六个姿态就共用同一条地面线。

        （上一版误把 anchor 直接压在 y + 140*scale，比这里低一大截，
        导致 showtime 时脚被窗口底边切掉。）
      */
      const ground = (REFERENCE_HEIGHT / 2) * px;
      ctx.drawImage(
        frame.img,
        -data.ax * px,
        ground - data.ay * px,
        data.w * px,
        data.h * px
      );
    } else {
      // 贴图还没加载完时的占位，仍用程序化画的那只
      const sprite = sprites.get(name) || makeSprite(name);
      const size = sprite.size * scale;
      ctx.drawImage(sprite.canvas, -size / 2, -size / 2, size, size);
    }
    ctx.restore();
  }

  /*
    走路。

    原来是把 walk 格切成三条腿部切片各自错相位移动，做出交替步态。
    但那些切片坐标是按刚性网格手调的，同一套数字既切不全尾巴、
    又会取到隔壁格子，是这次渲染错位的主要来源之一。

    这里先退回"整帧 + 上下起伏 + 轻微前倾"的稳妥做法：
    不再有任何错误，观感也还算自然。
    真正的分腿步态等逐帧素材（图生视频抽关键帧）回来后直接换成多帧播放，
    那时只要往 FRAME_DATA 里加 walk-1..walk-N 即可，这段不用再改结构。
  */
  function paintWalk(ctx, x, y, scale, alpha, phase, motion = {}) {
    const gait = Math.sin(phase * Math.PI * 2);
    ctx.save();
    ctx.translate(0, -Math.abs(gait) * 5 * scale); // 每一步的轻微腾空
    paint(ctx, "walk", x, y, scale, alpha, {
      ...motion,
      rotate: (motion.rotate || 0) + gait * 0.03 // 身体随步子前后微摆
    });
    ctx.restore();
  }

  function mix(a, b, t) { return a + (b - a) * t; }
  function ease(t) { return 1 - Math.pow(1 - t, 3); }
  function smoothstep(t) {
    const value = Math.max(0, Math.min(1, t));
    return value * value * (3 - 2 * value);
  }

  window.DomiPet = {
    init, startShowtime, setCorner, setControlMode, hitTestAt,
    beginDrag, dragTo, endDrag
  };
})();
