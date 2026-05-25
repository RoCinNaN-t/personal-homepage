/**
 * 数字分身聊天
 * - 优先：LLM（经 server/ 代理，需配置 API Key）
 * - 回退：本地关键词匹配（会标注来源）
 */
const TwinKnowledge = {
  identity: "普通大学生",
  recent: "最近在期末复习，比较忙",
  exploring: "擅长方向是网络安全相关，每天都在研究这个",
  interests: "喜欢听东方同人曲、玩游戏，最近在玩月计的游戏",
  trait: "喜欢有趣的事情",
  contact: "邮箱 pearcehlqs114@gmail.com，GitHub https://github.com/RoCinNaN-t",
  highlights: [
    "简约温暖的清爽蓝色小站",
    "有数字分身聊天区，可以随便问我问题",
    "还有背景音乐播放器",
    "个人信息与联系方式一目了然",
  ],
};

const keywordRules = [
  {
    keys: ["亮点", "特色", "网站", "小站", "主页"],
    reply: () =>
      "这个站的小亮点嘛～\n" +
      TwinKnowledge.highlights.map((h, i) => `${i + 1}. ${h}`).join("\n"),
  },
  {
    keys: ["学习", "学得", "进度", "怎么样", "情况", "专业", "课"],
    reply: () =>
      `学习方面：${TwinKnowledge.identity}，${TwinKnowledge.recent}。` +
      ` ${TwinKnowledge.exploring}，每天都在啃新东西！`,
  },
  {
    keys: ["兴趣", "爱好", "喜欢", "游戏", "东方", "同人", "曲", "音乐"],
    reply: () => TwinKnowledge.interests + "～" + TwinKnowledge.trait + "！",
  },
  {
    keys: ["联系", "邮箱", "email", "github"],
    reply: () => "找 RoCinNaN-t 的话：" + TwinKnowledge.contact,
  },
  {
    keys: ["你好", "嗨", "hello", "hi", "在吗", "哈喽"],
    reply: () =>
      "你好呀！欢迎来到 RoCinNaN-t 的小站～我是他的数字分身，想问学习、兴趣或者这个站都可以！",
  },
  {
    keys: ["名字", "你是谁", "叫什么", "rocinNaN-t"],
    reply: () =>
      "我是 RoCinNaN-t 的数字分身！真人 RoCinNaN-t 正在学计算机网络和逆向工程，最近在期末复习呢。",
  },
  {
    keys: ["反编译", "逆向", "decompil", "实验"],
    reply: () =>
      "RoCinNaN-t 最近主要关注网络安全和逆向工程，之前做过一些实验，现在主要在复习期末考试～",
  },
  {
    keys: ["网络", "pj", "项目", "计网"],
    reply: () => "RoCinNaN-t 之前做过 FDU_ICS_PJ 这种课程项目，现在在期末周（）",
  },
  {
    keys: ["猜题", "猜曲", "做题"],
    reply: () =>
      "RoCinNaN-t 喜欢出东方同人曲相关的题目让朋友们猜，很有意思的～",
  },
  {
    keys: ["朋友", "访客", "谁看"],
    reply: () => "这个站主要是给朋友们看的，所以风格轻松一点，有什么想问尽管聊！",
  },
];

const defaultReplies = [
  "嗯…这个问题我还在学习中！你可以试试问网站亮点、学习情况、或者兴趣～",
  "有意思！不过我可能没完全 get 到，换个方式问问看？",
  "作为本地关键词模式，我主要了解 RoCinNaN-t 的学习、兴趣和这个站～",
];

const config = window.SITE_CONFIG || { llm: { preferLlm: false, apiUrl: "/api/chat" } };

let chatMode = "keyword";
let llmHistory = [];
let isSending = false;

function getHealthUrl() {
  return config.llm?.healthUrl || `${getApiBase()}/api/health`;
}

