const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT || 8790);
const HOST = process.env.HOST || "0.0.0.0";
const ARK_API_KEY = process.env.ARK_API_KEY || "";
const ARK_MODEL = process.env.ARK_MODEL || "doubao-seed-2-1-pro-260628";
const ARK_BASE_URL = process.env.ARK_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const PUBLIC_DIR = path.join(__dirname, "public");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon"
};

function sendJson(res, status, data) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(data));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 8 * 1024 * 1024) {
        reject(new Error("请求内容过大"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function systemPrompt(scene, context) {
  if (scene === "homework") {
    return [
      "你是小学生作业陪伴助手，服务对象是家长。",
      "你只能引导思路、拆步骤、给鼓励和监督话术，不能直接替孩子写作业答案。",
      "回复要短，给出家长马上能说的话。",
      "孩子和任务信息：" + JSON.stringify(context || {})
    ].join("\n");
  }
  if (scene === "drive") {
    return [
      "你是开车陪聊助手。",
      "回复必须适合语音播报，控制在 1 到 3 句话。",
      "不要求用户看屏幕，不引导复杂操作。",
      "如果用户疲劳、生气、困倦或分心，优先提醒安全停车或休息。",
      "驾驶偏好：" + JSON.stringify(context || {})
    ].join("\n");
  }
  return [
    "你是家庭陪伴日报助手。",
    "根据记录做简洁总结，包含完成情况、风险提醒、下一步建议。",
    "不能编造记录里没有的信息。"
  ].join("\n");
}

function visionPrompt(scene, context) {
  if (scene === "homework") {
    return [
      "你是作业视频监督助手，正在看手机摄像头截取的一帧画面。",
      "只判断可见行为和作业状态，不识别孩子身份，不评价长相。",
      "输出三点：1. 当前状态 2. 家长可以说的一句话 3. 是否需要提醒休息。",
      "不能替孩子直接写答案。",
      "上下文：" + JSON.stringify(context || {})
    ].join("\n");
  }
  return [
    "你是家庭场景视觉助手。",
    "只描述画面中与安全和任务有关的信息，不做身份识别。",
    "上下文：" + JSON.stringify(context || {})
  ].join("\n");
}

function localReply(scene, messages) {
  const last = messages[messages.length - 1]?.content || "";
  if (scene === "homework") {
    return "可以这样提醒孩子：先把题目要求读一遍，再说出已经知道的信息。我们先做第一小步，做完再检查。家长先陪过程，不直接给答案。";
  }
  if (scene === "drive") {
    if (/困|累|犯困|疲劳/.test(last)) {
      return "先把安全放第一位。找安全位置停车休息一下，喝口水，别硬撑。";
    }
    return "好，我们聊轻松一点。你专心看路，我就短短说一句：今天路上如果顺利，到家后可以给自己留十分钟放空。";
  }
  return "今天的记录可以总结为：保持陪伴节奏，作业监督以鼓励和拆步骤为主；驾驶聊天保持短句，安全优先。";
}

function localVisionReply() {
  return "本地备用分析：已收到视频截图。建议家长先确认孩子是否坐好、桌面是否有作业材料，再用一句话提醒：我们先完成眼前这一小步，做完再休息。";
}

async function callDoubao(payload) {
  const scene = payload.scene || "report";
  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const context = payload.context || {};

  if (!ARK_API_KEY) {
    return {
      reply: localReply(scene, messages),
      source: "local"
    };
  }

  const body = {
    model: ARK_MODEL,
    messages: [
      { role: "system", content: systemPrompt(scene, context) },
      ...messages.map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: String(item.content || "").slice(0, 4000)
      }))
    ],
    temperature: scene === "drive" ? 0.45 : 0.7,
    max_tokens: scene === "drive" ? 180 : 700
  };

  const response = await fetch(ARK_BASE_URL + "/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + ARK_API_KEY
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || "豆包接口请求失败";
    throw new Error(message);
  }
  return {
    reply: data?.choices?.[0]?.message?.content || "豆包没有返回内容。",
    source: "doubao",
    usage: data.usage || null
  };
}

async function callVision(payload) {
  const image = String(payload.image || "");
  const scene = payload.scene || "homework";
  const context = payload.context || {};
  const text = String(payload.text || "请分析这帧画面中的作业状态。").slice(0, 1000);

  if (!image.startsWith("data:image/")) {
    throw new Error("缺少有效图片数据");
  }

  if (!ARK_API_KEY) {
    return {
      reply: localVisionReply(),
      source: "local"
    };
  }

  const body = {
    model: process.env.ARK_VISION_MODEL || ARK_MODEL,
    messages: [
      { role: "system", content: visionPrompt(scene, context) },
      {
        role: "user",
        content: [
          { type: "text", text },
          { type: "image_url", image_url: { url: image } }
        ]
      }
    ],
    temperature: 0.35,
    max_tokens: 500
  };

  const response = await fetch(ARK_BASE_URL + "/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "authorization": "Bearer " + ARK_API_KEY
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data?.error?.message || "豆包视觉接口请求失败";
    throw new Error(message);
  }
  return {
    reply: data?.choices?.[0]?.message?.content || "豆包没有返回视觉分析内容。",
    source: "doubao",
    usage: data.usage || null
  };
}

function serveStatic(req, res) {
  const requestPath = decodeURIComponent(req.url.split("?")[0]);
  const cleanPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(PUBLIC_DIR, cleanPath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": "no-store"
    });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }
  if (req.method === "GET" && req.url.startsWith("/api/health")) {
    sendJson(res, 200, {
      ok: true,
      model: ARK_MODEL,
      hasKey: Boolean(ARK_API_KEY)
    });
    return;
  }
  if (req.method === "POST" && req.url.startsWith("/api/chat")) {
    try {
      const payload = await readJson(req);
      const result = await callDoubao(payload);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "服务异常" });
    }
    return;
  }
  if (req.method === "POST" && req.url.startsWith("/api/vision")) {
    try {
      const payload = await readJson(req);
      const result = await callVision(payload);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 500, { error: error.message || "视觉服务异常" });
    }
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log("豆包手机工具已启动：http://127.0.0.1:" + PORT);
  console.log("手机同 Wi-Fi 访问：http://电脑IP:" + PORT);
});
