const STORAGE_KEY = "meow-gallery:v1";
const SETTINGS_KEY = "meow-gallery:settings";
// 改名前的旧 key，启动时做一次性搬迁，别让老用户数据凭空消失
const LEGACY_KEYS = { data: "cat-mew-gallery:v1", settings: "cat-mew-gallery:settings" };
// 空闲多久之后进入休息模式（隐藏所有 UI，只剩泡泡）
const REST_IDLE_MS = 4000;
/*
  IndexedDB 的库名故意不跟着改名。
  重命名一个 IndexedDB 意味着要把里面每一个音频 Blob 逐条读出来再写进新库 ——
  纯粹的风险，零收益，而且用户永远看不见这个名字。
  命名一致性不值得拿用户的录音去赌。
*/
const AUDIO_DB_NAME = "cat-mew-gallery-audio";
const AUDIO_DB_VERSION = 1;
const AUDIO_STORE_NAME = "audioBlobs";
const AUDIO_KEY_PREFIX = "audio:";
const t = (key, variables) => window.I18n?.t(key, variables) || key;
const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus"
];

const MOODS = [
  { id: "all", labelKey: "moodAll", color: "#fffdf9", hue: 34 },
  { id: "sweet", labelKey: "moodSweet", color: "#ffe1e8", hue: 338 },
  { id: "food", labelKey: "moodFood", color: "#ffe7a3", hue: 46 },
  { id: "sleepy", labelKey: "moodNight", color: "#dce7ff", hue: 220 },
  { id: "purr", labelKey: "moodPurr", color: "#d5f0e9", hue: 166 },
  { id: "mystery", labelKey: "moodQuestion", color: "#e4f3d7", hue: 105 },
  { id: "protest", labelKey: "moodAngry", color: "#ffd7c8", hue: 15 }
];

const SORTS = [
  { value: "newest", labelKey: "sortNewest" },
  { value: "popular", labelKey: "sortPopular" }
];

const TITLE_POOL = [
  "刚捡到的一声",
  "咪呜泡泡",
  "开饭雷达响了",
  "小小拖拉机呼噜",
  "门缝里的嗯？",
  "被摸头许可音",
  "困到融化喵",
  "奶声抗议",
  "半夜巡逻报告",
  "尾巴尖问号",
  "抱抱申请中"
];

const state = {
  meows: [],
  filters: {
    mood: "all",
    favoriteOnly: false,
    query: "",
    sortBy: "newest"
  },
  draft: null,
  isRecording: false,
  recordingStartedAt: 0,
  timerId: null,
  mediaRecorder: null,
  chunks: [],
  recordingStream: null,
  currentAudio: null,
  currentMockStop: null,
  currentMockTimer: null,
  currentPlayingId: null,
  objectUrls: new Map(),
  liveCtx: null,
  liveAnalyser: null,
  liveRaf: null,
  recordChain: null,
  // 用户一般只有一只猫，所以猫名是一次性设置，不是每条录音的字段
  settings: { catName: "多米", customMoods: [], noiseSuppression: false },
  restTimer: null,
  isResting: false,
  controlMode: false,
  petAutoClearMinutes: 5,
  petClearTimer: null,
  mode: null // "capture"（手机，工具）或 "ambient"（电脑，屏保）
};
let deferredInstallPrompt = null;

const els = {};

document.addEventListener("DOMContentLoaded", init);

if (window.Capacitor?.isNativePlatform?.()) document.body?.classList.add("is-native-app");

function init() {
  cacheElements();
  restore();
  restoreSettings();
  renderMoodChips();
  setupDropdowns();
  bindEvents();
  window.meowPet?.setLanguage?.(window.I18n?.language);

  BubbleField.init(els.canvas, {
    moods: allMoods(),
    // 泡泡被戳破 → 放它录到的那段声音
    onPop: (item) => playItem(item),
    // 破裂动画结束、泡泡重新飘回来时，把播放次数落盘
    onPopEnd: () => persist(),
    // 长按收藏
    onLongPress: (item) => toggleFavorite(item),
    onEmpty: () => window.clearTimeout(state.petClearTimer)
  });

  setupDesktopPet();
  applyMode();
  window.addEventListener("resize", applyMode);
  render();
  setupCloudSync();
}

function cacheElements() {
  els.body = document.body;
  els.languageToggle = document.querySelector("#languageToggle");
  els.canvas = document.querySelector("#bubbleCanvas");
  els.srMirror = document.querySelector("#srMirror");
  els.collectionCount = document.querySelector("#collectionCount");
  els.recordButton = document.querySelector("#recordButton");
  els.recordButtonText = document.querySelector("#recordButtonText");
  els.recordTimer = document.querySelector("#recordTimer");
  els.recordState = document.querySelector("#recordState");
  els.searchToggle = document.querySelector("#searchToggle");
  els.aboutButton = document.querySelector("#aboutButton");
  els.aboutDialog = document.querySelector("#aboutDialog");
  els.aboutClose = document.querySelector("#aboutClose");
  els.installPwaButton = document.querySelector("#installPwaButton");
  els.accountButton = document.querySelector("#accountButton");
  els.authDialog = document.querySelector("#authDialog");
  els.authClose = document.querySelector("#authClose");
  els.authForm = document.querySelector("#authForm");
  els.authEmail = document.querySelector("#authEmail");
  els.authOtp = document.querySelector("#authOtp");
  els.otpLabel = document.querySelector("#otpLabel");
  els.authSubmit = document.querySelector("#authSubmit");
  els.authSigned = document.querySelector("#authSigned");
  els.authIdentity = document.querySelector("#authIdentity");
  els.syncNowButton = document.querySelector("#syncNowButton");
  els.signOutButton = document.querySelector("#signOutButton");
  els.syncStatus = document.querySelector("#syncStatus");
  els.filterPanel = document.querySelector("#filterPanel");
  els.fieldHint = document.querySelector("#fieldHint");
  els.searchInput = document.querySelector("#searchInput");
  els.catNameInput = document.querySelector("#catNameInput");
  els.moodChips = document.querySelector("#moodChips");
  els.moodCombo = document.querySelector("#moodCombo");
  els.moodInput = document.querySelector("#moodInput");
  els.moodCaret = document.querySelector("#moodCaret");
  els.moodListbox = document.querySelector("#moodListbox");
  els.moodValue = document.querySelector("#moodValue");
  els.favoriteOnly = document.querySelector("#favoriteOnly");
  els.sortCombo = document.querySelector("#sortCombo");
  els.sortInput = document.querySelector("#sortInput");
  els.sortCaret = document.querySelector("#sortCaret");
  els.sortListbox = document.querySelector("#sortListbox");
  els.sortValue = document.querySelector("#sortValue");
  els.saveDialog = document.querySelector("#saveDialog");
  els.saveForm = document.querySelector("#saveForm");
  els.discardDraft = document.querySelector("#discardDraft");
  els.toast = document.querySelector("#toast");
}

