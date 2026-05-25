/** 本机/局域网访问控制（个人小站，非公网服务） */

export function isPrivateHost(hostname) {
  if (!hostname) return true;
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]") {
    return true;
  }
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
  const m = /^172\.(\d{1,2})\./.exec(h);
  if (m) {
    const second = Number(m[1]);
    if (second >= 16 && second <= 31) return true;
  }
  return false;
}

export function createCorsOptions() {
  return {
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      try {
        const { hostname, protocol } = new URL(origin);
        if (protocol !== "http:" && protocol !== "https:") {
          return callback(new Error("CORS: 不支持的协议"));
        }
        if (isPrivateHost(hostname)) return callback(null, true);
      } catch {
        return callback(new Error("CORS: 非法 Origin"));
      }
      callback(new Error("CORS: 仅允许本机或局域网访问"));
    },
  };
}

/** 禁止通过静态服务泄露 server/.env、依赖等 */
export function blockSensitivePaths(req, res, next) {
  const p = req.path.replace(/\\/g, "/").toLowerCase();
  const blocked =
    p.startsWith("/server/") ||
    p.includes("/node_modules/") ||
    p.endsWith(".env") ||
    p.includes("/.env") ||
    p.endsWith(".git") ||
    p.startsWith("/.git");
  if (blocked) return res.status(404).end();
  next();
}

export function requireAdminToken(req, res, next) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    return res.status(403).json({
      error: "admin_disabled",
      message: "未配置 ADMIN_TOKEN，已禁用该管理接口",
    });
  }
  const given = req.get("x-admin-token") || req.query.token;
  if (given !== token) {
    return res.status(401).json({ error: "unauthorized" });
  }
  next();
}
