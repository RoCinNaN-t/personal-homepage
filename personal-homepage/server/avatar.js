import fs from "fs";
import express from "express";
import path from "path";

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);
const EXT_BY_TYPE = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
};
const MAX_BYTES = 2 * 1024 * 1024;

function readMeta(metaPath) {
  try {
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, "utf8"));
    }
  } catch {
    /* ignore */
  }
  return null;
}

function removeOldCustomAvatars(assetsDir, keepFile) {
  for (const name of fs.readdirSync(assetsDir)) {
    if (name.startsWith("avatar-custom.") && name !== keepFile) {
      try {
        fs.unlinkSync(path.join(assetsDir, name));
      } catch {
        /* ignore */
      }
    }
  }
}

export function setupAvatarRoutes(app, webRoot) {
  const assetsDir = path.join(webRoot, "assets");
  const metaPath = path.join(assetsDir, "avatar-meta.json");
  const defaultAvatar = "assets/avatar.svg";

  app.get("/api/avatar", (_req, res) => {
    const meta = readMeta(metaPath);
    res.json(meta || { path: null, default: defaultAvatar });
  });

  app.post("/api/avatar", express.json({ limit: "3mb" }), (req, res) => {
    const dataUri = req.body?.image;
    const match = /^data:(image\/(?:jpeg|png|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
      String(dataUri || "")
    );
    if (!match) {
      return res.status(400).json({ error: "invalid_image" });
    }
    const mime = match[1];
    if (!ALLOWED_TYPES.has(mime)) {
      return res.status(400).json({ error: "unsupported_type" });
    }

    const buf = Buffer.from(match[2], "base64");
    if (buf.length > MAX_BYTES) {
      return res.status(400).json({ error: "too_large" });
    }

    const ext = EXT_BY_TYPE[mime];
    const filename = `avatar-custom${ext}`;
    const filePath = path.join(assetsDir, filename);

    try {
      fs.writeFileSync(filePath, buf);
      removeOldCustomAvatars(assetsDir, filename);
      const meta = { path: `assets/${filename}`, updatedAt: Date.now() };
      fs.writeFileSync(metaPath, JSON.stringify(meta));
      res.json({ ok: true, ...meta });
    } catch {
      res.status(500).json({ error: "save_failed" });
    }
  });
}