function bindEvents() {
  els.languageToggle?.addEventListener("click", () => {
    window.I18n?.toggle();
    window.meowPet?.setLanguage?.(window.I18n?.language);
  });
  window.addEventListener("meow:language-change", refreshLanguage);
  window.meowPet?.onLanguage?.((language) => window.I18n?.setLanguage(language));
  els.accountButton?.addEventListener("click", () => els.authDialog?.showModal());
  els.authClose?.addEventListener("click", () => els.authDialog?.close());
  els.authForm?.addEventListener("submit", handleAuthSubmit);
  els.syncNowButton?.addEventListener("click", () => window.CloudSync?.syncNow());
  els.signOutButton?.addEventListener("click", () => window.CloudSync?.signOut());
  els.aboutButton?.addEventListener("click", () => els.aboutDialog?.showModal());
  els.aboutClose?.addEventListener("click", () => els.aboutDialog?.close());
  els.installPwaButton?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    els.installPwaButton.hidden = true;
  });

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if (els.installPwaButton) els.installPwaButton.hidden = false;
  });

  els.recordButton.addEventListener("click", () => {
    if (state.isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  });

  els.searchInput.addEventListener("input", (event) => {
    state.filters.query = event.target.value;
    render();
  });

  els.catNameInput.addEventListener("input", (event) => {
    state.settings.catName = event.target.value.trim();
    persistSettings();
  });

  /*
    休息模式：空闲一会儿就把所有 UI 淡出，只剩泡泡。
    ⚠️ 只监听 pointermove 和 keydown，故意不监听 pointerdown ——
    因为"戳泡泡"正是休息本身，戳的时候把工具栏叫回来会破坏气氛。
  */
  window.addEventListener("pointermove", wakeUp, { passive: true });
  window.addEventListener("keydown", wakeUp);
  els.saveDialog.addEventListener("close", wakeUp);
  scheduleRest();

  els.favoriteOnly.addEventListener("click", () => {
    state.filters.favoriteOnly = !state.filters.favoriteOnly;
    render();
  });


  els.moodChips.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mood]");
    if (!button) return;
    state.filters.mood = button.dataset.mood;
    render();
  });

  els.searchToggle.addEventListener("click", () => {
    const open = els.filterPanel.hidden;
    els.filterPanel.hidden = !open;
    els.searchToggle.setAttribute("aria-expanded", String(open));
    if (open) els.searchInput.focus();
  });

  // 无障碍镜像里的按钮：键盘用户从这里戳泡泡
  els.srMirror.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bubble]");
    if (!button) return;
    const item = state.meows.find((meow) => meow.id === button.dataset.bubble);
    if (item) playItem(item);
  });

  els.saveForm.addEventListener("submit", (event) => {
    event.preventDefault();
    saveDraft();
  });

  els.discardDraft.addEventListener("click", () => {
    state.draft = null;
    els.saveDialog.close();
    showToast(t("toastDiscard"));
  });
}

/* ====================================================================
   桌宠模式（仅 Electron 下生效，浏览器里这段整个跳过）
   ==================================================================== */

function setupDesktopPet() {
  if (!window.meowPet?.isPet) return;
  els.body.classList.add("is-pet");
  BubbleField.setPetRitual(true);
  window.DomiPet?.init({ getItems: () => state.meows.filter(isCollectedRecording) });

  let lastX = -1;
  let lastY = -1;
  let interactive = false;
  let draggingPet = false;

  const evaluate = () => {
    if (state.controlMode || lastX < 0) return;
    if (draggingPet) {
      if (!interactive) {
        interactive = true;
        window.meowPet.setInteractive(true);
      }
      return;
    }
    const over = BubbleField.hitTestAt(lastX, lastY) || window.DomiPet?.hitTestAt(lastX, lastY);
    if (over === interactive) return;
    interactive = over;
    window.meowPet.setInteractive(over);
  };

  window.addEventListener("mousemove", (event) => {
    lastX = event.clientX;
    lastY = event.clientY;
    if (draggingPet) window.DomiPet?.dragTo(lastX, lastY);
    evaluate();
  }, { passive: true });

  window.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !window.DomiPet?.beginDrag(event.clientX, event.clientY)) return;
    draggingPet = true;
    interactive = true;
    window.meowPet.setInteractive(true);
    event.preventDefault();
  });

  window.addEventListener("pointerup", () => {
    if (!draggingPet) return;
    draggingPet = false;
    window.DomiPet?.endDrag();
    evaluate();
  });
  window.addEventListener("pointercancel", () => {
    if (!draggingPet) return;
    draggingPet = false;
    window.DomiPet?.endDrag();
    evaluate();
  });
  window.addEventListener("blur", () => {
    if (!draggingPet) return;
    draggingPet = false;
    window.DomiPet?.endDrag();
    evaluate();
  });

  /*
    ⚠️ 光有 mousemove 是不够的。
    鼠标不动、泡泡自己飘走的情况下不会有任何事件，
    窗口就会一直卡在"可交互"状态，把你正在工作的窗口整块挡住。
    所以必须用定时器按最后已知坐标重新判定。
  */
  window.setInterval(evaluate, 160);

  window.meowPet.onControlMode((on) => {
    state.controlMode = on;
    els.body.classList.toggle("is-control", on);
    window.DomiPet?.setControlMode(on);
    if (on) {
      wakeUp();
    } else {
      interactive = false;
      scheduleRest();
    }
  });

  window.meowPet.onShowtime(() => {
    window.clearTimeout(state.petClearTimer);
    window.DomiPet?.startShowtime(() => {
      window.meowPet.showtimeDone();
      if (state.petAutoClearMinutes > 0) {
        state.petClearTimer = window.setTimeout(
          () => BubbleField.clearAll(false),
          state.petAutoClearMinutes * 60 * 1000
        );
      }
    });
  });

  window.meowPet.onPetCorner?.((corner) => window.DomiPet?.setCorner(corner));
  window.meowPet.onAutoClear?.((minutes) => {
    state.petAutoClearMinutes = Math.max(0, Number(minutes) || 0);
  });
  window.meowPet.onClearBubbles?.(() => {
    window.clearTimeout(state.petClearTimer);
    BubbleField.clearAll(false);
  });

  window.addEventListener("contextmenu", (event) => {
    if (!window.DomiPet?.hitTestAt(event.clientX, event.clientY)) return;
    event.preventDefault();
    window.meowPet.openPetMenu?.();
  });

  // 控制界面里按 Esc 退回穿透状态，不用每次都去点托盘
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.controlMode) window.meowPet.exitControlMode();
  });
}

/* ====================================================================
   休息模式
   这不是"省电"，是产品定位：工作间隙的治愈时刻。
   休息的时候不该看见搜索框、筛选器和按钮 —— 那些是工具的语言。
   ==================================================================== */

/* ====================================================================
   两套模式 —— 不是两种布局，是两个产品

   capture（手机）：工具。你是来录一段猫叫的。
     录音按钮永远在、永远大；泡泡密度降到三分之一，只当背景；
     不进休息模式（把录音按钮藏起来是敌意设计）。

   ambient（电脑）：屏保。你工作累了抬眼看两眼。
     泡泡撑满屏幕，那是全部内容；空闲 4 秒界面退场。
   ==================================================================== */

function currentMode() {
  return window.innerWidth >= 720 ? "ambient" : "capture";
}

function applyMode() {
  const mode = currentMode();
  if (state.mode === mode) return;
  state.mode = mode;
  els.body.classList.toggle("mode-ambient", mode === "ambient");
  els.body.classList.toggle("mode-capture", mode === "capture");
  BubbleField.setMode(mode);
  if (mode === "capture") wakeUp();
  else scheduleRest();
}

function isAmbientDevice() {
  return state.mode === "ambient";
}

function scheduleRest() {
  window.clearTimeout(state.restTimer);
  if (!isAmbientDevice()) return;
  // 录音中和填表中不该进入休息，用户正在做正事
  if (state.isRecording || els.saveDialog.open) return;
  state.restTimer = window.setTimeout(() => {
    state.isRecording || els.saveDialog.open ? scheduleRest() : enterRest();
  }, REST_IDLE_MS);
}

function enterRest() {
  state.isResting = true;
  els.body.classList.add("is-resting");
}

function wakeUp() {
  if (state.isResting) {
    state.isResting = false;
    els.body.classList.remove("is-resting");
  }
  scheduleRest();
}

