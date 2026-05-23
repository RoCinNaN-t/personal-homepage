# HLQS 个人主页

复古 2010 风清爽蓝色个人小站，含个人信息展示、数字分身聊天区与背景音乐播放器。

## 预览

```powershell
cd personal-homepage/server
npm install
npm start
```

浏览器打开 **http://localhost:3457**。

## 音乐

将 mp3 等音频文件放入项目根目录下的 **`music/`** 文件夹（可建子文件夹分类）。启动 server 后会自动扫描；封面从音频内嵌标签读取。

如需改用其它目录，在 `server/.env` 中设置 `MUSIC_ROOT`（参见 `.env.example`）。

## 自定义

| 项目 | 操作 |
|------|------|
| 头像 | 替换 `assets/avatar.svg` |
| 背景音乐 | 放入 `music/` 目录 |
| 分身话术 | 编辑 `js/chat.js` 中的 `TwinKnowledge` |
| 大模型分身 | 在 `server/.env` 配置 `OPENAI_API_KEY`，系统提示见 `server/index.js` |

## 数字分身

默认先尝试连接本机 LLM 代理；未配置 API Key 时回退为关键词匹配（页面会标注回复来源）。

## 目录结构

```
personal-homepage/
├── index.html
├── css/style.css
├── js/
│   ├── chat.js
│   ├── main.js
│   └── site-config.js
├── music/          # 在此放入音频文件
├── assets/
└── server/         # 站点与 API 服务
```
