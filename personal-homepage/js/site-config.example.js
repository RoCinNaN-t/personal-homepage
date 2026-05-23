/**
 * 复制本文件为 site-config.js 并按需修改（site-config.js 已在 .gitignore）
 */
window.SITE_CONFIG = {
  /**
   * 务必保持 auto。不要填 loca.lt 等公网隧道（无法读本机 D:\Music，且会暴露服务）
   */
  apiBase: "auto",
  apiPort: "3457",
  /** 数字分身 LLM：需同时启动 server/ 代理（见 README） */
  llm: {
    apiUrl: "auto",
    /** 启动时探测 /api/health，失败则回退关键词匹配 */
    preferLlm: true,
  },
};