async function startRecording() {
  if (state.isRecording) return;

  if (!canUseMediaRecorder()) {
    failRecording("这个设备暂时无法使用麦克风，没有保存空泡泡。");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        /*
          ⚠️ 默认关掉浏览器自带降噪。
          它的模型是针对人声训练的 —— 判断"什么该保留"的标准是人类语音的频谱，
          猫叫很可能被整段判成噪声消掉。这是这类项目的典型翻车点。
          做成可开关，你自己 A/B 一次就知道对多米有没有伤害。
        */
        noiseSuppression: Boolean(state.settings.noiseSuppression),
        echoCancellation: false,
        autoGainControl: false,
        channelCount: 1
      }
    });
    const mimeType = pickRecorderMimeType();
    state.chunks = [];
    state.recordingStream = stream;

    // 麦克风 → 高通 → 提亮 → 限幅 → 录音器
    const chain = buildRecordingChain(stream);
    state.recordChain = chain;
    state.mediaRecorder = new MediaRecorder(chain.stream, mimeType ? { mimeType } : undefined);
    state.recordingStartedAt = Date.now();
    let recorderFailed = false;

    state.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) state.chunks.push(event.data);
    });

    state.mediaRecorder.addEventListener("error", () => {
      if (recorderFailed) return;
      recorderFailed = true;
      stopRecordingStream();
      state.mediaRecorder = null;
      setRecordingState(false, t("recordQuiet"));
      failRecording(t("recordInterrupted"));
    });

    state.mediaRecorder.addEventListener("stop", async () => {
      if (recorderFailed) return;
      const duration = Math.max(getRecordingDuration(), 1);
      const type = state.mediaRecorder?.mimeType || mimeType || "audio/webm";
      const blob = new Blob(state.chunks, { type });
      stopRecordingStream();
      state.mediaRecorder = null;

      if (!blob.size) {
        failRecording(t("recordEmpty"));
        return;
      }

      const audioUrl = URL.createObjectURL(blob);
      const analysis = await analyzeRecording(blob);
      openSaveDraft({
        id: makeId(),
        title: suggestTitle(),
        audioUrl,
        audioBlob: blob,
        // 用实际有声的长度，而不是"按住按钮多久" —— 前后的静音不算数
        duration: Math.max(Math.round(analysis.speechDuration) || duration, 1),
        source: "recorded",
        waveform: analysis.waveform,
        trimStart: analysis.trimStart,
        trimEnd: analysis.trimEnd
      });
    });

    startLiveAnalyser(stream);
    state.mediaRecorder.start(250);
    setRecordingState(true, t("recordGrowing"));
  } catch (error) {
    stopRecordingStream();
    state.mediaRecorder = null;
    failRecording(t("recordMicDenied"));
  }
}

function stopRecording() {
  if (!state.isRecording) return;

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  } else {
    stopRecordingStream();
  }

  setRecordingState(false, t("recordDry"));
}

function failRecording(message) {
  stopRecordingStream();
  state.mediaRecorder = null;
  state.chunks = [];
  setRecordingState(false, t("recordDry"));
  showToast(message);
}

/* ====================================================================
   录音处理链
   --------------------------------------------------------------------
   刻意不上 RNNoise 之类的重型降噪：那些模型都是按人声训练的，
   对猫叫是"误伤"风险大于收益。对这个产品真正有用的是下面三件事，
   全部是 Web Audio 原生节点，零依赖。

   注意这条链插在 麦克风 和 MediaRecorder 之间，是实时处理 ——
   录完的 blob 本身就是处理过的，不需要重新编码
   （浏览器没法把 AudioBuffer 再编回 opus，重编码只能退化成体积大 10 倍的 WAV）。
   ==================================================================== */

function buildRecordingChain(stream) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return { stream, analyser: null, close() {} };

  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);

    /*
      1) 高通 120Hz —— 干掉空调、风扇、桌面震动、电流声这些低频轰鸣。
      猫叫的基频在 700–1500Hz，完全不受影响。
      这是唯一"绝对安全"的降噪：它不做任何判断，只是切掉一段猫用不到的频率。
    */
    const highpass = ctx.createBiquadFilter();
    highpass.type = "highpass";
    highpass.frequency.value = 120;
    highpass.Q.value = 0.7;

    /*
      2) 提亮 —— 比降噪重要得多。
      猫通常离麦克风远、叫声轻，原样录下来小到听不见，
      戳破泡泡却几乎没声音，整个交互就废了。
    */
    const boost = ctx.createGain();
    boost.gain.value = 2.6;

    /*
      3) 限幅 —— 兜住提亮带来的爆音。
      没有它，一声近距离的大叫会直接削顶变成刺啦声。
      attack 要非常短(2ms)，猫叫的起音很陡，慢了就来不及压住第一下。
    */
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.12;

    const dest = ctx.createMediaStreamDestination();

    source.connect(highpass);
    highpass.connect(boost);
    boost.connect(limiter);
    limiter.connect(dest);
    // ⚠️ 绝不能连 ctx.destination —— 那会把麦克风的声音外放出来，直接啸叫

    return { stream: dest.stream, ctx, close: () => ctx.close().catch(() => {}) };
  } catch (error) {
    // 处理链搭不起来就退回原始流，宁可没处理也不能录不成
    return { stream, analyser: null, close() {} };
  }
}

/* ====================================================================
   录音时的实时声音分析
   MediaRecorder 只负责"存下来"，它不给你任何实时波形。
   想让泡泡跟着声音抖，必须另外接一条 Web Audio 的分析支路。
   ==================================================================== */

function startLiveAnalyser(stream) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  try {
    const ctx = new AudioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.72; // 平滑一点，否则泡泡会抽搐
    source.connect(analyser);
    // ⚠️ 故意不连 ctx.destination —— 连了就会把麦克风的声音放出来，直接啸叫
    state.liveCtx = ctx;
    state.liveAnalyser = analyser;
  } catch (error) {
    // 分析失败不该影响录音本身，静默降级成"假抖动"
  }
}

function stopLiveAnalyser() {
  if (state.liveRaf) cancelAnimationFrame(state.liveRaf);
  state.liveRaf = null;
  if (state.liveCtx) {
    state.liveCtx.close();
    state.liveCtx = null;
  }
  state.liveAnalyser = null;
}

function pumpRecordingVisual() {
  if (!state.isRecording) return;

  const duration = (Date.now() - state.recordingStartedAt) / 1000;
  let level = 0.3;
  let pitch = 0.35;

  if (state.liveAnalyser) {
    const data = new Uint8Array(state.liveAnalyser.frequencyBinCount);
    state.liveAnalyser.getByteFrequencyData(data);

    let sum = 0;
    let weighted = 0;
    for (let i = 0; i < data.length; i += 1) {
      sum += data[i];
      weighted += data[i] * i;
    }

    level = Math.min(1, sum / data.length / 78);
    /*
      音高的廉价近似：频谱质心（能量的重心落在高频还是低频）。
      真正的基频检测要做自相关或 YIN 算法，成本高得多。
      但这里的目的只是"决定泡泡什么颜色"，质心完全够用 ——
      工程上很多时候，够用的近似比正确的算法更值。
    */
    pitch = sum > 0 ? Math.min(1, weighted / sum / (data.length * 0.4)) : 0.35;
  } else {
    // 没有麦克风时的假抖动，让模拟录音也有反馈
    const t = performance.now() * 0.004;
    level = 0.32 + Math.sin(t) * 0.18 + Math.sin(t * 2.3) * 0.1;
    pitch = 0.4 + Math.sin(t * 0.6) * 0.2;
  }

  BubbleField.setRecording({ duration, level, pitch });
  state.liveRaf = requestAnimationFrame(pumpRecordingVisual);
}

