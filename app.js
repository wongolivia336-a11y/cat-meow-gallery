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
const RECORDER_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus"
];

const MOODS = [
  { id: "all", label: "全部", color: "#fffdf9", hue: 34 },
  { id: "sweet", label: "meow 撒娇", color: "#ffe1e8", hue: 338 },
  { id: "food", label: "饭盆通知", color: "#ffe7a3", hue: 46 },
  { id: "sleepy", label: "困困慢叫", color: "#dce7ff", hue: 220 },
  { id: "purr", label: "purr 呼噜", color: "#d5f0e9", hue: 166 },
  { id: "mystery", label: "mrrp / chirp", color: "#e4f3d7", hue: 105 },
  { id: "protest", label: "奶声抗议", color: "#ffd7c8", hue: 15 }
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
  mockRecordingTimer: null,
  currentAudio: null,
  currentMockStop: null,
  currentMockTimer: null,
  currentPlayingId: null,
  objectUrls: new Map(),
  liveCtx: null,
  liveAnalyser: null,
  liveRaf: null,
  // 用户一般只有一只猫，所以猫名是一次性设置，不是每条录音的字段
  settings: { catName: "多米" },
  restTimer: null,
  isResting: false,
  controlMode: false
};

const els = {};

document.addEventListener("DOMContentLoaded", init);

function init() {
  cacheElements();
  restore();
  restoreSettings();
  renderMoodChips();
  populateMoodSelect();
  bindEvents();

  BubbleField.init(els.canvas, {
    moods: MOODS,
    // 泡泡被戳破 → 放它录到的那段声音
    onPop: (item) => playItem(item),
    // 破裂动画结束、泡泡重新飘回来时，把播放次数落盘
    onPopEnd: () => persist(),
    // 长按收藏
    onLongPress: (item) => toggleFavorite(item)
  });

  setupDesktopPet();
  render();
}

function cacheElements() {
  els.body = document.body;
  els.canvas = document.querySelector("#bubbleCanvas");
  els.srMirror = document.querySelector("#srMirror");
  els.collectionCount = document.querySelector("#collectionCount");
  els.recordButton = document.querySelector("#recordButton");
  els.recordButtonText = document.querySelector("#recordButtonText");
  els.recordTimer = document.querySelector("#recordTimer");
  els.recordState = document.querySelector("#recordState");
  els.searchToggle = document.querySelector("#searchToggle");
  els.filterPanel = document.querySelector("#filterPanel");
  els.fieldHint = document.querySelector("#fieldHint");
  els.searchInput = document.querySelector("#searchInput");
  els.catNameInput = document.querySelector("#catNameInput");
  els.moodChips = document.querySelector("#moodChips");
  els.favoriteOnly = document.querySelector("#favoriteOnly");
  els.sortSelect = document.querySelector("#sortSelect");
  els.saveDialog = document.querySelector("#saveDialog");
  els.saveForm = document.querySelector("#saveForm");
  els.discardDraft = document.querySelector("#discardDraft");
  els.toast = document.querySelector("#toast");
}

function bindEvents() {
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

  els.sortSelect.addEventListener("change", (event) => {
    state.filters.sortBy = event.target.value;
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
    showToast("先放回空气里。");
  });
}

/* ====================================================================
   桌宠模式（仅 Electron 下生效，浏览器里这段整个跳过）
   ==================================================================== */

