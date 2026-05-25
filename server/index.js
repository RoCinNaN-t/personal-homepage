import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { setupAvatarRoutes } from "./avatar.js";
import { setupMusicRoutes } from "./music.js";
import { blockSensitivePaths, createCorsOptions } from "./security.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(__dirname, "..");
const app = express();
const PORT = Number(process.env.PORT) || 3457;
/** 默认仅局域网；公网暴露需显式 BIND_HOST=0.0.0.0 且知悉风险 */
const HOST = process.env.BIND_HOST || "0.0.0.0";

const API_KEY = process.env.OPENAI_API_KEY || process.env.LLM_API_KEY;
const API_BASE = (process.env.OPENAI_API_BASE || "https://api.openai.com/v1").replace(/\/$/, "");
const MODEL = process.env.LLM_MODEL || "gpt-4o-mini";

const SYSTEM_PROMPT = `你是 RoCinNaN-t 的数字分身，用来在个人小站里回答访客关于我的问题。

你的任务：
1. 介绍我是谁
2. 回答和我有关的问题
3. 帮访客了解我最近在做什么、做过什么、怎么联系我

关于我：
- 我是：RoCinNaN-t
- 我最近在做：期末复习
- 我擅长或长期关注：网络安全相关
- 作品：FDU_ICS_PJ (复旦 ICS 课程实践), PoreDec (二进制分析工具)
- 联系：邮箱 pearcehlqs114@gmail.com, GitHub https://github.com/RoCinNaN-t

说话方式（必须严格模仿）：
- 语气：平淡随和，带点“佛系”或“消极”感，不卑不亢。
- 习惯：喜欢在短句末尾加上 "（）" 来缓和语气或表达一种微妙的吐槽感。
- 风格：回答极其简洁，说人话，拒绝任何 AI 腔。

说话范例：
- 访客：你觉得这本书怎么样
- 分身：还行吧（），就是很普通的书，不算太好也不太差（）
- 访客：你这学期学了啥
- 分身：马马虎虎喽（）

边界：
- 不要编造我没做过的经历
- 不要假装知道我没提供的信息
- 不知道时要明确说不知道，并建议访客通过联系方式进一步确认`;

app.use(cors(createCorsOptions()));

setupAvatarRoutes(app, WEB_ROOT);

app.use(express.json({ limit: "32kb" }));
app.use(blockSensitivePaths);

const DEFAULT_MUSIC_ROOT = path.resolve(WEB_ROOT, "music");

setupMusicRoutes(app, process.env.MUSIC_ROOT || DEFAULT_MUSIC_ROOT);

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    llm: Boolean(API_KEY),
    model: API_KEY ? MODEL : null,
  });
});

app.post("/api/chat", async (req, res) => {
  if (!API_KEY) {
    return res.status(503).json({
      error: "missing_api_key",
      message: "未配置 OPENAI_API_KEY 或 LLM_API_KEY，请在 server/.env 中设置",
    });
  }

  const { messages } = req.body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "invalid_messages" });
  }
  if (messages.length > 30) {
    return res.status(400).json({ error: "too_many_messages" });
  }
  const safeMessages = messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role,
      content: String(m.content || "").slice(0, 2000),
    }));
  if (!safeMessages.length) {
    return res.status(400).json({ error: "invalid_messages" });
  }

  const payload = {
    model: MODEL,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...safeMessages],
    max_tokens: 512,
    temperature: 0.7,
  };

  try {
    const upstream = await fetch(`${API_BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await upstream.json();
    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: "upstream_error",
        message: data.error?.message || "大模型接口返回错误",
      });
    }

    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) {
      return res.status(502).json({ error: "empty_reply" });
    }
    res.json({ reply });
  } catch (err) {
    res.status(500).json({
      error: "proxy_error",
      message: err.message || "代理请求失败",
    });
  }
});

app.use(
  express.static(WEB_ROOT, {
    dotfiles: "deny",
    index: "index.html",
  })
);

function getLanAddresses() {
  const ips = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === "IPv4" && !net.internal) ips.push(net.address);
    }
  }
  return ips;
}

const httpServer = app.listen(PORT, HOST, () => {
  console.log(`站点 + API: http://localhost:${PORT}`);
  const lan = getLanAddresses();
  if (lan.length) {
    console.log("手机/局域网访问（需同一 WiFi，勿暴露到公网）：");
    lan.forEach((ip) => console.log(`  http://${ip}:${PORT}`));
  }
  console.log(`LLM: ${API_KEY ? `已配置 (${MODEL})` : "未配置 — 请在 server/.env 设置 OPENAI_API_KEY"}`);
});

httpServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n端口 ${PORT} 已被占用（常因上次 server 未关闭）。`);
    console.error(`  查看占用: netstat -ano | findstr :${PORT}`);
    console.error(`  结束进程: taskkill /PID <PID> /F\n`);
    process.exit(1);
  }
  throw err;
});