function setRecordingState(isRecording, label = t("recordDry")) {
  state.isRecording = isRecording;
  els.recordButton.setAttribute("aria-pressed", String(isRecording));
  els.recordButton.setAttribute("aria-label", t(isRecording ? "recordStopAria" : "recordStartAria"));
  els.recordButtonText.textContent = t(isRecording ? "recordStop" : "recordStart");
  els.recordState.textContent = label;
  els.body.classList.toggle("is-recording", isRecording);

  if (state.timerId) window.clearInterval(state.timerId);
  if (isRecording) {
    updateTimer();
    state.timerId = window.setInterval(updateTimer, 300);
    pumpRecordingVisual(); // 逐帧驱动那颗正在被吹大的泡泡
  } else {
    window.clearInterval(state.timerId);
    state.timerId = null;
    els.recordTimer.textContent = "00:00";
    stopLiveAnalyser();
    BubbleField.setRecording(null);
  }
}

function updateTimer() {
  els.recordTimer.textContent = formatDuration(getRecordingDuration());
}

function getRecordingDuration() {
  return Math.round((Date.now() - state.recordingStartedAt) / 1000);
}

function canUseMediaRecorder() {
  return Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
}

function pickRecorderMimeType() {
  if (!window.MediaRecorder?.isTypeSupported) return "";
  return RECORDER_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function stopRecordingStream() {
  if (state.recordChain) {
    state.recordChain.close();
    state.recordChain = null;
  }
  if (!state.recordingStream) return;
  state.recordingStream.getTracks().forEach((track) => track.stop());
  state.recordingStream = null;
}

function openSaveDraft(draft) {
  state.draft = {
    ...draft,
    waveform: draft.waveform || generateWaveform(draft.id)
  };

  els.saveForm.elements.title.value = draft.title;
  setMoodValue(pickDefaultMood());
  els.saveForm.elements.tags.value = "刚吹出, 奶音";
  els.saveForm.elements.note.value = draft.source === "recorded" ? "本次会话录到的一颗声音泡泡。" : "没有麦克风时生成的小小占位泡泡。";

  els.saveDialog.showModal();
  els.saveForm.elements.title.focus();
  showToast(t("toastName"));
}

async function saveDraft() {
  if (!state.draft) return;

  const form = new FormData(els.saveForm);
  const mood = String(form.get("mood"));
  const audioBlob = state.draft.audioBlob;
  const audioKey = audioBlob ? makeAudioKey(state.draft.id) : state.draft.audioKey || "";
  const item = {
    ...state.draft,
    title: cleanText(form.get("title"), "刚捡到的一声"),
    catName: state.settings.catName || "多米",
    mood,
    tags: splitTags(form.get("tags")),
    note: cleanText(form.get("note"), "一颗还没写来历的小泡泡。"),
    favorite: false,
    playCount: 0,
    createdAt: new Date().toISOString(),
    color: getMood(mood).color,
    audioKey
  };

  delete item.audioBlob;

  if (audioBlob && audioKey) {
    try {
      await putAudioBlob(audioKey, audioBlob);
    } catch (error) {
      showToast(t("toastSaveFail"));
      return;
    }
  }

  // 第一段真实录音存下的那一刻，示例整批退场
  const retired = retireDemoSounds();
  state.meows.unshift(item);
  state.draft = null;
  persist();
  els.saveDialog.close();
  if (retired) showToast("示例声音先退下，这里交给多米了。");
  render();
  showToast(t("toastSaved"));
}

/*
  戳破就响 —— 不再是"点一下播放、再点一下暂停"。
  泡泡破掉是个一次性动作，不存在"暂停一颗已经破了的泡泡"这种心智模型。
  交互隐喻一旦选定，代码里的状态机就该跟着简化。
*/
async function playItem(item) {
  stopCurrentSound();
  state.currentPlayingId = item.id;

  const audioUrl = item.audioUrl || await getAudioUrlForItem(item);

  if (audioUrl) {
    const audio = new Audio(audioUrl);
    state.currentAudio = audio;

    /*
      应用首尾静音裁剪。
      这一步对手感的影响比降噪大得多 —— 泡泡"啪"一下破了，
      如果中间隔着半秒空白才出声，那一瞬间的因果关系就断了，治愈感也没了。
    */
    const from = Number(item.trimStart) || 0;
    const to = Number(item.trimEnd) || 0;
    if (from > 0) {
      audio.addEventListener("loadedmetadata", () => { audio.currentTime = from; }, { once: true });
    }
    if (to > from) {
      audio.addEventListener("timeupdate", () => {
        if (audio.currentTime >= to) {
          audio.pause();
          finishPlay(item);
        }
      });
    }

    audio.addEventListener("ended", () => finishPlay(item));
    audio.addEventListener("error", () => {
      stopCurrentSound();
      showToast(t("toastAudioFail"));
      state.currentPlayingId = item.id;
      playMockSound(item);
      render();
    });
    audio.play().catch(() => {
      stopCurrentSound();
      state.currentPlayingId = item.id;
      playMockSound(item);
      render();
    });
  } else {
    playMockSound(item);
  }

  render();
}

function playMockSound(item) {
  const playback = createMockPlayback(item);
  if (!playback) {
    state.currentMockTimer = window.setTimeout(() => {
      if (state.currentPlayingId === item.id) finishPlay(item);
    }, 900);
    return;
  }

  state.currentMockStop = playback.stop;

  state.currentMockTimer = window.setTimeout(() => {
    if (state.currentPlayingId !== item.id) return;
    playback.stop();
    finishPlay(item);
  }, playback.durationMs);
}

function finishPlay(item) {
  item.playCount += 1;
  stopCurrentSound(false);
  state.currentPlayingId = null;
  persist();
  render();
}

function stopCurrentSound(reset = true) {
  if (state.currentAudio) {
    state.currentAudio.pause();
    state.currentAudio = null;
  }

  if (state.currentMockStop) {
    state.currentMockStop();
    state.currentMockStop = null;
  }

  if (state.currentMockTimer) {
    window.clearTimeout(state.currentMockTimer);
    state.currentMockTimer = null;
  }

  if (reset) state.currentPlayingId = null;
}

function toggleFavorite(item) {
  item.favorite = !item.favorite;
  persist();
  render();
  showToast(t(item.favorite ? "toastFavOn" : "toastFavOff"));
}

function render() {
  renderCount();
  renderFilterState();
  syncField();
  renderMirror();
}

/*
  筛选直接作用在漂浮层：
  把"当前该显示哪些泡泡"整份交给 BubbleField，
  由它决定谁淡出飘走、谁淡入进场。app.js 不关心动画。
*/
function syncField() {
  const list = getVisibleMeows();
  BubbleField.setItems(list);
  // 邀请，不是说明书 —— 休息产品不该有操作指引的语气
  els.fieldHint.textContent = list.length ? t("fieldListen", { name: catLabel() }) : t("fieldEmpty");
}

/*
  无障碍镜像：canvas 对屏幕阅读器是完全不可见的，
  这个隐藏列表是键盘和读屏用户唯一能操作泡泡的入口。
*/
function renderMirror() {
  const list = getVisibleMeows();
  els.srMirror.innerHTML = list
    .map(
      (item) => `<li><button type="button" data-bubble="${item.id}">
        戳破 ${escapeHtml(item.title)}，来自${escapeHtml(item.catName)}，${formatDuration(item.duration)}，已戳 ${item.playCount} 次
      </button></li>`
    )
    .join("");
}

// 计数文案里带上猫名，一句话就把"这是谁的声音"说清楚
function catLabel() {
  const name = state.settings.catName || "多米";
  return window.I18n?.language === "en" && name === "多米" ? "domi" : name;
}

function renderCount() {
  const count = state.meows.length;
  const favs = state.meows.filter((item) => item.favorite).length;
  els.collectionCount.textContent = t(favs ? "collectionFav" : "collection", { name: catLabel(), count, favs });
}

function renderFilterState() {
  els.favoriteOnly.setAttribute("aria-pressed", String(state.filters.favoriteOnly));
  [...els.moodChips.querySelectorAll("[data-mood]")].forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mood === state.filters.mood));
  });
}

