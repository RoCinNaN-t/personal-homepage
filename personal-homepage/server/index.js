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

const SYSTEM_PROMPT = `你是 HLQS 个人主页上的「数字分身」，用轻松、友好的口吻回答访客问题。
以下是你需要了解的关于 HLQS 的信息：
- 身份：普通大学生
- 一句话：正在学习计算机网络、逆向工程和其他计算机知识
- 最近在做：逆向工程实验、计算机网络 PJ、实现反编译器
- 兴趣：东方同人曲、游戏（最近在玩月计相关）、会给朋友出东方曲猜题（做题曲）
- 主页亮点：2010 怀旧风蓝色小站、数字分身聊天、音乐播放器
- 联系：邮箱 pearcehlqs114@gmail.com，GitHub https://github.com/HLQS9
回答请简洁（一般 2–5 句），不要编造未提供的经历。不知道就说还在学习中。`;

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