function setupDesktopPet() {
  if (!window.meowPet?.isPet) return;
  els.body.classList.add("is-pet");

  let lastX = -1;
  let lastY = -1;
  let interactive = false;

  const evaluate = () => {
    if (state.controlMode || lastX < 0) return;
    const over = BubbleField.hitTestAt(lastX, lastY);
    if (over === interactive) return;
    interactive = over;
    window.meowPet.setInteractive(over);
  };

  window.addEventListener("mousemove", (event) => {
    lastX = event.clientX;
    lastY = event.clientY;
    evaluate();
  }, { passive: true });

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
    if (on) {
      wakeUp();
    } else {
      interactive = false;
      scheduleRest();
    }
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

/*
  两级关系：手机是采集端，电脑是屏保端。

  这不只是布局差异，是行为差异 ——
  在手机上你是"来录一段猫叫"的，把录音按钮自动藏起来是敌意设计；
  在电脑上你是"工作累了看两眼"的，界面就该退场。
  所以休息模式只在宽屏生效。
*/
function isAmbientDevice() {
  return window.innerWidth >= 720;
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
    startMockRecording("浏览器不支持麦克风，先吹一颗模拟泡泡。");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = pickRecorderMimeType();
    state.chunks = [];
    state.recordingStream = stream;
    state.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
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
      setRecordingState(false, "安静等待中");
      startMockRecording("录音中断了，先用模拟泡泡兜底。");
    });

    state.mediaRecorder.addEventListener("stop", async () => {
      if (recorderFailed) return;
      const duration = Math.max(getRecordingDuration(), 1);
      const type = state.mediaRecorder?.mimeType || mimeType || "audio/webm";
      const blob = new Blob(state.chunks, { type });
      stopRecordingStream();
      state.mediaRecorder = null;

      if (!blob.size) {
        startMockRecording("这次没捉到声音，先用模拟泡泡兜底。");
        return;
      }

      const audioUrl = URL.createObjectURL(blob);
      const waveform = await analyzeAudioBlob(blob);
      openSaveDraft({
        id: makeId(),
        title: suggestTitle(),
        audioUrl,
        audioBlob: blob,
        duration: Math.max(duration, 1),
        source: "recorded",
        waveform
      });
    });

    startLiveAnalyser(stream);
    state.mediaRecorder.start(250);
    setRecordingState(true, "泡泡正在变大");
  } catch (error) {
    stopRecordingStream();
    state.mediaRecorder = null;
    startMockRecording("麦克风被挡住了，先用模拟泡泡继续。");
  }
}

function stopRecording() {
  if (!state.isRecording) return;

  if (state.mediaRecorder && state.mediaRecorder.state !== "inactive") {
    state.mediaRecorder.stop();
  } else if (state.mockRecordingTimer) {
    completeMockRecording();
  } else {
    stopRecordingStream();
  }

  setRecordingState(false, "泡泡纸还没沾水");
}

function startMockRecording(message) {
  state.recordingStartedAt = Date.now();
  state.mediaRecorder = null;
  state.chunks = [];
  setRecordingState(true, "模拟吹泡泡中");
  showToast(message);

  window.clearTimeout(state.mockRecordingTimer);
  state.mockRecordingTimer = window.setTimeout(completeMockRecording, 1800);
}

function completeMockRecording() {
  if (!state.isRecording) return;
  const duration = Math.max(getRecordingDuration(), 2);
  window.clearTimeout(state.mockRecordingTimer);
  state.mockRecordingTimer = null;
  setRecordingState(false, "泡泡纸还没沾水");
  openSaveDraft({
    id: makeId(),
    title: suggestTitle(),
    audioUrl: "",
    duration,
    source: "mock",
    waveform: generateWaveform()
  });
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

function setRecordingState(isRecording, label) {
  state.isRecording = isRecording;
  els.recordButton.setAttribute("aria-pressed", String(isRecording));
  els.recordButton.setAttribute("aria-label", isRecording ? "封口这颗泡泡" : "开始吹猫声泡泡");
  els.recordButtonText.textContent = isRecording ? "封口" : "吹泡泡";
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
  els.saveForm.elements.mood.value = pickDefaultMood();
  els.saveForm.elements.tags.value = draft.source === "mock" ? "模拟, 奶音" : "刚吹出, 奶音";
  els.saveForm.elements.note.value = draft.source === "recorded" ? "本次会话录到的一颗声音泡泡。" : "没有麦克风时生成的小小占位泡泡。";

  els.saveDialog.showModal();
  els.saveForm.elements.title.focus();
  showToast("泡泡封口前，给它起个小名字。");
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
      item.audioKey = "";
      item.audioUrl = "";
      item.source = "mock";
      showToast("本地音频没存稳，先保存为模拟泡泡。");
    }
  }

  state.meows.unshift(item);
  state.draft = null;
  persist();
  els.saveDialog.close();
  render();
  showToast("泡泡封口，轻轻飘进 gallery。");
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
    audio.addEventListener("ended", () => finishPlay(item));
    audio.addEventListener("error", () => {
      stopCurrentSound();
      showToast("这颗泡泡太害羞了，先漏出模拟声。");
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
  showToast(item.favorite ? "挂上小铃铛。" : "先放回普通喵架。");
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
  els.fieldHint.textContent = list.length
    ? "点一颗泡泡，让它破掉发出声音"
    : "这里还没有泡泡，先吹一颗吧";
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

function renderCount() {
  const count = state.meows.length;
  const favs = state.meows.filter((item) => item.favorite).length;
  els.collectionCount.textContent = `已吹出 ${count} 颗声音泡泡，${favs} 颗里面有星点`;
}

function renderFilterState() {
  els.favoriteOnly.setAttribute("aria-pressed", String(state.filters.favoriteOnly));
  [...els.moodChips.querySelectorAll("[data-mood]")].forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.mood === state.filters.mood));
  });
}

