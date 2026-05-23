/**
 * 根据当前页面地址自动推断 API 根路径（仅本机/局域网）
 */
function isPrivatePageHost(hostname) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1") return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  const m = /^172\.(\d{1,2})\./.exec(h);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  return false;
}

function getApiBase() {
  const cfg = window.SITE_CONFIG || {};
  const explicit = cfg.apiBase;
  if (explicit && explicit !== "auto") {
    try {
      const u = new URL(explicit);
      if (!isPrivatePageHost(u.hostname)) {
        console.warn(
          "[SITE_CONFIG] apiBase 指向公网/隧道地址，音乐 API 通常无法访问本机曲库，已改回 auto"
        );
      } else {
        return explicit.replace(/\/$/, "");
      }
    } catch {
      console.warn("[SITE_CONFIG] apiBase 无效，已改回 auto");
    }
  }

  const apiPort = cfg.apiPort || "3457";
  const { protocol, hostname, port, origin } = window.location;

  if (protocol === "file:") {
    return `http://127.0.0.1:${apiPort}`;
  }

  if (!isPrivatePageHost(hostname)) {
    console.warn("[api-base] 当前非局域网地址，请使用 http://本机IP:3457 访问");
  }

  if (port === String(apiPort)) {
    return origin;
  }

  return `${protocol}//${hostname}:${apiPort}`;
}

function getChatApiUrl() {
  const cfg = window.SITE_CONFIG || {};
  if (cfg.llm?.apiUrl && cfg.llm.apiUrl !== "auto") {
    const url = cfg.llm.apiUrl;
    try {
      const u = new URL(url);
      if (isPrivatePageHost(u.hostname)) return url;
      console.warn("[SITE_CONFIG] llm.apiUrl 非局域网，已改回 auto");
    } catch {
      console.warn("[SITE_CONFIG] llm.apiUrl 无效");
    }
  }
  return `${getApiBase()}/api/chat`;
}
