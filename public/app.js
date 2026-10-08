const state = {
  tab: "homework",
  startedAt: 0,
  elapsed: 0,
  timer: null,
  observations: [],
  homeworkLogs: JSON.parse(localStorage.getItem("homeworkLogs") || "[]"),
  driveLogs: JSON.parse(localStorage.getItem("driveLogs") || "[]"),
  settings: JSON.parse(localStorage.getItem("settings") || "{}"),
  cameraStream: null,
  recognizer: null,
  listening: false,
  deferredInstall: null
};

const defaults = {
  childName: "小朋友",
  childAge: 8,
  driveStyle: "轻松但不打扰"
};

state.settings = { ...defaults, ...state.settings };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function setLoading(button, loadingText) {
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = loadingText;
  return () => {
    button.disabled = false;
    button.textContent = oldText;
  };
}

function formatTimer(seconds) {
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
}

function addLog(container, text) {
  const node = document.createElement("div");
  node.className = "log-item";
  node.textContent = text;
  container.prepend(node);
}

async function askAI(scene, messages, context = {}) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ scene, messages, context })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "服务请求失败");
  }
  return data;
}

async function askVision(image, text, context = {}) {
  const res = await fetch("/api/vision", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scene: "homework",
      image,
      text,
      context
    })
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "视觉服务请求失败");
  }
  return data;
}

function switchTab(tab) {
  state.tab = tab;
  $$(".tab").forEach((item) => item.classList.toggle("active", item.dataset.tab === tab));
  $$(".screen").forEach((item) => item.classList.toggle("active", item.id === tab));
  if (tab === "report") {
    renderReportMeta();
  }
}

function renderObservations() {
  const list = $("#observeList");
  list.innerHTML = "";
  state.observations.forEach((item) => {
    addLog(list, `${item.time} · ${item.type}`);
  });
}

function renderChat(role, content) {
  const node = document.createElement("div");
  node.className = `bubble ${role === "user" ? "user" : ""}`;
  node.textContent = content;
  $("#chatList").prepend(node);
}

function renderVideoChat(role, content) {
  const node = document.createElement("div");
  node.className = `bubble ${role === "user" ? "user" : ""}`;
  node.textContent = content;
  $("#videoChatList").prepend(node);
}

function speak(text) {
  if (!$("#voiceReply").checked || !("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "zh-CN";
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function renderReportMeta() {
  $("#reportCount").textContent = `作业 ${state.homeworkLogs.length} 次 · 车聊 ${state.driveLogs.length} 次`;
  const recent = $("#recentList");
  recent.innerHTML = "";
  [...state.homeworkLogs, ...state.driveLogs]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10)
    .forEach((item) => addLog(recent, item.summary));
}

function initSettings() {
  $("#childName").value = state.settings.childName;
  $("#childAge").value = state.settings.childAge;
  $("#driveStyle").value = state.settings.driveStyle;
}

function bindTabs() {
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });
}

function bindHomework() {
  $("#cameraBtn").addEventListener("click", startCamera);
  $("#stopCameraBtn").addEventListener("click", stopCamera);
  $("#captureBtn").addEventListener("click", captureForAnalysis);
  $("#voiceTalkBtn").addEventListener("click", toggleVoiceTalk);

  $("#timerBtn").addEventListener("click", () => {
    if (state.timer) {
      clearInterval(state.timer);
      state.timer = null;
      $("#timerBtn").textContent = "继续计时";
      return;
    }
    state.startedAt = Date.now() - state.elapsed * 1000;
    $("#timerBtn").textContent = "暂停计时";
    state.timer = setInterval(() => {
      state.elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
      $("#timerText").textContent = formatTimer(state.elapsed);
    }, 1000);
  });

  $("#photoInput").addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    $("#photoPreview").src = url;
    $("#photoPreview").classList.add("show");
  });

  $$("[data-observe]").forEach((button) => {
    button.addEventListener("click", () => {
      const now = new Date();
      const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      state.observations.unshift({ type: button.dataset.observe, time });
      renderObservations();
      if (button.dataset.observe === "完成") {
        const minutes = Math.max(1, Math.round(state.elapsed / 60));
        const summary = `作业完成记录：${$("#homeworkTask").value || "未填写任务"}，用时 ${minutes} 分钟`;
        state.homeworkLogs.unshift({
          createdAt: Date.now(),
          summary,
          task: $("#homeworkTask").value,
          minutes,
          observations: state.observations
        });
        save("homeworkLogs", state.homeworkLogs);
        renderReportMeta();
      }
    });
  });

  $("#homeworkAdviceBtn").addEventListener("click", async () => {
    const done = setLoading($("#homeworkAdviceBtn"), "生成中");
    try {
      const result = await askAI("homework", [
        {
          role: "user",
          content: `作业：${$("#homeworkTask").value || "未填写"}\n观察：${JSON.stringify(state.observations)}`
        }
      ], {
        childName: state.settings.childName,
        childAge: state.settings.childAge,
        elapsedMinutes: Math.round(state.elapsed / 60)
      });
      $("#homeworkReply").textContent = result.reply;
    } catch (error) {
      $("#homeworkReply").textContent = error.message;
    } finally {
      done();
    }
  });
}

