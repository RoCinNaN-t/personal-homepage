import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parseFile } from "music-metadata";
import { requireAdminToken } from "./security.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MUSIC_ROOT = path.resolve(__dirname, "..", "music");

const AUDIO_EXT = new Set([
  ".mp3", ".flac", ".m4a", ".aac", ".ogg", ".wav", ".wma", ".opus", ".ape",
]);

const PARSE_OPTIONS = { duration: false, skipCovers: false };

function mimeFromPictureFormat(format) {
  if (!format) return "image/jpeg";
  const f = String(format).trim().toLowerCase();
  if (f.startsWith("image/")) return f;
  if (f === "jpg" || f === "jpeg") return "image/jpeg";
  if (f === "png") return "image/png";
  if (f === "gif") return "image/gif";
  if (f === "webp") return "image/webp";
  if (f === "bmp") return "image/bmp";
  return `image/${f}`;
}

/** 从音频内嵌标签提取封面，转为 Data URI */
async function extractCoverDataUri(filePath) {
  const meta = await parseFile(filePath, PARSE_OPTIONS);
  const pictures = meta.common?.picture;
  if (!Array.isArray(pictures) || pictures.length === 0) return null;

  const pic = pictures[0];
  if (!pic?.data?.length) return null;

  const buf = Buffer.isBuffer(pic.data) ? pic.data : Buffer.from(pic.data);
  const mime = mimeFromPictureFormat(pic.format);
  const base64 = buf.toString("base64");
  return `data:${mime};base64,${base64}`;
}

let musicRoot = "";
let searchIndex = null;
let indexBuilding = false;

function normalizeSubPath(subPath) {
  const cleaned = String(subPath || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  if (!cleaned || cleaned === ".") return "";
  const resolved = path.normalize(cleaned);
  if (resolved.startsWith("..") || path.isAbsolute(resolved)) {
    return null;
  }
  return resolved;
}

function resolveSafe(subPath) {
  const rel = normalizeSubPath(subPath);
  if (rel === null) return null;
  const full = path.resolve(musicRoot, rel || ".");
  const rootResolved = path.resolve(musicRoot);
  const relToRoot = path.relative(rootResolved, full);
  if (relToRoot.startsWith("..") || path.isAbsolute(relToRoot)) {
    return null;
  }
  return full;
}

async function walkDir(dir, relBase, out) {
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    const rel = relBase ? `${relBase}/${ent.name}` : ent.name;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      await walkDir(full, rel.replace(/\\/g, "/"), out);
    } else if (ent.isFile() && AUDIO_EXT.has(path.extname(ent.name).toLowerCase())) {
      out.push({
        path: rel.replace(/\\/g, "/"),
        name: ent.name,
        title: path.parse(ent.name).name,
      });
    }
  }
}

async function ensureSearchIndex() {
  if (searchIndex) return searchIndex;
  if (indexBuilding) {
    return new Promise((resolve) => {
      const t = setInterval(() => {
        if (searchIndex || !indexBuilding) {
          clearInterval(t);
          resolve(searchIndex || []);
        }
      }, 200);
    });
  }
  indexBuilding = true;
  const items = [];
  await walkDir(musicRoot, "", items);
  searchIndex = items;
  indexBuilding = false;
  console.log(`Music index: ${items.length} tracks under ${musicRoot}`);
  return searchIndex;
}

export function setupMusicRoutes(app, rootFromEnv) {
  musicRoot = path.resolve(rootFromEnv || DEFAULT_MUSIC_ROOT);
  if (!fs.existsSync(musicRoot)) {
    console.warn(`MUSIC_ROOT 不存在: ${musicRoot}`);
  }

  app.get("/api/music/status", (_req, res) => {
    res.json({
      ok: fs.existsSync(musicRoot),
      indexed: Boolean(searchIndex),
      count: searchIndex?.length ?? 0,
      indexing: indexBuilding,
    });
  });

  app.get("/api/music/list", async (req, res) => {
    if (!fs.existsSync(musicRoot)) {
      return res.status(404).json({ error: "music_root_missing" });
    }
    const rel = normalizeSubPath(req.query.path ?? "") ?? "";
    const dir = rel ? resolveSafe(rel) : musicRoot;
    if (!dir || !fs.existsSync(dir)) {
      return res.status(400).json({ error: "invalid_path" });
    }
    const st = await fs.promises.stat(dir);
    if (!st.isDirectory()) {
      return res.status(400).json({ error: "not_a_directory" });
    }

    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    const folders = [];
    const files = [];
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) {
        folders.push({ name: ent.name, path: childRel.replace(/\\/g, "/") });
      } else if (ent.isFile() && AUDIO_EXT.has(path.extname(ent.name).toLowerCase())) {
        files.push({
          path: childRel.replace(/\\/g, "/"),
          name: ent.name,
          title: path.parse(ent.name).name,
        });
      }
    }
    folders.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    files.sort((a, b) => a.name.localeCompare(b.name, "zh"));
    res.json({ path: rel, folders, files });
  });

  app.get("/api/music/search", async (req, res) => {
    const q = String(req.query.q || "").trim().toLowerCase();
    const limit = Math.min(parseInt(req.query.limit, 10) || 40, 80);
    if (!q) return res.json({ items: [] });
    const index = await ensureSearchIndex();
    const items = index
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.path.toLowerCase().includes(q)
      )
      .slice(0, limit);
    res.json({ items, total: items.length });
  });

  app.post("/api/music/reindex", requireAdminToken, async (_req, res) => {
    searchIndex = null;
    indexBuilding = false;
    const index = await ensureSearchIndex();
    res.json({ ok: true, count: index.length });
  });

  app.get("/api/music/stream", async (req, res) => {
    const full = resolveSafe(req.query.path);
    if (!full || !fs.existsSync(full)) {
      return res.status(404).json({ error: "not_found" });
    }
    res.sendFile(full);
  });

  app.get("/api/music/cover", async (req, res) => {
    const full = resolveSafe(req.query.path);
    if (!full || !fs.existsSync(full)) {
      return res.status(404).json({ ok: false, error: "not_found" });
    }
    try {
      const dataUri = await extractCoverDataUri(full);
      if (!dataUri) {
        return res.status(404).json({ ok: false, error: "no_embedded_cover" });
      }
      res.set("Cache-Control", "public, max-age=86400");
      res.json({ ok: true, dataUri });
    } catch {
      res.status(500).json({ ok: false, error: "cover_parse_failed" });
    }
  });

  ensureSearchIndex().catch((err) => console.warn("Music index build failed:", err.message));
}