function renderMoodChips() {
  els.moodChips.innerHTML = allMoods().map((mood) => {
    // "全部"没有对应表情，留空图标位，避免硬凑一个看不懂的图形
    const face = mood.id === "all"
      ? ""
      : `<img class="chip-face" src="${BubbleField.faceDataUrl(mood.id, 28)}" alt="" />`;
    return `<button class="chip" type="button" data-mood="${mood.id}" aria-pressed="false">${face}${moodLabel(mood)}</button>`;
  }).join("");
}

/* ====================================================================
   下拉组件（可复用）
   自己实现而不是用原生 <select>：原生下拉列表由操作系统绘制，
   CSS 一个属性都管不到，手绘风格到那里必然断掉。

   两处在用：
     声音类型 —— 可输入、可新建
     排序方式 —— 只读，纯选择
   抽成一个工厂而不是复制两份 —— 否则以后改一处忘一处，必然发散。
   ==================================================================== */

function createDropdown(config) {
  const { root, input, caret, hidden, listbox, getOptions, allowCreate, onCreate, onChange } = config;

  /*
    typed 这个标志很关键。
    输入框里平时显示着当前选中项的名字，如果直接把它当搜索词，
    一展开就只剩那一项 —— 用户看不到别的选择。
    所以：展开时列全部，只有用户真的敲了字才开始过滤。
  */
  const s = { open: false, active: 0, items: [], typed: false };

  function open() {
    if (s.open) return;
    s.open = true;
    s.typed = false;
    root.dataset.open = "true";
    listbox.hidden = false;
    input.setAttribute("aria-expanded", "true");
    // 高亮定位到当前选中项，方向键从"我现在选的"开始走，而不是从头
    const index = getOptions().findIndex((option) => option.value === hidden.value);
    s.active = index >= 0 ? index : 0;
    render();
  }

  function close() {
    if (!s.open) return;
    s.open = false;
    root.dataset.open = "false";
    listbox.hidden = true;
    input.setAttribute("aria-expanded", "false");
    /*
      输入到一半没选就关掉的话，把文字还原成当前真正生效的那个。
      否则输入框会显示一个并不生效的值 —— 典型的"界面在骗人"。
    */
    const current = getOptions().find((option) => option.value === hidden.value);
    if (current) input.value = current.label;
  }

  function render() {
    const query = s.typed ? input.value.trim().toLowerCase() : "";
    const options = getOptions();
    const matched = query
      ? options.filter((option) => option.label.toLowerCase().includes(query))
      : options;
    const isExact = options.some((option) => option.label.toLowerCase() === query);

    s.items = matched.map((option) => ({ value: option.value, label: option.label, icon: option.icon }));
    if (allowCreate && query && !isExact) {
      s.items.unshift({ value: "", label: input.value.trim(), create: true });
    }
    s.active = clamp(s.active, 0, Math.max(0, s.items.length - 1));

    if (!s.items.length) {
      listbox.innerHTML = `<li class="combo-empty">${
        allowCreate ? "没有这一种，敲个名字就能自己建" : "没有匹配的"
      }</li>`;
      return;
    }

    listbox.innerHTML = s.items
      .map((item, index) => {
        const active = index === s.active;
        if (item.create) {
          return `<li class="combo-option is-create" role="option" aria-selected="false"
            data-value="" data-label="${escapeHtml(item.label)}" data-active="${active}"
            >＋ 新建「<strong>${escapeHtml(item.label)}</strong>」</li>`;
        }
        const icon = item.icon ? `<img src="${item.icon}" alt="" />` : "";
        const selected = hidden.value === item.value;
        return `<li class="combo-option" role="option" aria-selected="${selected}"
          data-value="${escapeHtml(item.value)}" data-label="${escapeHtml(item.label)}" data-active="${active}"
          >${icon}${escapeHtml(item.label)}</li>`;
      })
      .join("");

    const activeEl = listbox.querySelector('[data-active="true"]');
    if (activeEl) activeEl.scrollIntoView({ block: "nearest" });
  }

  function choose(value, label) {
    if (!value && allowCreate) {
      const made = onCreate(label);
      if (!made) return;
      setValue(made.id);
    } else {
      setValue(value);
    }
    close();
    if (onChange) onChange(hidden.value);
  }

  function setValue(value) {
    const options = getOptions();
    const option = options.find((entry) => entry.value === value) || options[0];
    if (!option) return;
    hidden.value = option.value;
    input.value = option.label;
  }

  input.addEventListener("focus", open);
  input.addEventListener("click", open);
  input.addEventListener("input", () => {
    s.typed = true;
    s.active = 0;
    open();
    render();
  });
  input.addEventListener("blur", close);

  caret.addEventListener("click", () => {
    if (s.open) {
      close();
    } else {
      input.focus();
      open();
    }
  });

  /*
    用 mousedown 而不是 click。
    click 要等 mouseup，而 mousedown 时 input 已经先 blur 了 ——
    列表会在点中之前就关掉。preventDefault 阻止 blur，焦点留在输入框。
  */
  listbox.addEventListener("mousedown", (event) => {
    const option = event.target.closest("[data-value]");
    if (!option) return;
    event.preventDefault();
    choose(option.dataset.value, option.dataset.label);
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!s.open) {
        open();
        return;
      }
      const step = event.key === "ArrowDown" ? 1 : -1;
      s.active = (s.active + step + s.items.length) % s.items.length;
      render();
      return;
    }

    if (event.key === "Enter" && s.open) {
      // 不 preventDefault 的话回车会顺手提交整个表单
      event.preventDefault();
      const item = s.items[s.active];
      if (item) choose(item.value, item.label);
      return;
    }

    if (event.key === "Escape" && s.open) {
      // 同样要拦住，否则 <dialog> 会跟着一起被关掉
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  });

  return { setValue, refresh: render };
}

let moodDropdown = null;
let sortDropdown = null;

function setupDropdowns() {
  moodDropdown = createDropdown({
    root: els.moodCombo,
    input: els.moodInput,
    caret: els.moodCaret,
    hidden: els.moodValue,
    listbox: els.moodListbox,
    allowCreate: true,
    getOptions: () =>
      selectableMoods().map((mood) => ({
        value: mood.id,
        label: moodLabel(mood),
        icon: BubbleField.faceDataUrl(mood.id, 30)
      })),
    onCreate: (label) => createCustomMood(label)
  });

  sortDropdown = createDropdown({
    root: els.sortCombo,
    input: els.sortInput,
    caret: els.sortCaret,
    hidden: els.sortValue,
    listbox: els.sortListbox,
    allowCreate: false,
    getOptions: () => SORTS.map((sort) => ({ ...sort, label: t(sort.labelKey) })),
    onChange: (value) => {
      state.filters.sortBy = value;
      render();
    }
  });

  sortDropdown.setValue(state.filters.sortBy);
}

function setMoodValue(id) {
  moodDropdown.setValue(getMood(id).id);
}