async function startCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    $("#visionReply").textContent = "当前浏览器不支持摄像头。请用手机 Chrome、Safari 或微信内置浏览器打开 HTTPS 地址。";
    return;
  }

  try {
    state.cameraStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "environment",
        width: { ideal: 1280 },
        height: { ideal: 1920 }
      },
      audio: false
    });
    const video = $("#cameraVideo");
    video.srcObject = state.cameraStream;
    await video.play();
    $(".video-box").classList.add("active");
    $("#visionReply").textContent = "视频已开启。把作业本放在画面里，点击“截图分析”。";
  } catch (error) {
    $("#visionReply").textContent = "无法打开摄像头：" + error.message + "。手机端通常需要 HTTPS 权限。";
  }
}

function stopCamera() {
  if (state.cameraStream) {
    state.cameraStream.getTracks().forEach((track) => track.stop());
    state.cameraStream = null;
  }
  $("#cameraVideo").srcObject = null;
  $(".video-box").classList.remove("active");
  $("#visionReply").textContent = "视频已关闭。";
}

async function captureForAnalysis() {
  const video = $("#cameraVideo");
  if (!state.cameraStream || !video.videoWidth) {
    $("#visionReply").textContent = "请先点击“开视频”。";
    return;
  }

  const canvas = $("#cameraCanvas");
  const maxWidth = 900;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const image = canvas.toDataURL("image/jpeg", 0.72);
  const done = setLoading($("#captureBtn"), "分析中");

  try {
    const result = await askVision(image, "请分析孩子当前作业状态，并给家长一句提醒话术。", {
      childName: state.settings.childName,
      childAge: state.settings.childAge,
      task: $("#homeworkTask").value,
      observations: state.observations
    });
    $("#visionReply").textContent = result.reply;
    state.homeworkLogs.unshift({
      createdAt: Date.now(),
      summary: "视频监督分析：" + result.reply.slice(0, 36),
      task: $("#homeworkTask").value,
      vision: result.reply
    });
    save("homeworkLogs", state.homeworkLogs);
    renderReportMeta();
  } catch (error) {
    $("#visionReply").textContent = error.message;
  } finally {
    done();
  }
}

function getCurrentFrame() {
  const video = $("#cameraVideo");
  if (!state.cameraStream || !video.videoWidth) return "";

  const canvas = $("#cameraCanvas");
  const maxWidth = 900;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.72);
}

function createRecognizer() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return null;
  const recognizer = new SpeechRecognition();
  recognizer.lang = "zh-CN";
  recognizer.interimResults = false;
  recognizer.continuous = false;
  return recognizer;
}

function toggleVoiceTalk() {
  if (state.listening) {
    stopListening("语音已停止。");
    return;
  }
  startListening();
}

function startListening() {
  if (!state.recognizer) {
    state.recognizer = createRecognizer();
  }
  if (!state.recognizer) {
    $("#visionReply").textContent = "当前浏览器不支持语音识别。建议使用安卓 Chrome，或接入云端 ASR 服务。";
    return;
  }

  const recognizer = state.recognizer;
  recognizer.onstart = () => {
    state.listening = true;
    $("#voiceTalkBtn").textContent = "正在听，点我停止";
    $("#visionReply").textContent = "我在听，你可以直接说：孩子现在在做什么，或者让豆包看一下画面。";
  };
  recognizer.onerror = (event) => {
    stopListening("语音识别失败：" + (event.error || "未知错误"));
  };
  recognizer.onend = () => {
    state.listening = false;
    $("#voiceTalkBtn").textContent = "语音问豆包";
  };
  recognizer.onresult = async (event) => {
    const text = Array.from(event.results)
      .map((result) => result[0]?.transcript || "")
      .join("")
      .trim();
    if (!text) {
      $("#visionReply").textContent = "没有识别到说话内容。";
      return;
    }
    await sendVideoVoiceMessage(text);
    if ($("#continuousVoice").checked) {
      setTimeout(() => startListening(), 700);
    }
  };

  try {
    recognizer.start();
  } catch (error) {
    $("#visionReply").textContent = "语音识别无法启动：" + error.message;
  }
}

