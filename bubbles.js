/* =====================================================================
   bubbles.js —— 满屏声音泡泡的物理场
   ---------------------------------------------------------------------
   三层职责，刻意分开：
     1. 物理层   Matter.js 只管"泡泡在哪"（位置、速度、碰撞、弹性）
     2. 外观层   rough.js 把每颗泡泡"预渲染成一张小图"，只画一次
     3. 绘制层   每帧只做 drawImage + 变换，不重算任何手绘线条

   为什么要预渲染？
   手绘线条的生成（rough.js 每条线画两遍 + 随机扰动）是有成本的。
   如果每帧重画 40 颗泡泡的手绘轮廓，低端手机直接跪。
   "算一次，之后只做变换" —— 这是所有动效性能问题的分水岭。
   ===================================================================== */

(function () {
  "use strict";

  const { Engine, Runner, Bodies, Body, Composite, Events } = Matter;

  // 泡泡的运动手感。这几个数是"灵动"与否的全部秘密，值得反复调。
  const TUNING = {
    restitution: 0.92,    // 弹性：1 = 完全弹性碰撞永不衰减，0.92 留一点点"泄气感"
    frictionAir: 0.006,   // 空气阻力：太大泡泡会"沉"，太小会越撞越快
    maxSpeed: 2.6,        // 速度上限。没有它，多次碰撞会把泡泡加速到乱飞
    minSpeed: 0.28,       // 速度下限。低于它就补一点力，避免泡泡停在角落装死
    driftForce: 0.0000075 // 每帧的随机微扰，制造"空气在流动"的错觉
  };

  const POP_DURATION = 520;    // 破裂动画时长(ms)
  const RESPAWN_DELAY = 1500;  // 破了多久之后重新吹一颗回来
  const FADE_SPEED = 0.055;    // 筛选时淡入淡出的速度

  let canvas, ctx, dpr = 1;
  let engine, runner, walls = [];
  let bubbles = [];            // { key, item, instance, body, sprite, radius, alpha, target, state }
  let lastItems = null;        // 最近一次 setItems 的入参，resize 时要拿它重算密度
  let pops = [];               // 正在播放的破裂特效
  let moods = [];
  let handlers = {};
  let overlayDraw = null;       // 桌宠等前景角色，始终画在泡泡之上
  let recording = null;        // { duration, level, pitch } 或 null
  /*
    录音时整个泡泡场的透明度。
    录音是这个产品唯一需要"专注"的时刻 —— 其余泡泡必须退场，
    否则用户的注意力被一屏乱飞的东西分掉，也看不清自己吹的这颗有多大。
    用缓动而不是直接隐藏：突然消失是故障感，慢慢退开才是"让位"。
  */
  let fieldDim = 1;
  let coverage = 0.46;         // 目标覆盖率，采集端会调低
  let recordSeed = 1;
  let rafId = null;
  let petRitual = false;

  /* ------------------------------------------------------------------
     初始化
     ------------------------------------------------------------------ */

  function init(canvasEl, options) {
    canvas = canvasEl;
    ctx = canvas.getContext("2d");
    moods = options.moods || [];
    handlers = {
      onPop: options.onPop || function () {},
      onPopEnd: options.onPopEnd || function () {},
      onLongPress: options.onLongPress || function () {},
      onEmpty: options.onEmpty || function () {}
    };

    engine = Engine.create();
    // 关掉重力 —— 泡泡不该往下掉，它们悬浮在空气里
    engine.gravity.x = 0;
    engine.gravity.y = 0;

    runner = Runner.create();
    Runner.run(runner, engine);

    resize();
    window.addEventListener("resize", resize);

    // pointer 事件同时覆盖鼠标和触屏，不用分别写 click / touchstart
    canvas.addEventListener("pointerdown", handlePointer);
    // 抬手监听挂在 window 上：手指按下后滑出 canvas 再抬起也能正确收尾，
    // 否则 pressTimer 会残留，下一次点击行为就乱了
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    Events.on(engine, "afterUpdate", governSpeed);

    rafId = requestAnimationFrame(draw);
  }

  /* ------------------------------------------------------------------
     画布尺寸 & 四面墙
     ------------------------------------------------------------------ */

  function resize() {
    // devicePixelRatio：不处理的话高分屏上所有线条都是糊的
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildWalls(w, h);
    // 屏幕变大了就需要更多泡泡去填满，所以尺寸变化必须重算密度
    if (lastItems) setItems(lastItems);
  }

  function buildWalls(w, h) {
    if (walls.length) Composite.remove(engine.world, walls);
    const T = 200; // 墙做厚一点，防止高速泡泡"穿墙"（隧穿效应）
    const opts = { isStatic: true, restitution: 1, friction: 0 };
    walls = [
      Bodies.rectangle(w / 2, -T / 2, w + T * 2, T, opts),      // 上
      Bodies.rectangle(w / 2, h + T / 2, w + T * 2, T, opts),   // 下
      Bodies.rectangle(-T / 2, h / 2, T, h + T * 2, opts),      // 左
      Bodies.rectangle(w + T / 2, h / 2, T, h + T * 2, opts)    // 右
    ];
    Composite.add(engine.world, walls);
  }

  /* ------------------------------------------------------------------
     速度治理
     没有这一步，泡泡会因为反复碰撞越来越快（数值误差累积），
     几分钟后变成一屏乱窜的子弹。上下限 + 微扰 = 永远"慢悠悠但不静止"。
     ------------------------------------------------------------------ */

  function governSpeed() {
    for (const b of bubbles) {
      if (!b.body || b.state !== "alive") continue;
      const v = b.body.velocity;
      const speed = Math.hypot(v.x, v.y);

      if (speed > TUNING.maxSpeed) {
        const k = TUNING.maxSpeed / speed;
        Body.setVelocity(b.body, { x: v.x * k, y: v.y * k });
      } else if (speed < TUNING.minSpeed) {
        Body.applyForce(b.body, b.body.position, {
          x: (Math.random() - 0.5) * TUNING.driftForce * 40,
          y: (Math.random() - 0.5) * TUNING.driftForce * 40
        });
      } else {
        Body.applyForce(b.body, b.body.position, {
          x: (Math.random() - 0.5) * TUNING.driftForce * b.body.mass * 900,
          y: (Math.random() - 0.5) * TUNING.driftForce * b.body.mass * 900
        });
      }
    }
  }

  /* ------------------------------------------------------------------
     数据 → 泡泡形态
     这段映射是整个产品的灵魂：录得越久泡泡越大，声音越亮颜色越跳。
     它从旧版 getBubbleTraits() 移植过来，保留了原来的手感。
     ------------------------------------------------------------------ */

  function traitsOf(item, instance) {
    const wave = item.waveform && item.waveform.length ? item.waveform : [0.5];
    const loudness = wave.reduce((s, v) => s + v, 0) / wave.length;
    const richness = wave.reduce((s, v, i) => s + Math.abs(v - (wave[i - 1] ?? v)), 0) / wave.length;

    const base = Math.min(window.innerWidth, window.innerHeight);
    const scale = base < 520 ? 0.62 : 1;

    /*
      同一段录音的多颗泡泡要"像同一个声音的不同气泡"，而不是复制粘贴。
      用 instance 参与散列，让每颗的尺寸、笔迹、色相都有细微差别。
    */
    const jitter = ((hash(`${item.id}#${instance}`) % 1000) / 1000 - 0.5) * 0.42;
    const mood = moods.find((m) => m.id === item.mood) || moods[0] || { hue: 200 };

    return {
      radius: clamp((48 + item.duration * 3.8 + loudness * 24) * (1 + jitter) * scale, 36 * scale, 112 * scale),
      hue: (mood.hue + Math.round(richness * 60) + Math.round(jitter * 26)) % 360,
      seed: hash(`${item.id}:${instance}`) % 9999
    };
  }

  /*
    ------------------------------------------------------------------
    密度与录音数量解耦
    ------------------------------------------------------------------
    产品事实：用户一般只有一只猫，可能只录了 5 段。
    但"休息用的泡泡屏保"必须撑满整屏，否则画面是空的，治愈感就没了。
    所以一段录音会生成多颗泡泡 —— 戳破其中一颗，不影响另外几颗还飘着。

    目标覆盖率 0.46：太低画面空；太高泡泡会互相挤死，
    物理上动不了，"漂浮"就变成了"堆叠"，治愈感立刻消失。
  */
  function targetCount(itemCount) {
    if (!itemCount) return 0;
    const area = window.innerWidth * window.innerHeight;
    const base = Math.min(window.innerWidth, window.innerHeight);
    const avgR = base < 520 ? 54 : 80;
    const want = Math.round((area * coverage) / (Math.PI * avgR * avgR));
    // 上限 38：再多物理引擎和绘制都还撑得住，但视觉上已经太吵
    return clamp(want, Math.min(itemCount, 6), 38);
  }

  /* ------------------------------------------------------------------
     预渲染：把一颗泡泡画进一张离屏小图
     这里是唯一会跑 rough.js 的地方，每颗泡泡一生只跑一次。
     ------------------------------------------------------------------ */

  function makeSprite(item, t, showText) {
    // 留白要够放下收藏的荧光圈（画在 1.08r）和它自身的笔宽
    const pad = Math.max(18, t.radius * 0.18);
    const size = (t.radius + pad) * 2;
    const off = document.createElement("canvas");
    off.width = Math.round(size * dpr);
    off.height = Math.round(size * dpr);
    const c = off.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const cx = size / 2;
    const cy = size / 2;
    const rc = rough.canvas(off);

    // 泡泡主体：半透明填色 + 手绘双线轮廓
    rc.circle(cx, cy, t.radius * 2, {
      stroke: "#443e37",
      strokeWidth: 1.6,
      roughness: 1.5,      // 抖动强度
      bowing: 2.2,         // 线条的"弓形"弯曲量，doodle 感主要来自这个
      // 填色压到 0.3：泡泡要能透出后面的泡泡，堆叠起来才有"满屏"的层次
      fill: `hsla(${t.hue}, 84%, 84%, 0.3)`,
      fillStyle: "solid",
      seed: t.seed
    });

    // 高光：两笔弧线，稚拙画法就是这么表现反光的
    c.save();
    c.strokeStyle = "rgba(255,255,255,0.95)";
    c.lineWidth = 2.4;
    c.lineCap = "round";
    c.beginPath();
    c.arc(cx, cy, t.radius * 0.68, Math.PI * 1.12, Math.PI * 1.42);
    c.stroke();
    c.beginPath();
    c.arc(cx, cy, t.radius * 0.68, Math.PI * 1.52, Math.PI * 1.6);
    c.stroke();
    c.restore();

    // 收藏：外圈一道荧光笔。不占泡泡内部空间，也不会跟耳朵抢位置
    if (item.favorite) drawHighlightRing(c, cx, cy, t.radius, t.seed);

    /*
      泡泡本身就是多米的脸。
      不是"在泡泡里放一个图标"，而是让泡泡成为那张脸 ——
      不增加任何元素，却把可爱、个性、简约一次拿全。
      6 种 mood 不是 6 个不同的物件，是同一张脸的 6 种表情。

      标题不再画上去：休息模式下不该发生"阅读"行为。
      文字要读，读就是认知负担；表情是"看"的，一眼就过。
      标题保留在无障碍镜像和控制界面里，信息没丢。
    */
    if (showText) drawDomiFace(c, cx, cy, t.radius, item.mood, { seed: t.seed });

    return { canvas: off, size, half: size / 2 };
  }

  /* ------------------------------------------------------------------
     手绘笔触工具
     ------------------------------------------------------------------
     代码画的"手绘"之所以一眼假，是因为它太完美：
     等腰三角形的耳朵、正圆的眼睛、等距等长的胡须、全程等宽的线。

     这几个函数就是用来主动破坏这些完美的：
       makeRng    —— 有种子的随机，同一颗泡泡每次重绘都长一样
       jitterLine —— 线条中段抖动（端点不抖，否则笔画接不上）
       inkStroke  —— 分段描边，每段宽度不同 = 笔压：起笔重、收笔轻
     ------------------------------------------------------------------ */

  function makeRng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function jitterLine(x1, y1, x2, y2, rng, amp, steps) {
    const pts = [];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      // sin 包络：两端归零，中间最抖 —— 端点必须准，否则笔画之间会裂开
      const k = Math.sin(t * Math.PI) * amp * (rng() - 0.5) * 2;
      pts.push({ x: x1 + dx * t + nx * k, y: y1 + dy * t + ny * k });
    }
    return pts;
  }

  function jitterArc(cx, cy, r, a0, a1, rng, amp, steps) {
    const pts = [];
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const a = a0 + (a1 - a0) * t;
      const rr = r + (rng() - 0.5) * 2 * amp;
      pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
    }
    return pts;
  }

  function inkStroke(c, pts, rng, baseWidth) {
    for (let i = 0; i < pts.length - 1; i += 1) {
      const t = i / Math.max(1, pts.length - 2);
      // 起笔重、收笔轻，再叠一点随机 —— 这就是代码最缺的"笔压"
      const w = baseWidth * (1.3 - t * 0.8) * (0.82 + rng() * 0.36);
      c.lineWidth = Math.max(0.7, w);
      c.beginPath();
      c.moveTo(pts[i].x, pts[i].y);
      c.lineTo(pts[i + 1].x, pts[i + 1].y);
      c.stroke();
    }
  }

  /* ------------------------------------------------------------------
     多米的脸
     ------------------------------------------------------------------
     刻意用普通 canvas 路径画，不走 rough.js：
     五官尺度很小，抖动线条在这个尺寸下会糊成一团；
     而且脸的线必须比泡泡轮廓更细更淡，否则两者会互相打架。
     ------------------------------------------------------------------ */

  // 每种 mood 一种表情。改这张表就等于改整套图标。
  /*
    每种 mood 一种表情。改这张表就等于改整套图标。

    ω 嘴（倒 m）是猫脸最可爱的那一笔，所以让它当主力 ——
    只有"在大声叫"的两种（饭盆、抗议）用张开的嘴，
    因为张嘴才读得出"正在发出声音"。
  */
  const FACES = {
    sweet:   { eye: "happy",  mouth: "w",    tilt: -0.06, mouthScale: 1.05 }, // 撒娇：眯眼努嘴
    food:    { eye: "wide",   mouth: "open", tilt: 0.04 },                    // 饭盆：瞪大眼在叫
    sleepy:  { eye: "closed", mouth: "w",    tilt: 0.1,  mouthScale: 0.72 },  // 困困：闭眼小努嘴
    purr:    { eye: "happy",  mouth: "w",    tilt: -0.03, mouthScale: 1.15 }, // 呼噜：最满足，嘴最鼓
    mystery: { eye: "wonk",   mouth: "w",    tilt: 0.12, mouthScale: 0.85 },  // 疑惑：歪头小努嘴
    protest: { eye: "cross",  mouth: "open", tilt: -0.1 }                     // 抗议：皱眉张嘴
  };

  /*
    自定义类型没有预设表情。
    不要一律 fallback 到 sweet —— 那样所有自建类型长得一模一样。
    按 id 散列稳定地挑一种，同一个类型永远是同一张脸。
  */
  function faceFor(mood) {
    if (FACES[mood]) return FACES[mood];
    const keys = Object.keys(FACES);
    return FACES[keys[hash(String(mood)) % keys.length]];
  }

  function drawDomiFace(c, cx, cy, r, mood, opts) {
    const f = faceFor(mood);
    const o = opts || {};
    /*
      泡泡上的脸要淡（它在半透明填色之上，太重会跟外框抢）；
      当成独立小图标用时必须加重，否则 30px 下看着就是一团灰。
    */
    const bold = o.boldest;
    const ink = bold ? "rgba(58, 52, 46, 0.95)" : "rgba(58, 52, 46, 0.8)";
    const rng = makeRng(hash(String(mood)) + (o.seed || 0) * 7919);

    // 抖动幅度和线宽都跟半径走，缩放到任何尺寸手感一致
    const amp = r * (bold ? 0.026 : 0.022);
    const w = bold ? Math.max(1.6, r * 0.082) : Math.max(1.35, r * 0.04);

    c.save();
    c.translate(cx, cy);
    // 歪头。基础倾角再叠一点随机 —— 端正是"排版"，歪才是"画的"
    c.rotate(f.tilt + (rng() - 0.5) * 0.14);
    c.strokeStyle = ink;
    c.fillStyle = ink;
    c.lineCap = "round";
    c.lineJoin = "round";

    /*
      耳朵。左右刻意不一样高、不一样宽、不一样斜 ——
      对称是"代码感"最大的来源，必须主动破坏。
    */
    for (const side of [-1, 1]) {
      const grow = 0.86 + rng() * 0.32;          // 这只耳朵整体大小
      const lift = (rng() - 0.5) * r * 0.09;     // 高低差
      const ex = side * r * (0.3 + rng() * 0.07);
      const ey = -r * 0.55 + lift;
      const halfW = r * 0.12 * grow;
      const tipY = ey - r * 0.17 * grow;
      const tipX = ex + side * r * 0.03 * (rng() - 0.2);

      inkStroke(c, jitterLine(ex - halfW, ey + r * 0.14, tipX, tipY, rng, amp, 4), rng, w);
      inkStroke(c, jitterLine(tipX, tipY, ex + halfW, ey + r * 0.12, rng, amp, 4), rng, w);

      // 折耳内侧的一小笔，比尖三角更像真实多米向外微折的耳朵。
      c.globalAlpha = 0.45;
      inkStroke(c, jitterLine(tipX, tipY + r * 0.045, ex + side * halfW * 0.25, ey + r * 0.11, rng, amp * 0.6, 3), rng, w * 0.52);
      c.globalAlpha = 1;
    }

    // 额头三笔银渐层纹：少而明确，缩到 60px 仍认得出多米。
    c.globalAlpha = 0.3;
    for (const dx of [-0.105, 0, 0.105]) {
      inkStroke(c, jitterLine(dx * r, -r * 0.5, dx * r * 0.72, -r * 0.31, rng, amp * 0.45, 3), rng, w * 0.5);
    }
    c.globalAlpha = 1;

    // 眼睛：左右大小、高低都略微不同
    const eyeY = -r * 0.04;
    for (const side of [-1, 1]) {
      const x = side * r * (0.24 + rng() * 0.05);
      const y = eyeY + (rng() - 0.5) * r * 0.05;
      const er = r * (0.11 + rng() * 0.022);

      if (f.eye === "closed" || (f.eye === "wonk" && side < 0)) {
        inkStroke(c, jitterLine(x - er, y, x + er, y + (rng() - 0.5) * r * 0.02, rng, amp, 3), rng, w);
      } else if (f.eye === "happy") {
        inkStroke(c, jitterArc(x, y + er * 0.6, er, Math.PI * 1.12, Math.PI * 1.88, rng, amp * 0.8, 6), rng, w);
      } else if (f.eye === "cross") {
        inkStroke(c, jitterLine(x - er, y - er * 0.7, x + er, y + er * 0.3, rng, amp, 3), rng, w);
      } else {
        // 多米最强的辨识点：浅绿大眼 + 深色眼线。轮廓故意不完全圆。
        const eyeRx = er * (f.eye === "wide" ? 1.12 : 0.96);
        const eyeRy = er * (f.eye === "wide" ? 1.2 : 1.06);
        const outline = jitterArc(x, y, 1, 0, Math.PI * 2, rng, amp * 0.5, 14)
          .map((p) => ({ x: x + (p.x - x) * eyeRx, y: y + (p.y - y) * eyeRy }));
        c.save();
        c.fillStyle = bold ? "rgba(170, 202, 143, 0.92)" : "rgba(170, 202, 143, 0.72)";
        c.beginPath();
        outline.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)));
        c.closePath(); c.fill();
        inkStroke(c, outline.concat(outline[0]), rng, w * 0.72);
        c.fillStyle = ink;
        c.beginPath(); c.ellipse(x + side * er * 0.05, y + er * 0.06, er * 0.43, er * 0.62, side * 0.08, 0, Math.PI * 2); c.fill();
        c.fillStyle = "rgba(253,252,249,0.9)";
        c.beginPath(); c.arc(x - er * 0.18, y - er * 0.22, Math.max(1, er * 0.13), 0, Math.PI * 2); c.fill();
        c.restore();
      }
    }

    // 粉鼻和鼻侧一撮黑色，是这只多米而不是泛型猫的身份钉子。
    const noseY = r * 0.13;
    c.save();
    c.fillStyle = bold ? "rgba(239,154,159,0.95)" : "rgba(239,154,159,0.76)";
    c.beginPath();
    c.moveTo(-r * 0.052, noseY - r * 0.018);
    c.quadraticCurveTo(0, noseY - r * 0.052, r * 0.052, noseY - r * 0.012);
    c.quadraticCurveTo(r * 0.015, noseY + r * 0.055, -r * 0.052, noseY - r * 0.018);
    c.fill();
    c.fillStyle = ink;
    c.beginPath(); c.ellipse(r * 0.073, noseY - r * 0.03, r * 0.016, r * 0.026, -0.45, 0, Math.PI * 2); c.fill();
    c.restore();

    // 嘴
    const my = r * (0.27 + rng() * 0.025);
    if (f.mouth === "open") {
      const rx = r * (0.075 + rng() * 0.035);
      const ry = rx * (1.05 + rng() * 0.35);
      const pts = jitterArc(0, my, 1, 0, Math.PI * 2, rng, 0, 12)
        .map((p) => ({ x: p.x * rx + (rng() - 0.5) * amp, y: (p.y - my) * ry + my + (rng() - 0.5) * amp }));
      inkStroke(c, pts, rng, w * 0.9);
    } else if (f.mouth === "w") {
      /*
        ω 嘴（倒 m）—— 猫脸的招牌。

        ⚠️ 角度方向很容易搞反：canvas 的 y 轴向下，
        PI→2PI 扫的是上半圈，画出来是 ∩∩ 也就是正的 m（嘴角朝下，像在生气）；
        0→PI 扫下半圈才是 ∪∪ = ω，两瓣往下鼓的努嘴。

        两瓣刻意不一样大、不一样高，中间那个小尖也歪一点 —— 对称就不可爱了。
      */
      const scale = f.mouthScale || 1;
      const s1 = r * (0.062 + rng() * 0.028) * scale;
      const s2 = r * (0.062 + rng() * 0.028) * scale;
      const dip = r * 0.012 * scale;          // 两瓣的高低差
      const peak = (rng() - 0.5) * r * 0.02;  // 中间小尖的左右偏移

      inkStroke(c, jitterArc(-s1 + peak, my, s1, 0, Math.PI, rng, amp * 0.6, 7), rng, w * 0.95);
      inkStroke(c, jitterArc(s2 + peak, my - dip, s2, 0, Math.PI, rng, amp * 0.6, 7), rng, w * 0.95);

      // 中间往上挑一小笔，努嘴的那个尖就出来了
      inkStroke(
        c,
        jitterLine(peak, my, peak + (rng() - 0.5) * r * 0.01, my - r * 0.045 * scale, rng, amp * 0.5, 3),
        rng,
        w * 0.8
      );
    } else {
      inkStroke(c, jitterLine(-r * 0.06, my, r * 0.06, my + (rng() - 0.5) * r * 0.02, rng, amp, 3), rng, w * 0.9);
    }

    // 胡须：每边 2~3 根，长短角度都不一样。多了会吵，所以压得很淡
    c.globalAlpha = 0.4;
    for (const side of [-1, 1]) {
      const count = rng() > 0.45 ? 3 : 2;
      for (let i = 0; i < count; i += 1) {
        const y0 = my - r * 0.16 + i * r * 0.09 + (rng() - 0.5) * r * 0.03;
        const len = r * (0.24 + rng() * 0.12);
        const rise = r * (0.03 + rng() * 0.07);
        inkStroke(
          c,
          jitterLine(side * r * 0.42, y0, side * (r * 0.42 + len), y0 - rise, rng, amp * 1.2, 4),
          rng,
          w * 0.7
        );
      }
    }

    c.restore();
  }

  /*
    收藏标记：用荧光笔在外面圈一圈。
    之前那颗五角星太"图标"了 —— 几何完美、和手绘语言打架，还老跟耳朵撞位置。
    圈一下更贴合这个产品的语感：收藏就是"我把这颗圈出来了"。
    起止角刻意错开、不闭合 —— 手画的圈从来收不拢。
  */
  function drawHighlightRing(c, cx, cy, r, seed) {
    const rng = makeRng(seed || 1);
    c.save();
    c.strokeStyle = "rgba(249, 194, 46, 0.9)";
    c.lineCap = "round";
    const a0 = -Math.PI * 0.5 + (rng() - 0.5) * 1.2;
    const a1 = a0 + Math.PI * 2 * (0.92 + rng() * 0.12);
    const pts = jitterArc(cx, cy, r * 1.08, a0, a1, rng, r * 0.025, 38);
    inkStroke(c, pts, rng, Math.max(2.2, r * 0.08));
    c.restore();
  }



  /* ------------------------------------------------------------------
     同步：把"当前应该显示哪些泡泡"喂进来
     筛选就是在这里生效的 —— 不符合条件的泡泡淡出飘走，符合的淡入。
     ------------------------------------------------------------------ */

  function setItems(items) {
    lastItems = items;
    if (petRitual) return;
    // 先算出这块屏幕需要多少颗泡泡，再把它们轮流分配给现有的录音
    const total = targetCount(items.length);
    const wanted = new Map();
    for (let n = 0; n < total; n += 1) {
      const item = items[n % items.length];
      const instance = Math.floor(n / items.length);
      wanted.set(`${item.id}#${instance}`, { item, instance });
    }

    // 已经不需要的：标记淡出，不立刻删（要给动画留时间）
    for (const b of bubbles) {
      const w = wanted.get(b.key);
      if (!w) {
        b.target = 0;
        continue;
      }
      b.target = 1;
      b.item = w.item;
      /*
        只在"画面上看得见的字段"变了时才重绘贴图。
        playCount 每戳一次就变，但它不画在泡泡上 —— 如果把它算进 key，
        每次播放都会重跑一次 rough.js，白白浪费。
      */
      const key = spriteKey(w.item, b.instance);
      if (key !== b.spriteKey) {
        b.sprite = makeSprite(w.item, { radius: b.radius, hue: b.hue, seed: b.seed }, b.instance === 0);
        b.spriteKey = key;
      }
    }

    // 新出现的：造出来
    const existing = new Set(bubbles.map((b) => b.key));
    for (const [key, w] of wanted) {
      if (!existing.has(key)) spawn(w.item, w.instance);
    }
  }

  function spawn(item, instance, atEdge, placement) {
    const t = traitsOf(item, instance);
    if (placement?.radiusScale) t.radius *= placement.radiusScale;
    /*
      仪式里的泡泡要和棒口成比例，所以把半径压进一个窄区间。
      仍然保留"录得越久泡泡越大"的映射，只是幅度收窄 ——
      完全抹平会丢掉这个产品最核心的数据可视化，
      不收窄又会吹出比多米还大的泡泡。
    */
    if (placement?.radiusRange) {
      t.radius = clamp(t.radius, placement.radiusRange[0], placement.radiusRange[1]);
    }
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const x = placement?.x ?? (atEdge ? (Math.random() < 0.5 ? t.radius + 4 : w - t.radius - 4) : rand(t.radius, w - t.radius));
    const y = placement?.y ?? (atEdge ? rand(t.radius, h - t.radius) : rand(t.radius, h - t.radius));

    const body = Bodies.circle(x, y, t.radius, {
      restitution: TUNING.restitution,
      frictionAir: TUNING.frictionAir,
      friction: 0,
      density: 0.0009
    });
    Body.setVelocity(body, placement?.velocity || { x: rand(-1.4, 1.4), y: rand(-1.4, 1.4) });
    Composite.add(engine.world, body);

    bubbles.push({
      key: `${item.id}#${instance}`,
      item,
      instance,
      body,
      radius: t.radius,
      hue: t.hue,
      seed: t.seed,
      /*
        只有第一颗写字。
        这是"休息"而不是"管理"：满屏重复同一个标题会变得很吵，
        安静的泡泡里混一两颗有名字的，反而让人想去找。
      */
      sprite: makeSprite(item, t, instance === 0),
      spriteKey: spriteKey(item, instance),
      bornAt: performance.now(),
      growFromMouth: Boolean(placement?.growFromMouth),
      alpha: 0,
      target: 1,
      state: "alive",
      popAt: 0,
      respawnAt: 0
    });
  }

  /* 多米吹泡泡时从嘴边定点生成。instance 使用独立序号，避免覆盖密度泡泡。 */
  function spawnAt(item, x, y, options) {
    if (!item || !engine) return null;
    const instance = 10000 + Math.floor(performance.now());
    spawn(item, instance, false, {
      x: clamp(x, 24, canvas.clientWidth - 24),
      y: clamp(y, 24, canvas.clientHeight - 24),
      velocity: options?.velocity || options || { x: 1.4, y: -1.2 },
      radiusScale: options?.radiusScale || 1,
      // 多米身高约 191px，泡泡直径压在 68..124 之间才像是从棒口吹出来的
      radiusRange: [42, 74],
      growFromMouth: true
    });
    return bubbles[bubbles.length - 1] || null;
  }

  function setPetRitual(on) {
    petRitual = Boolean(on);
    if (petRitual) clearAll(true);
    else if (lastItems) setItems(lastItems);
  }

  /*
    ------------------------------------------------------------------
    仪式里泡泡的大小与数量
    ------------------------------------------------------------------
    原来的做法是"数量严格等于录音数，只用尺寸表达收藏量"，
    所以录音少时把半径放大到 2.25 倍去填屏幕。
    结果 6 段录音时泡泡直径 270px，而多米才 191px 高 ——
    一根小棒子吹出比自己还大的泡泡，动效再怎么调都会觉得假。

    改成和泡泡场一致的原则：**尺寸保持合理，屏幕靠多吹几颗填满**。
    录音不够就重复利用同一段声音，这和 setItems 里密度与数量解耦是一套逻辑。
  */
  const RITUAL_TARGET_RADIUS = 56; // 约为多米身高的四分之一，看起来才像"吹"出来的

  function ritualRadiusScale() {
    // traitsOf 给出的半径大致在 30..94，中位数约 58，归一到目标尺寸
    return clamp(RITUAL_TARGET_RADIUS / 58, 0.55, 1.15);
  }

  function ritualTargetCount(itemCount) {
    if (!itemCount) return 0;
    const area = window.innerWidth * window.innerHeight;
    const per = Math.PI * RITUAL_TARGET_RADIUS * RITUAL_TARGET_RADIUS;
    const want = Math.round((area * 0.34) / per);
    // 下限是录音数（每段至少吹一颗），上限 26 免得吹太久也太吵
    return clamp(want, itemCount, 26);
  }

  function clearAll(immediate = false) {
    for (const b of bubbles) {
      if (immediate) Composite.remove(engine.world, b.body);
      else b.target = 0;
    }
    if (immediate) bubbles = [];
    pops = [];
  }

  // 贴图只依赖这几个"画得出来"的字段。标题不再上贴图，所以不进 key
  function spriteKey(item, instance) {
    return instance === 0 ? `${item.favorite}|${item.mood}` : `${item.favorite}`;
  }

  /*
    把同一张脸导成 data URL，给筛选 chips 当图标用。
    复用 drawDomiFace 而不是另写一套 SVG —— 表情只有一个真相来源，
    以后改表情不会出现"泡泡上笑着、chip 上闭着眼"这种事。
  */
  function faceDataUrl(mood, size) {
    const px = size || 30;
    // 3 倍超采样：小图标里的细线在 2x 下仍然发虚
    const ss = 3;
    const off = document.createElement("canvas");
    off.width = Math.round(px * ss);
    off.height = Math.round(px * ss);
    const c = off.getContext("2d");
    c.setTransform(ss, 0, 0, ss, 0, 0);
    // 0.46 而不是 0.42：耳朵画到 -0.56r、胡须伸到 0.72r，
    // 半径给太小的话这些都被挤在中间，缩略图看着就是一团灰
    drawDomiFace(c, px / 2, px / 2, px * 0.46, mood, { boldest: true });
    return off.toDataURL();
  }

  /* ------------------------------------------------------------------
     戳破
     ------------------------------------------------------------------ */

  /*
    短按戳破，长按收藏。
    移动端没有右键也没有 hover，长按是唯一自然的"第二动作"。
    500ms 是业界常用阈值（iOS 长按 ~500ms，Android ~500ms），
    比这短会误触，比这长用户会以为没反应。
  */
  const LONG_PRESS_MS = 500;
  let pressTarget = null;
  let pressTimer = null;

  function hitTest(event) {
    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    // 从后往前找：视觉上盖在最上层的泡泡应该优先被戳中
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const b = bubbles[i];
      if (b.state !== "alive" || b.alpha < 0.35) continue;
      if (Math.hypot(px - b.body.position.x, py - b.body.position.y) <= b.radius) return b;
    }
    return null;
  }

  function handlePointer(event) {
    const b = hitTest(event);
    if (!b) return;
    pressTarget = b;

    pressTimer = setTimeout(() => {
      pressTimer = null;
      pressTarget = null;
      // 长按：收藏，并给一点触觉反馈（支持的设备上）
      if (navigator.vibrate) navigator.vibrate(18);
      handlers.onLongPress(b.item);
    }, LONG_PRESS_MS);
  }

  function handlePointerUp() {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
      // 计时器还没到 → 是短按 → 戳破
      if (pressTarget && pressTarget.state === "alive") pop(pressTarget);
    }
    pressTarget = null;
  }

  function pop(b) {
    b.state = "popped";
    b.popAt = performance.now();
    b.respawnAt = petRitual ? Number.POSITIVE_INFINITY : b.popAt + RESPAWN_DELAY;
    Composite.remove(engine.world, b.body);

    pops.push({
      x: b.body.position.x,
      y: b.body.position.y,
      r: b.radius,
      hue: b.hue,
      start: performance.now(),
      // 碎片：破裂时溅出的小圆点，稚拙画法的"啪"
      bits: Array.from({ length: 9 }, () => ({
        a: Math.random() * Math.PI * 2,
        d: rand(0.5, 1.25),
        s: rand(2, 5)
      }))
    });

    handlers.onPop(b.item);
    if (petRitual && !bubbles.some((item) => item.state === "alive")) handlers.onEmpty();
  }

  /* ------------------------------------------------------------------
     录音中的那颗大泡泡
     level（音量）→ 半径脉动 + 抖动幅度
     pitch（音高）→ 色相
     这是"声音特征直接变成视觉"的地方，也是产品最该被看见的一秒。
     ------------------------------------------------------------------ */

  function setRecording(data) {
    recording = data;
    if (data) recordSeed = 1;
  }

  /*
    两套模式，不是两种布局。

    ambient（电脑）= 屏保。泡泡要撑满屏幕，那是产品的全部内容。
    capture（手机）= 工具。你是来录音的，满屏乱飞的泡泡会盖住录音按钮、
    抢走注意力，还让你找不到刚录的那一颗。密度降到三分之一。
  */
  function setMode(mode) {
    const next = mode === "capture" ? 0.16 : 0.46;
    if (next === coverage) return;
    coverage = next;
    if (lastItems) setItems(lastItems);
  }

  function drawRecordBubble(now) {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const cx = w / 2;
    const cy = h / 2;

    /*
      越录越大，但用 sqrt 收敛 —— 线性增长录 30 秒会撑爆屏幕。
      上限 0.3：更大的话泡泡会顶到屏幕边缘，"吹起来的一颗"就变成了"一块背景色"，
      失去了它是个泡泡的感觉。
    */
    const short = Math.min(w, h);
    const grow = Math.sqrt(recording.duration) * 20;
    const radius = Math.min(short * 0.08 + grow, short * 0.3);

    // 音量推动半径脉动 —— 就是"吹气"的手感
    const pulse = 1 + recording.level * 0.22;
    const r = radius * pulse;
    const hue = 190 + recording.pitch * 140;

    ctx.save();
    ctx.globalAlpha = 0.92;

    /*
      抖动的轮廓：极坐标采样 + 噪声，音量越大抖得越狠。
      幅度必须按半径成比例 —— 固定像素值在泡泡吹大之后
      会显得越来越平静，恰好和"声音越来越响"的直觉相反。
    */
    const wobble = (0.03 + recording.level * 0.1) * r;
    ctx.beginPath();
    const STEPS = 60;
    for (let i = 0; i <= STEPS; i += 1) {
      const a = (i / STEPS) * Math.PI * 2;
      const n = Math.sin(a * 3 + now * 0.006) * 0.5 + Math.sin(a * 5 - now * 0.009) * 0.5;
      const rr = r + n * wobble;
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = `hsla(${hue}, 84%, 86%, 0.45)`;
    ctx.fill();
    ctx.strokeStyle = "#443e37";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // 高光
    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.66, Math.PI * 1.1, Math.PI * 1.4);
    ctx.stroke();

    ctx.restore();
  }

  /* ------------------------------------------------------------------
     主绘制循环
     ------------------------------------------------------------------ */

  function draw() {
    const now = performance.now();
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    ctx.clearRect(0, 0, w, h);

    // 录音时其他泡泡整体退开，给正在被吹的那颗让出一块纯净的背景
    fieldDim += ((recording ? 0 : 1) - fieldDim) * 0.055;

    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const b = bubbles[i];

      if (b.state === "popped") {
        if (now >= b.respawnAt) {
          // 重新吹一颗回来。从边缘进场，像刚飘进画面
          bubbles.splice(i, 1);
          handlers.onPopEnd(b.item);
          spawnRespawn(b.item, b.instance);
        }
        continue;
      }

      // 淡入淡出：筛选的视觉表达
      b.alpha += (b.target - b.alpha) * FADE_SPEED * 3;
      if (b.target === 0 && b.alpha < 0.02 && fieldDim > 0.05) {
        Composite.remove(engine.world, b.body);
        bubbles.splice(i, 1);
        continue;
      }

      const p = b.body.position;
      if (b.alpha * fieldDim < 0.01) continue; // 全透明就别浪费一次 drawImage
      ctx.save();
      ctx.globalAlpha = Math.min(1, b.alpha) * fieldDim;
      ctx.translate(p.x, p.y);
      if (b.growFromMouth) {
        const age = Math.max(0, now - b.bornAt);
        const grow = Math.min(1, age / 760);
        const easedGrow = 1 - Math.pow(1 - grow, 3);
        const scale = 0.12 + easedGrow * 0.88;
        ctx.scale(scale, scale);
        if (grow >= 1) b.growFromMouth = false;
      }
      /*
        故意不旋转。
        泡泡是球体，转起来在视觉上不产生任何信息，
        却会把烤进贴图的文字转到倒立 —— 纯亏。
      */
      // ⬇︎ 每帧真正做的事就这一句：贴一张已经画好的图
      ctx.drawImage(b.sprite.canvas, -b.sprite.half, -b.sprite.half, b.sprite.size, b.sprite.size);
      ctx.restore();
    }

    // 破裂特效
    for (let i = pops.length - 1; i >= 0; i -= 1) {
      const p = pops[i];
      const t = (now - p.start) / POP_DURATION;
      if (t >= 1) { pops.splice(i, 1); continue; }
      drawPop(p, t);
    }

    if (recording) drawRecordBubble(now);
    if (overlayDraw) overlayDraw(ctx, now, w, h);

    rafId = requestAnimationFrame(draw);
  }

  function drawPop(p, t) {
    const ease = 1 - Math.pow(1 - t, 3);
    ctx.save();
    ctx.globalAlpha = 1 - t;

    // 扩散的手绘圆环
    ctx.strokeStyle = `hsl(${p.hue}, 70%, 58%)`;
    ctx.lineWidth = 2.2 * (1 - t) + 0.6;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 + ease * 0.55), 0, Math.PI * 2);
    ctx.stroke();

    // 溅出的碎片
    ctx.fillStyle = `hsl(${p.hue}, 78%, 72%)`;
    ctx.strokeStyle = "#443e37";
    ctx.lineWidth = 1;
    for (const bit of p.bits) {
      const d = p.r * (0.85 + ease * bit.d);
      const x = p.x + Math.cos(bit.a) * d;
      const y = p.y + Math.sin(bit.a) * d;
      ctx.beginPath();
      ctx.arc(x, y, bit.s * (1 - t * 0.6), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  function spawnRespawn(item, instance) {
    spawn(item, instance, true);
    const b = bubbles[bubbles.length - 1];
    if (b) b.alpha = 0;
  }

  /* ------------------------------------------------------------------
     工具
     ------------------------------------------------------------------ */

  function rand(min, max) { return min + Math.random() * (max - min); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function hash(s) {
    return String(s).split("").reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381);
  }

  function destroy() {
    if (rafId) cancelAnimationFrame(rafId);
    window.removeEventListener("resize", resize);
    Runner.stop(runner);
    Engine.clear(engine);
  }

  /*
    给桌宠模式用：某个屏幕坐标下有没有泡泡。
    Electron 的透明窗口默认整块穿透（鼠标点到桌面上），
    只有鼠标悬在泡泡上时才临时关掉穿透 —— 否则这个窗口会挡住你所有工作。
  */
  function hitTestAt(x, y) {
    for (let i = bubbles.length - 1; i >= 0; i -= 1) {
      const b = bubbles[i];
      if (b.state !== "alive" || b.alpha < 0.35) continue;
      if (Math.hypot(x - b.body.position.x, y - b.body.position.y) <= b.radius) return true;
    }
    return false;
  }

  // 用户新建自定义类型后要能立刻拿到新色相，所以 moods 不能只在 init 时传一次
  function setMoods(next) {
    moods = next || [];
  }

  function setOverlayDraw(fn) {
    overlayDraw = typeof fn === "function" ? fn : null;
  }

  window.BubbleField = {
    init, setItems, setRecording, setMode, setMoods, spawnAt, setOverlayDraw,
    hitTestAt, faceDataUrl, destroy, setPetRitual, ritualTargetCount, ritualRadiusScale, clearAll, TUNING
  };
})();