function getVisibleMeows() {
  let list = [...state.meows];
  const query = state.filters.query.trim().toLowerCase();

  if (state.filters.mood !== "all") {
    list = list.filter((item) => item.mood === state.filters.mood);
  }

  if (state.filters.favoriteOnly) {
    list = list.filter((item) => item.favorite);
  }

  if (query) {
    list = list.filter((item) => {
      return [item.title, item.catName, item.note, ...item.tags].join(" ").toLowerCase().includes(query);
    });
  }

  if (state.filters.sortBy === "popular") {
    return list.sort((a, b) => b.playCount - a.playCount);
  }

  return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function restoreSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
    if (saved.catName) state.settings.catName = String(saved.catName).slice(0, 16);

    // 自建类型逐条校验再收下：存储可能被手改过、也可能是旧版本写的
    if (Array.isArray(saved.customMoods)) {
      state.settings.customMoods = saved.customMoods
        .filter((mood) => mood && typeof mood.id === "string" && typeof mood.label === "string")
        .map((mood) => ({
          id: mood.id,
          label: String(mood.label).slice(0, 12),
          hue: Number.isFinite(mood.hue) ? mood.hue : hashString(mood.label) % 360,
          color: mood.color || `hsl(${hashString(mood.label) % 360} 72% 90%)`,
          custom: true
        }));
    }
  } catch (error) {
    // 设置读坏了不该拦住 App 启动，用默认值继续
  }
  // 老数据里已经有猫名的话，直接沿用，别让用户再填一次
  if (!state.settings.catName && state.meows[0]?.catName) {
    state.settings.catName = state.meows[0].catName;
  }
  els.catNameInput.value = catLabel();
}

function persistSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings));
}

// 一次性搬迁：把旧 key 的内容挪到新 key，挪完保留旧的当备份
function migrateLegacyKeys() {
  for (const [target, legacy] of [[STORAGE_KEY, LEGACY_KEYS.data], [SETTINGS_KEY, LEGACY_KEYS.settings]]) {
    if (!localStorage.getItem(target) && localStorage.getItem(legacy)) {
      localStorage.setItem(target, localStorage.getItem(legacy));
    }
  }
}

/* ====================================================================
   内置示例声音

   这个产品的原则是"只有真实录音才算数" —— isCollectedRecording 会滤掉
   旧版的 seed 和 mock，那个决定是对的，不该复活。

   但没有猫、或者猫今天不配合的时候，打开是一片空白，
   完全看不出这东西是干嘛的。所以补一类明确标记的 demo：
   它们是**真实音频**（不是合成音），能戳破、能听见；
   并且在用户存下第一段自己的录音时自动退场，绝不和真货混在一起。

   全部 CC0 / 公有领域，来源与作者见 assets/sounds/CREDITS.md。
   这个项目要真实发布，所以刻意避开了 CC BY-SA 这类传染性 copyleft
   和一切来源不明的音频。
   ==================================================================== */

const DEMO_SOUNDS = [
  { mood: "sweet",   file: "sweet.ogg",   title: "求你了喵",     tags: ["撒娇"] },
  { mood: "food",    file: "food.ogg",    title: "开门开门开门", tags: ["急急"] },
  { mood: "sleepy",  file: "sleepy.ogg",  title: "小小一声",     tags: ["奶音"] },
  { mood: "purr",    file: "purr.ogg",    title: "呼噜发动机",   tags: ["呼噜"] },
  { mood: "mystery", file: "mystery.ogg", title: "门缝里的嗯？", tags: ["疑惑"] },
  { mood: "protest", file: "protest.wav", title: "暹罗猫的抗议", tags: ["拖长音"] }
];

function installDemoSounds() {
  if (state.meows.length) return;
  const now = Date.now();
  state.meows = DEMO_SOUNDS.map((sound, index) => normalizeItem({
    id: `demo-${sound.mood}`,
    title: sound.title,
    catName: "示例",
    mood: sound.mood,
    tags: sound.tags.concat("示例"),
    note: "网上找来的公共素材。录下你自己的猫之后，它就退场了。",
    duration: 3,
    audioUrl: `assets/sounds/${sound.file}`,
    source: "demo",
    createdAt: new Date(now - index * 60000).toISOString()
  }));
  persist();
  analyzeDemoSounds();
}

// 存下第一段真实录音时，示例整批退场 —— 不和真货混在一起
function retireDemoSounds() {
  const before = state.meows.length;
  state.meows = state.meows.filter((item) => item.source !== "demo");
  return state.meows.length !== before;
}

/*
  示例的波形必须来自真实解码，不能用 generateWaveform 编。
  泡泡的大小和颜色是从波形算出来的 —— 编一个波形，
  "这颗泡泡代表这段声音"这件事就成了假的，而那正是这个产品的核心。
  所以启动后异步解码真实文件，拿到响度分布和有声时长再回写。
*/
/*
  从一段长录音里挑出"最值得听的那一小段"。

  analyzeRecording 取的是首个到末个有声点 —— 对用户自己录的一声喵是对的，
  但网上的公共素材常常是十几秒里散落着好几声，那样算出来会横跨整个文件。
  戳破一颗泡泡然后等 12 秒，治愈感直接归零。

  所以用滑动窗口找能量最高的 ~2 秒，再向两侧收缩到安静处，
  避免从半个音节中间切进去。
*/
async function pickLoudestWindow(blob, maxSeconds = 2.2) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext || !blob.size) return null;
  const ctx = new AudioContext();
  try {
    const audioBuffer = await ctx.decodeAudioData((await blob.arrayBuffer()).slice(0));
    const channel = audioBuffer.getChannelData(0);
    const rate = audioBuffer.sampleRate;
    const win = Math.max(1, Math.round(rate * 0.02)); // 20ms 一格，和 analyzeRecording 一致

    const frames = [];
    for (let i = 0; i < channel.length; i += win) {
      const end = Math.min(channel.length, i + win);
      let sum = 0;
      for (let j = i; j < end; j += 1) sum += channel[j] * channel[j];
      frames.push(Math.sqrt(sum / Math.max(1, end - i)));
    }
    if (frames.length < 4) return null;
    // 文件本身就够短就别挑了，整段用；否则滑动窗口会退化出荒唐的结果
    if (audioBuffer.duration <= maxSeconds * 1.15) return null;

    const winFrames = Math.max(1, Math.round(maxSeconds / 0.02));
    let bestStart = 0;
    let bestSum = -1;
    let running = 0;
    for (let i = 0; i < frames.length; i += 1) {
      running += frames[i];
      if (i >= winFrames) running -= frames[i - winFrames];
      if (i >= winFrames - 1 && running > bestSum) {
        bestSum = running;
        bestStart = i - winFrames + 1;
      }
    }

    const sorted = [...frames].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.1)] || 0;
    const peak = sorted[sorted.length - 1] || 0;
    const threshold = Math.max(floor * 2.5, peak * 0.05);

    let s = bestStart;
    let e = Math.min(frames.length - 1, bestStart + winFrames - 1);
    while (s < e && frames[s] < threshold) s += 1;
    while (e > s && frames[e] < threshold) e -= 1;

    const trimStart = Math.max(0, (s * win) / rate - 0.05);
    const trimEnd = Math.min(audioBuffer.duration, ((e + 1) * win) / rate + 0.15);
    // 收缩过头切出个几十毫秒的碎片就当失败，交给整段分析兜底
    if (trimEnd - trimStart < 0.35) return null;

    const from = Math.floor(trimStart * rate);
    const to = Math.max(from + 1, Math.floor(trimEnd * rate));
    const bucket = Math.max(1, Math.floor((to - from) / 12));
    const waveform = Array.from({ length: 12 }, (_, index) => {
      const bs = from + index * bucket;
      const be = Math.min(to, bs + bucket);
      let sum = 0;
      for (let c = bs; c < be; c += 1) sum += Math.abs(channel[c]);
      return Math.max(0.16, Math.min(0.95, (sum / Math.max(1, be - bs)) * 3.6));
    });

    return { waveform, trimStart, trimEnd, speechDuration: trimEnd - trimStart };
  } catch (error) {
    return null;
  } finally {
    ctx.close();
  }
}