function stopListening(message) {
  if (state.recognizer && state.listening) {
    state.recognizer.stop();
  }
  state.listening = false;
  $("#voiceTalkBtn").textContent = "语音问豆包";
  if (message) $("#visionReply").textContent = message;
}

async function sendVideoVoiceMessage(text) {
  renderVideoChat("user", text);
  $("#visionReply").textContent = "豆包正在看画面并回复...";

  try {
    const image = getCurrentFrame();
    let result;
    if (image) {
      result = await askVision(image, "用户通过语音说：" + text + "。请结合当前画面，用适合语音播报的短句回复。", {
        childName: state.settings.childName,
        childAge: state.settings.childAge,
        task: $("#homeworkTask").value,
        observations: state.observations,
        conversationMode: "video_voice"
      });
    } else {
      result = await askAI("homework", [
        { role: "user", content: "用户通过语音说：" + text + "。请用适合语音播报的短句回复。" }
      ], {
        childName: state.settings.childName,
        childAge: state.settings.childAge,
        conversationMode: "voice_only"
      });
    }
    renderVideoChat("assistant", result.reply);
    $("#visionReply").textContent = result.reply;
    speak(result.reply);
    state.homeworkLogs.unshift({
      createdAt: Date.now(),
      summary: "视频语音沟通：" + text.slice(0, 28),
      task: $("#homeworkTask").value,
      voice: text,
      reply: result.reply
    });
    save("homeworkLogs", state.homeworkLogs);
    renderReportMeta();
  } catch (error) {
    renderVideoChat("assistant", error.message);
    $("#visionReply").textContent = error.message;
  }
}

function bindDrive() {
  async function send(text) {
    if (!text.trim()) return;
    renderChat("user", text);
    $("#driveInput").value = "";
    const done = setLoading($("#driveSendBtn"), "发送中");
    try {
      const result = await askAI("drive", [
        { role: "user", content: text }
      ], {
        driveStyle: state.settings.driveStyle,
        safetyMode: true
      });
      renderChat("assistant", result.reply);
      state.driveLogs.unshift({
        createdAt: Date.now(),
        summary: `车聊：${text.slice(0, 32)}`,
        text,
        reply: result.reply
      });
      save("driveLogs", state.driveLogs);
    } catch (error) {
      renderChat("assistant", error.message);
    } finally {
      done();
    }
  }

  $("#driveSendBtn").addEventListener("click", () => send($("#driveInput").value));
  $$("[data-drive]").forEach((button) => {
    button.addEventListener("click", () => send(button.dataset.drive));
  });
}

function bindReport() {
  $("#reportBtn").addEventListener("click", async () => {
    const done = setLoading($("#reportBtn"), "生成中");
    const records = [...state.homeworkLogs, ...state.driveLogs].slice(0, 12);
    try {
      const result = await askAI("report", [
        { role: "user", content: `请生成家庭陪伴日报：${JSON.stringify(records)}` }
      ]);
      $("#reportReply").textContent = result.reply;
    } catch (error) {
      $("#reportReply").textContent = error.message;
    } finally {
      done();
    }
  });
}

function bindSettings() {
  $("#saveSettingsBtn").addEventListener("click", () => {
    state.settings = {
      childName: $("#childName").value || defaults.childName,
      childAge: Number($("#childAge").value || defaults.childAge),
      driveStyle: $("#driveStyle").value || defaults.driveStyle
    };
    save("settings", state.settings);
    $("#serverInfo").textContent = "设置已保存。";
  });
}

function bindInstall() {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    state.deferredInstall = event;
  });
  $("#installBtn").addEventListener("click", async () => {
    if (state.deferredInstall) {
      state.deferredInstall.prompt();
      state.deferredInstall = null;
    } else {
      $("#statusStrip").textContent = "可在浏览器菜单里选择“添加到主屏幕”。";
    }
  });
}

async function checkHealth() {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    const text = data.hasKey
      ? `已连接豆包代理，模型：${data.model}`
      : `服务可用，当前为本地备用回复。配置 ARK_API_KEY 后启用豆包。`;
    $("#statusStrip").textContent = text;
    $("#serverInfo").textContent = text;
  } catch (error) {
    $("#statusStrip").textContent = "服务连接异常，请确认电脑端工具正在运行。";
    $("#serverInfo").textContent = error.message;
  }
}

function init() {
  bindTabs();
  bindHomework();
  bindDrive();
  bindReport();
  bindSettings();
  bindInstall();
  initSettings();
  renderObservations();
  renderReportMeta();
  renderChat("assistant", "我在。开车聊天会保持短句，优先安全。");
  checkHealth();
}

init();