function renderMoodChips() {
  els.moodChips.innerHTML = MOODS.map((mood) => {
    // "全部"没有对应表情，留空图标位，避免硬凑一个看不懂的图形
    const face = mood.id === "all"
      ? ""
      : `<img class="chip-face" src="${BubbleField.faceDataUrl(mood.id, 26)}" alt="" />`;
    return `<button class="chip" type="button" data-mood="${mood.id}" aria-pressed="false">${face}${mood.label}</button>`;
  }).join("");
}

function populateMoodSelect() {
  const select = els.saveForm.elements.mood;
  select.innerHTML = MOODS.filter((mood) => mood.id !== "all")
    .map((mood) => `<option value="${mood.id}">${mood.label}</option>`)
    .join("");
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
  } catch (error) {
    // 设置读坏了不该拦住 App 启动，用默认值继续
  }
  // 老数据里已经有猫名的话，直接沿用，别让用户再填一次
  if (!state.settings.catName && state.meows[0]?.catName) {
    state.settings.catName = state.meows[0].catName;
  }
  els.catNameInput.value = state.settings.catName;
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

function restore() {
  migrateLegacyKeys();
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    state.meows = getSeedMeows();
    return;
  }

  try {
    const saved = JSON.parse(raw);
    state.meows = Array.isArray(saved) && saved.length ? saved.map(normalizeItem) : getSeedMeows();
  } catch (error) {
    state.meows = getSeedMeows();
  }

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

function getSeedMeows() {
  const now = Date.now();
  return [
    makeSeed("seed-1", "咪呜泡泡", "小橘", "sweet", ["奶音", "短促"], "讨零食失败前的第一声。", 3, true, 4, now - 1000 * 60 * 12),
    makeSeed("seed-2", "小小拖拉机呼噜", "年糕", "purr", ["呼噜", "摸头"], "午睡前自动开机。", 8, true, 9, now - 1000 * 60 * 42),
    makeSeed("seed-3", "开饭雷达响了", "团团", "food", ["急急", "罐头"], "碗还没放下，声音已经到了。", 5, false, 6, now - 1000 * 60 * 88),
    makeSeed("seed-4", "门缝里的嗯？", "豆包", "mystery", ["疑惑", "门缝"], "不知道在和谁开小会。", 4, false, 2, now - 1000 * 60 * 180),
    makeSeed("seed-5", "困到融化喵", "乌云", "sleepy", ["慢慢", "睡前"], "闭眼前还要认真宣布一下。", 6, false, 5, now - 1000 * 60 * 260),
    makeSeed("seed-6", "奶声抗议", "小橘", "protest", ["委屈", "拖长音"], "被抱起三秒后的软软反对票。", 7, true, 3, now - 1000 * 60 * 380)
  ];
}

function makeSeed(id, title, catName, mood, tags, note, duration, favorite, playCount, time) {
  return normalizeItem({
    id,
    title,
    catName,
    mood,
    tags,
    note,
    duration,
    audioUrl: "",
    source: "seed",
    favorite,
    playCount,
    createdAt: new Date(time).toISOString(),
    color: getMood(mood).color,
    waveform: generateWaveform(id)
  });
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
    source: item.source || "seed",
    favorite: Boolean(item.favorite),
    playCount: Number(item.playCount) || 0,
    createdAt: item.createdAt || new Date().toISOString(),
    color: item.color || getMood(mood).color,
    waveform: Array.isArray(item.waveform) ? item.waveform : generateWaveform(id)
  };
}

function getMood(id) {
  return MOODS.find((mood) => mood.id === id) || MOODS[0];
}

function pickDefaultMood() {
  const options = MOODS.filter((mood) => mood.id !== "all");
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

async function analyzeAudioBlob(blob) {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext || !blob.size) return generateWaveform(String(blob.size));

  const ctx = new AudioContext();
  try {
    const buffer = await blob.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(buffer.slice(0));
    const channel = audioBuffer.getChannelData(0);
    const bucketSize = Math.max(1, Math.floor(channel.length / 12));

    return Array.from({ length: 12 }, (_, index) => {
      const start = index * bucketSize;
      const end = Math.min(channel.length, start + bucketSize);
      let total = 0;
      for (let cursor = start; cursor < end; cursor += 1) {
        total += Math.abs(channel[cursor]);
      }
      return Math.max(0.16, Math.min(0.95, total / Math.max(1, end - start) * 3.6));
    });
  } catch (error) {
    return generateWaveform(`${blob.size}:${blob.type}`);
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