async function analyzeDemoSounds() {
  const demos = state.meows.filter((item) => item.source === "demo");
  if (!demos.length) return;
  let changed = false;

  for (const item of demos) {
    try {
      const response = await fetch(item.audioUrl);
      if (!response.ok) continue;
      const blob = await response.blob();
      // 示例是网上的长录音，要挑片段；解不开就退回整段分析
      const info = (await pickLoudestWindow(blob)) || (await analyzeRecording(blob));
      item.waveform = info.waveform;
      item.trimStart = info.trimStart;
      item.trimEnd = info.trimEnd;
      if (info.speechDuration > 0.4) {
        item.duration = Math.max(1, Math.round(info.speechDuration));
      }
      changed = true;
    } catch (error) {
      // 单个文件解不开不该拦住其余的
    }
  }

  if (changed) {
    persist();
    render();
  }
}

function restore() {
  migrateLegacyKeys();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.meows = [];
    installDemoSounds();
    return;
  }

  try {
    const saved = JSON.parse(raw);
    state.meows = Array.isArray(saved)
      ? saved.map(normalizeItem).filter(isCollectedRecording)
      : [];
    // 一次性清掉旧版内置 seed 和录音失败产生的 mock，之后不会再次出现。
    persist();
  } catch (error) {
    state.meows = [];
  }

  // 空的（新装、或刚清空）就补上示例，让人一眼看懂这是什么产品
  if (!state.meows.length) installDemoSounds();
  else if (state.meows.some((item) => item.source === "demo")) analyzeDemoSounds();

  hydrateAudioUrls().then(render);
}

function persist() {
  const serializable = state.meows.map((item) => ({
    ...item,
    audioBlob: undefined,
    audioUrl: item.audioUrl && item.audioUrl.startsWith("blob:") ? "" : item.audioUrl
  }));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
}

function makeAudioKey(id) {
  return `${AUDIO_KEY_PREFIX}${id}`;
}

function openAudioDb() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }

    const request = indexedDB.open(AUDIO_DB_NAME, AUDIO_DB_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME);
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function withAudioStore(mode, operation) {
  const db = await openAudioDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(AUDIO_STORE_NAME, mode);
    const store = transaction.objectStore(AUDIO_STORE_NAME);
    let result;
    let request;

    try {
      request = operation(store);
    } catch (error) {
      db.close();
      reject(error);
      return;
    }

    request.addEventListener("success", () => {
      result = request.result;
    });
    request.addEventListener("error", () => reject(request.error));
    transaction.addEventListener("complete", () => {
      db.close();
      resolve(result);
    });
    transaction.addEventListener("abort", () => {
      db.close();
      reject(transaction.error);
    });
  });
}

function putAudioBlob(key, blob) {
  return withAudioStore("readwrite", (store) => store.put(blob, key));
}

function getAudioBlob(key) {
  return withAudioStore("readonly", (store) => store.get(key));
}

async function getAudioUrlForItem(item) {
  if (!item.audioKey) return "";

  if (state.objectUrls.has(item.audioKey)) {
    const cachedUrl = state.objectUrls.get(item.audioKey);
    item.audioUrl = cachedUrl;
    return cachedUrl;
  }

  try {
    const blob = await getAudioBlob(item.audioKey);
    if (!blob) return "";
    const url = URL.createObjectURL(blob);
    state.objectUrls.set(item.audioKey, url);
    item.audioUrl = url;
    return url;
  } catch (error) {
    return "";
  }
}

async function hydrateAudioUrls() {
  await Promise.all(state.meows.map((item) => getAudioUrlForItem(item)));
}

function isCollectedRecording(item) {
  if (!item || item.source === "seed" || item.source === "mock") return false;
  return Boolean(item.audioKey || item.audioUrl || item.cloudAudioPath);
}

function normalizeItem(item) {
  const id = item.id || makeId();
  const mood = item.mood || "mystery";
  return {
    id,
    title: item.title || "未命名泡泡",
    catName: item.catName || "匿名小猫",
    mood,
    tags: Array.isArray(item.tags) ? item.tags : [],
    note: item.note || "一颗还没写来历的小泡泡。",
    duration: Math.max(1, Number(item.duration) || 3),
    audioUrl: item.audioUrl || "",
    audioKey: item.audioKey || "",
    cloudAudioPath: item.cloudAudioPath || "",
    source: item.source || (item.audioKey || item.audioUrl ? "recorded" : "unknown"),
    favorite: Boolean(item.favorite),
    playCount: Number(item.playCount) || 0,
    createdAt: item.createdAt || new Date().toISOString(),
    color: item.color || getMood(mood).color,
    waveform: Array.isArray(item.waveform) ? item.waveform : generateWaveform(id),
    trimStart: Number(item.trimStart) || 0,
    trimEnd: Number(item.trimEnd) || 0
  };
}

/* ====================================================================
   声音类型：内置 6 种 + 用户自建
   多米可能会发出任何内置分类装不下的声音，所以类型必须可扩展。
   ==================================================================== */

function allMoods() {
  return MOODS.concat(state.settings.customMoods || []);
}

function selectableMoods() {
  return allMoods().filter((mood) => mood.id !== "all");
}

function getMood(id) {
  return allMoods().find((mood) => mood.id === id) || MOODS[0];
}

function createCustomMood(rawLabel) {
  const label = cleanText(rawLabel, "").slice(0, 12);
  if (!label) return null;

  // 同名直接复用，避免用户反复输入同一个词造出一堆重复类型
  const existing = selectableMoods().find((mood) => mood.label === label);
  if (existing) return existing;

  // 色相由名字散列得到 —— 同一个名字永远是同一个颜色，换设备也一致
  const hue = hashString(label) % 360;
  const mood = {
    id: `custom:${hashString(label).toString(36)}`,
    label,
    hue,
    color: `hsl(${hue} 72% 90%)`,
    custom: true
  };

  state.settings.customMoods = (state.settings.customMoods || []).concat(mood);
  persistSettings();
  BubbleField.setMoods(allMoods());
  renderMoodChips();
  renderFilterState();
  return mood;
}

function pickDefaultMood() {
  const options = selectableMoods();
  return options[Math.floor(Math.random() * options.length)].id;
}

function suggestTitle() {
  return TITLE_POOL[Math.floor(Math.random() * TITLE_POOL.length)];
}

function generateWaveform(seed = String(Math.random())) {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) % 997;
  }
  return Array.from({ length: 12 }, (_, index) => {
    const value = Math.sin((hash + index * 23) * 0.37) * 0.5 + 0.5;
    return Math.max(0.16, Math.min(0.95, value));
  });
}

/* ====================================================================
   录完之后的分析：波形 + 首尾静音位置

   为什么只算裁剪点、不真的裁掉音频：
   浏览器没有把 AudioBuffer 编回 opus 的能力，真裁就只能存 WAV，
   体积要大十倍。而 <audio> 本来就支持从任意位置开始播、提前停 ——
   所以把裁剪点当元数据存起来，播放时应用，效果一样且零成本。
   ==================================================================== */

const EMPTY_ANALYSIS = { waveform: generateWaveform(), trimStart: 0, trimEnd: 0, speechDuration: 0 };

