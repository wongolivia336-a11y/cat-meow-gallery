(function () {
  "use strict";

  const KEY = "meow-gallery:language";
  const dictionaries = {
    zh: {
      tagline: "把猫叫吹成桌面上的声音泡泡", noSounds: "还没有声音",
      loginSync: "登录同步", loggedSync: "已登录 · 同步", aboutDownload: "关于 · 下载", language: "EN",
      searchAria: "搜索和筛选", catName: "你家猫的名字", search: "搜泡泡", searchPlaceholder: "半夜叫、罐头、呼噜",
      favoriteOnly: "只看圈起来的", sortAria: "排序方式", fieldEmpty: "还没有声音，先吹一颗吧", fieldListen: "戳一颗，听听{name}",
      recordDry: "泡泡纸还没沾水", recordQuiet: "安静等待中", recordGrowing: "泡泡正在变大", recordStart: "吹泡泡", recordStop: "封口", recordStartAria: "开始吹猫声泡泡", recordStopAria: "封口这颗泡泡",
      recordInterrupted: "录音中断了，请重新录制；这次不会生成空泡泡。", recordEmpty: "这次没有录到声音，请重新试一次。", recordMicDenied: "麦克风没有打开，请授权后重新录制。",
      saveTitle: "泡泡封口前", bubbleName: "泡泡名字", moodType: "声音类型", moodPlaceholder: "选一个，或自己起一个",
      tags: "小标签", tagsPlaceholder: "奶音, 半夜, 饭盆", note: "这颗泡泡的来历", discard: "吹散", save: "封口并飘走",
      aboutTitle: "手机捉住猫叫，电脑把它吹回来", aboutBody: "多米平时在桌面角落睡觉。工作到点，它拿出泡泡水，把你录下的真实猫声吹成一屏可以戳的泡泡。",
      step1: "手机录下猫叫", step2: "同步到电脑", step3: "到点戳泡泡休息", winDownload: "下载 Windows 免安装版",
      macArm: "Mac · Apple 芯片", macIntel: "Mac · Intel", androidDownload: "下载 Android APK", iphonePending: "iPhone · TestFlight 待签名",
      installPhone: "安装到手机", downloadNote: "Windows 为免安装 ZIP；Android 可直接安装 APK；iPhone 需要 Apple Developer 签名后通过 TestFlight 安装。",
      authTitle: "让手机和电脑认识同一只多米", authBody: "使用邮箱验证码登录。录音默认私有，只有你的设备可以读取。",
      email: "邮箱", otp: "邮箱验证码", otpPlaceholder: "输入邮件里的验证码", sendOtp: "发送验证码", verifyLogin: "验证并登录",
      syncNow: "立即同步", signOut: "退出账号", notLogged: "还没有登录", connected: "账号已连接", loggedIn: "已登录",
      otpSent: "验证码已发送，请查看邮箱。", loginSuccess: "登录成功，正在同步。", loginFailed: "登录失败：{message}", retry: "请稍后重试",
      syncing: "正在同步…", synced: "已同步 {count} 颗泡泡", syncFailed: "同步失败：{message}", syncUnavailable: "同步服务没有加载",
      moodAll: "全部", moodSweet: "meow 撒娇", moodFood: "饭盆通知", moodNight: "半夜广播", moodPurr: "purr 呼噜", moodQuestion: "疑问句", moodAngry: "骂骂咧咧",
      sortNewest: "刚吹出的", sortPopular: "最常戳的", collection: "{name}的 {count} 颗声音", collectionFav: "{name}的 {count} 颗声音，圈起来 {favs} 颗",
      toastDiscard: "先放回空气里。", toastName: "给它起个名字吧。", toastSaveFail: "声音没有保存成功，请重试；这次不会生成空泡泡。",
      toastSaved: "封好了，让它去飘。", toastAudioFail: "这颗有点害羞，先哼一声给你听。", toastFavOn: "圈起来了。", toastFavOff: "把圈擦掉了。"
    },
    en: {
      tagline: "Turn cat sounds into bubbles on your desktop", noSounds: "No sounds yet",
      loginSync: "Sign in · Sync", loggedSync: "Signed in · Sync", aboutDownload: "About · Download", language: "中文",
      searchAria: "Search and filter", catName: "Your cat's name", search: "Search bubbles", searchPlaceholder: "midnight meow, treats, purr",
      favoriteOnly: "Circled only", sortAria: "Sort order", fieldEmpty: "No sounds yet — blow the first bubble", fieldListen: "Pop one and hear {name}",
      recordDry: "The bubble wand is still dry", recordQuiet: "Waiting for a sound", recordGrowing: "The bubble is growing", recordStart: "Blow a bubble", recordStop: "Seal", recordStartAria: "Start recording a cat-sound bubble", recordStopAria: "Seal this bubble",
      recordInterrupted: "Recording stopped unexpectedly. Please try again; no empty bubble was created.", recordEmpty: "No sound was captured. Please try again.", recordMicDenied: "The microphone could not open. Allow access and try again.",
      saveTitle: "Before sealing the bubble", bubbleName: "Bubble name", moodType: "Sound type", moodPlaceholder: "Choose one or name your own",
      tags: "Tags", tagsPlaceholder: "tiny meow, midnight, dinner", note: "Story behind this bubble", discard: "Let it go", save: "Seal and float",
      aboutTitle: "Catch a meow on your phone. domi brings it back on desktop.", aboutBody: "domi naps wherever it feels cozy on your desktop. At break time, domi takes out a bubble wand and turns your real recordings into bubbles you can pop.",
      step1: "Record a meow on mobile", step2: "Sync it to desktop", step3: "Pop bubbles at break time", winDownload: "Download Windows portable ZIP",
      macArm: "Mac · Apple silicon", macIntel: "Mac · Intel", androidDownload: "Download Android APK", iphonePending: "iPhone · TestFlight pending signing",
      installPhone: "Install on phone", downloadNote: "Windows uses a portable ZIP; Android installs from an APK; iPhone distribution needs Apple Developer signing and TestFlight.",
      authTitle: "Let your phone and computer know the same domi", authBody: "Sign in with an email code. Your recordings stay private and are available only on your own devices.",
      email: "Email", otp: "Email code", otpPlaceholder: "Enter the code from your email", sendOtp: "Send code", verifyLogin: "Verify and sign in",
      syncNow: "Sync now", signOut: "Sign out", notLogged: "Not signed in", connected: "Account connected", loggedIn: "Signed in",
      otpSent: "Code sent. Check your email.", loginSuccess: "Signed in. Syncing now.", loginFailed: "Sign-in failed: {message}", retry: "Please try again later",
      syncing: "Syncing…", synced: "Synced {count} bubbles", syncFailed: "Sync failed: {message}", syncUnavailable: "Sync service did not load",
      moodAll: "All", moodSweet: "Sweet meow", moodFood: "Dinner call", moodNight: "Midnight broadcast", moodPurr: "Purr", moodQuestion: "Question", moodAngry: "Grumpy rant",
      sortNewest: "Newest", sortPopular: "Most popped", collection: "{count} sounds from {name}", collectionFav: "{count} sounds from {name}, {favs} circled",
      toastDiscard: "Back into the air.", toastName: "Give it a name.", toastSaveFail: "The sound could not be saved. No empty bubble was created.",
      toastSaved: "Sealed. Let it float.", toastAudioFail: "This bubble is feeling shy. Try again later.", toastFavOn: "Circled.", toastFavOff: "Circle erased."
    }
  };

  let language = localStorage.getItem(KEY) || (navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en");
  if (!dictionaries[language]) language = "en";

  function t(key, variables = {}) {
    const template = dictionaries[language][key] || dictionaries.en[key] || key;
    return template.replace(/\{(\w+)\}/g, (_, name) => variables[name] ?? "");
  }

  const textBindings = {
    ".app-tagline": "tagline", "#collectionCount": "noSounds", "#accountButton": "loginSync", "#aboutButton": "aboutDownload", "#languageToggle": "language",
    "label[for='catNameInput']": "catName", "label[for='searchInput']": "search", "#favoriteOnly": "favoriteOnly", "#fieldHint": "fieldEmpty",
    "#recordState": "recordDry", "#recordButtonText": "recordStart", "#saveDialog h2": "saveTitle", "#discardDraft": "discard", "#saveForm button[type='submit']": "save",
    "#aboutDialog h2": "aboutTitle", "#aboutDialog > p:not(.eyebrow)": "aboutBody",
    ".about-actions a:nth-child(1)": "winDownload", ".about-actions a:nth-child(2)": "macArm", ".about-actions a:nth-child(3)": "macIntel", ".about-actions a:nth-child(4)": "androidDownload",
    ".about-actions .is-disabled": "iphonePending", "#installPwaButton": "installPhone", "#aboutDialog > small": "downloadNote",
    "#authDialog h2": "authTitle", "#authDialog > p:not(.eyebrow)": "authBody", "#authSubmit": "sendOtp", "#syncNowButton": "syncNow", "#signOutButton": "signOut", "#syncStatus": "notLogged"
  };
  const attrBindings = [
    ["#searchToggle", "aria-label", "searchAria"], ["#searchInput", "placeholder", "searchPlaceholder"], ["#sortInput", "aria-label", "sortAria"],
    ["#sortCaret", "aria-label", "sortAria"], ["#sortListbox", "aria-label", "sortAria"], ["#recordButton", "aria-label", "recordStartAria"],
    ["#moodInput", "placeholder", "moodPlaceholder"], ["#authOtp", "placeholder", "otpPlaceholder"]
  ];

  function replaceLeadingText(element, value) {
    const node = [...element.childNodes].find((item) => item.nodeType === Node.TEXT_NODE && item.textContent.trim());
    if (node) node.textContent = `\n            ${value}\n            `;
  }

  function apply(root = document) {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    for (const [selector, key] of Object.entries(textBindings)) root.querySelector(selector) && (root.querySelector(selector).textContent = t(key));
    const formLabels = [["#saveForm label:nth-of-type(1)", "bubbleName"], ["label[for='moodInput']", "moodType"], ["#saveForm label:nth-of-type(3)", "tags"], ["#saveForm label:nth-of-type(4)", "note"], ["#authForm label:nth-of-type(1)", "email"], ["#otpLabel", "otp"]];
    formLabels.forEach(([selector, key]) => { const el = root.querySelector(selector); if (el) replaceLeadingText(el, t(key)); });
    [[".about-steps span:nth-child(1)", "step1"], [".about-steps span:nth-child(2)", "step2"], [".about-steps span:nth-child(3)", "step3"]].forEach(([selector, key]) => {
      const el = root.querySelector(selector); if (el) replaceLeadingText(el, t(key));
    });
    const tagsInput = root.querySelector("#saveForm input[name='tags']"); if (tagsInput) tagsInput.placeholder = t("tagsPlaceholder");
    attrBindings.forEach(([selector, attr, key]) => root.querySelector(selector)?.setAttribute(attr, t(key)));
  }

  function setLanguage(next) {
    const update = () => {
      language = next === "zh" ? "zh" : "en";
      localStorage.setItem(KEY, language);
      apply();
      document.body.dataset.language = language;
      window.dispatchEvent(new CustomEvent("meow:language-change", { detail: { language } }));
    };
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (document.startViewTransition && !reduceMotion) document.startViewTransition(update);
    else update();
  }

  window.I18n = { t, apply, setLanguage, toggle: () => setLanguage(language === "zh" ? "en" : "zh"), get language() { return language; } };
  document.addEventListener("DOMContentLoaded", () => { apply(); document.body.dataset.language = language; }, { once: true });
})();