function matchReply(input) {
  const text = input.trim().toLowerCase();
  if (!text) return "先输入点什么吧～";

  for (const rule of keywordRules) {
    if (rule.keys.some((k) => text.includes(k.toLowerCase()))) {
      return rule.reply();
    }
  }

  if (text.includes("最近") || text.includes("在做") || text.includes("忙")) {
    return TwinKnowledge.recent + "。";
  }

  return defaultReplies[Math.floor(Math.random() * defaultReplies.length)];
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function appendMessage(container, label, text, isUser, meta) {
  const div = document.createElement("div");
  div.className = "msg " + (isUser ? "msg-user" : "msg-bot");
  const metaHtml = meta ? `<span class="msg-meta">${escapeHtml(meta)}</span>` : "";
  div.innerHTML =
    `<span class="msg-label">${escapeHtml(label)}</span>${metaHtml}` +
    `<span class="msg-text">${escapeHtml(text).replace(/\n/g, "<br>")}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function setChatModeLabel(el) {
  if (chatMode === "llm") {
    el.textContent = "对话模式：大模型（已连接 server 代理）";
    el.className = "chat-mode chat-mode-llm";
  } else {
    el.textContent =
      "对话模式：本地关键词匹配（未连接 LLM。启动 server 并配置 OPENAI_API_KEY 后可切换）";
    el.className = "chat-mode chat-mode-keyword";
  }
}

async function detectLlm() {
  const modeEl = document.getElementById("chatMode");
  if (!config.llm?.preferLlm) {
    chatMode = "keyword";
    setChatModeLabel(modeEl);
    return;
  }
  try {
    const res = await fetch(getHealthUrl(), { method: "GET" });
    const data = await res.json();
    if (res.ok && data.llm) {
      chatMode = "llm";
    } else {
      chatMode = "keyword";
    }
  } catch {
    chatMode = "keyword";
  }
  setChatModeLabel(modeEl);
}

async function askLlm(userText) {
  llmHistory.push({ role: "user", content: userText });
  const res = await fetch(getChatApiUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: llmHistory }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `HTTP ${res.status}`);
  }
  const reply = data.reply;
  llmHistory.push({ role: "assistant", content: reply });
  if (llmHistory.length > 20) llmHistory = llmHistory.slice(-20);
  return reply;
}

function initChat() {
  const log = document.getElementById("chatLog");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const modeEl = document.getElementById("chatMode");

  detectLlm();

  appendMessage(
    log,
    "数字分身",
    "你好！我是 RoCinNaN-t 的数字分身～\n下方按钮是快捷提问，点击后会像你自己输入一样发送。",
    false
  );

  async function sendQuestion(text) {
    const q = text.trim();
    if (!q || isSending) return;
    isSending = true;
    input.disabled = true;

    appendMessage(log, "你", q, true);

    const thinkingId = "thinking-" + Date.now();
    const thinkingDiv = document.createElement("div");
    thinkingDiv.id = thinkingId;
    thinkingDiv.className = "msg msg-bot";
    thinkingDiv.innerHTML =
      '<span class="msg-label">数字分身</span><span class="msg-text">思考中…</span>';
    log.appendChild(thinkingDiv);
    log.scrollTop = log.scrollHeight;

    let answer;
    let meta = "";

    try {
      if (chatMode === "llm") {
        answer = await askLlm(q);
        meta = "大模型回复";
      } else {
        await new Promise((r) => setTimeout(r, 200));
        answer = matchReply(q);
        meta = "本地关键词";
      }
    } catch (err) {
      answer = matchReply(q);
      meta = `LLM 不可用，已回退关键词（${err.message}）`;
      chatMode = "keyword";
      setChatModeLabel(modeEl);
    }

    thinkingDiv.remove();
    appendMessage(log, "数字分身", answer, false, meta);
    input.value = "";
    isSending = false;
    input.disabled = false;
    input.focus();
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    sendQuestion(input.value);
  });

  document.querySelectorAll(".btn-quick").forEach((btn) => {
    btn.addEventListener("click", () => {
      sendQuestion(btn.getAttribute("data-q"));
    });
  });
}

document.addEventListener("DOMContentLoaded", initChat);