async function analyzeRecording(blob) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext || !blob.size) {
    return { ...EMPTY_ANALYSIS, waveform: generateWaveform(String(blob.size)) };
  }

  const ctx = new AudioContext();
  try {
    const buffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const rate = audioBuffer.sampleRate;

    // 20ms 一格算能量。再细会被单个采样的毛刺带偏，再粗会切掉猫叫的起音
    const win = Math.max(1, Math.round(rate * 0.02));
    const frames = [];
    for (let i = 0; i < channel.length; i += win) {
      let sum = 0;
      const end = Math.min(channel.length, i + win);
      for (let j = i; j < end; j += 1) sum += channel[j] * channel[j];
      frames.push(Math.sqrt(sum / Math.max(1, end - i)));
    }

    /*
      阈值取"底噪的 3 倍"和"峰值的 6%"里更大的那个。
      只看峰值百分比，安静房间里的轻声呼噜会被整段当成静音切掉；
      只看底噪倍数，嘈杂环境里又几乎切不掉东西。两个都要。
    */
    const sorted = [...frames].sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * 0.1)] || 0;
    const peak = sorted[sorted.length - 1] || 0;
    const threshold = Math.max(floor * 3, peak * 0.06);

    let first = frames.findIndex((v) => v > threshold);
    let last = -1;
    for (let i = frames.length - 1; i >= 0; i -= 1) {
      if (frames[i] > threshold) { last = i; break; }
    }

    const total = audioBuffer.duration;
    let trimStart = 0;
    let trimEnd = total;

    if (first >= 0 && last > first) {
      // 前留 60ms 免得切掉起音的第一下，后留 200ms 保住尾音的自然衰减
      trimStart = Math.max(0, (first * win) / rate - 0.06);
      trimEnd = Math.min(total, ((last + 1) * win) / rate + 0.2);
    }

    // 波形只统计有声那一段，否则一半格子都是平的
    const from = Math.floor(trimStart * rate);
    const to = Math.max(from + 1, Math.floor(trimEnd * rate));
    const bucket = Math.max(1, Math.floor((to - from) / 12));
    const waveform = Array.from({ length: 12 }, (_, index) => {
      const s = from + index * bucket;
      const e = Math.min(to, s + bucket);
      let sum = 0;
      for (let c = s; c < e; c += 1) sum += Math.abs(channel[c]);
      return Math.max(0.16, Math.min(0.95, (sum / Math.max(1, e - s)) * 3.6));
    });

    return { waveform, trimStart, trimEnd, speechDuration: trimEnd - trimStart };
  } catch (error) {
    return { ...EMPTY_ANALYSIS, waveform: generateWaveform(`${blob.size}:${blob.type}`) };
  } finally {
    ctx.close();
  }
}

function createMockPlayback(item) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;

  const ctx = new AudioContext();
  const analyser = ctx.createAnalyser();
  const masterGain = ctx.createGain();
  const notes = getMockNotes(item.mood);
  const durationMs = Math.min(1400, notes.length * 170 + 260);
  let stopped = false;

  analyser.fftSize = 256;
  masterGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  masterGain.connect(analyser);
  analyser.connect(ctx.destination);

  notes.forEach((note, index) => {
    const start = ctx.currentTime + index * 0.16;
    const osc = ctx.createOscillator();
    const localGain = ctx.createGain();
    osc.type = note.type;
    osc.frequency.setValueAtTime(note.freq, start);
    osc.frequency.exponentialRampToValueAtTime(note.freq * note.end, start + 0.12);
    localGain.gain.setValueAtTime(0.0001, start);
    localGain.gain.linearRampToValueAtTime(0.045, start + 0.03);
    localGain.gain.exponentialRampToValueAtTime(0.0001, start + 0.15);
    osc.connect(localGain);
    localGain.connect(masterGain);
    osc.start(start);
    osc.stop(start + 0.17);
  });

  return {
    analyser,
    durationMs,
    getLevels: () => readAnalyserLevels(analyser),
    stop: () => {
      if (stopped) return;
      stopped = true;
      ctx.close();
    }
  };
}

function readAnalyserLevels(analyser) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  return Array.from({ length: 12 }, (_, index) => {
    const start = Math.floor(index * data.length / 12);
    const end = Math.max(start + 1, Math.floor((index + 1) * data.length / 12));
    let total = 0;
    for (let cursor = start; cursor < end; cursor += 1) total += data[cursor];
    return Math.max(0.16, Math.min(0.95, total / (end - start) / 255));
  });
}

function getMockNotes(mood) {
  const map = {
    sweet: [
      { freq: 660, end: 1.18, type: "sine" },
      { freq: 780, end: 0.92, type: "triangle" },
      { freq: 720, end: 1.08, type: "sine" }
    ],
    food: [
      { freq: 520, end: 1.28, type: "square" },
      { freq: 640, end: 1.22, type: "triangle" },
      { freq: 760, end: 1.16, type: "triangle" }
    ],
    purr: [
      { freq: 110, end: 1.02, type: "sawtooth" },
      { freq: 120, end: 0.98, type: "sawtooth" },
      { freq: 105, end: 1.04, type: "sawtooth" },
      { freq: 118, end: 1.01, type: "sawtooth" }
    ],
    sleepy: [
      { freq: 430, end: 0.82, type: "sine" },
      { freq: 380, end: 0.78, type: "sine" }
    ],
    protest: [
      { freq: 610, end: 0.78, type: "triangle" },
      { freq: 560, end: 1.32, type: "square" },
      { freq: 590, end: 0.86, type: "triangle" }
    ]
  };
  return map[mood] || [
    { freq: 500, end: 1.2, type: "sine" },
    { freq: 700, end: 0.8, type: "triangle" },
    { freq: 540, end: 1.12, type: "sine" }
  ];
}

function splitTags(value) {
  return String(value || "")
    .split(/[,，、\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 4);
}

function cleanText(value, fallback) {
  const text = String(value || "").trim();
  return text || fallback;
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value)));
}

function hashString(value) {
  return String(value).split("").reduce((hash, char) => {
    return (hash * 33 + char.charCodeAt(0)) >>> 0;
  }, 5381);
}

function makeId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `meow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => {
    els.toast.classList.remove("is-visible");
  }, 2200);
}

function moodLabel(mood) {
  return mood.labelKey ? t(mood.labelKey) : mood.label;
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const email = els.authEmail.value.trim();
  const token = els.authOtp.value.trim();
  if (!email) return;
  els.authSubmit.disabled = true;
  try {
    if (els.otpLabel.hidden || !token) {
      await window.CloudSync.sendOtp(email);
      els.otpLabel.hidden = false;
      els.authOtp.required = true;
      els.authSubmit.textContent = t("verifyLogin");
      els.syncStatus.textContent = t("otpSent");
      els.authOtp.focus();
    } else {
      await window.CloudSync.verifyOtp(email, token);
      els.syncStatus.textContent = t("loginSuccess");
    }
  } catch (error) {
    els.syncStatus.textContent = t("loginFailed", { message: error.message || t("retry") });
  } finally {
    els.authSubmit.disabled = false;
  }
}

function setupCloudSync() {
  window.CloudSync?.init({
    getItems: () => state.meows,
    getBlob: (key) => getAudioBlob(key),
    putBlob: (key, blob) => putAudioBlob(key, blob),
    makeAudioKey,
    addItem: (item) => state.meows.unshift(hydrateItem(item)),
    commit: () => { persist(); render(); },
    onStatus: (message) => { if (els.syncStatus) els.syncStatus.textContent = message; },
    onAuth: (user) => {
      els.accountButton.textContent = t(user ? "loggedSync" : "loginSync");
      els.authForm.hidden = Boolean(user);
      els.authSigned.hidden = !user;
      if (user) {
        els.authIdentity.textContent = user.email || t("loggedIn");
        els.syncStatus.textContent = t("connected");
      } else {
        els.syncStatus.textContent = t("notLogged");
      }
    }
  });
}

function refreshLanguage() {
  if (state.settings.catName === "多米") els.catNameInput.value = catLabel();
  renderMoodChips();
  render();
  sortDropdown?.setValue(state.filters.sortBy);
  if (state.isRecording) setRecordingState(true, t("recordGrowing"));
  else setRecordingState(false, t("recordDry"));
  const user = window.CloudSync?.user;
  els.accountButton.textContent = t(user ? "loggedSync" : "loginSync");
  els.authSubmit.textContent = t(els.otpLabel.hidden ? "sendOtp" : "verifyLogin");
  els.syncStatus.textContent = t(user ? "connected" : "notLogged");
}

if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}
