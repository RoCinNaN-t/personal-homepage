/**
 * 音乐播放器 — 通过 server 扫描 D:\Music，封面从音频内嵌标签读取
 */
function formatTime(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function trackFromPath(filePath, title) {
  const q = encodeURIComponent(filePath);
  const base = getApiBase();
  return {
    path: filePath,
    title: title || filePath.split("/").pop(),
    src: `${base}/api/music/stream?path=${q}`,
    coverDataUri: null,
  };
}

const coverCache = new Map();

async function fetchCoverDataUri(apiBase, filePath) {
  if (coverCache.has(filePath)) return coverCache.get(filePath);
  const res = await fetch(
    `${apiBase}/api/music/cover?path=${encodeURIComponent(filePath)}`
  );
  const data = await res.json().catch(() => ({}));
  const uri = data.ok && data.dataUri ? data.dataUri : null;
  coverCache.set(filePath, uri);
  return uri;
}

function initMusicPlayer() {
  const API_BASE = getApiBase();
  let playlist = [];
  let currentPath = "";

  const audio = document.getElementById("bgm");
  const playBtn = document.getElementById("playBtn");
  const prevBtn = document.getElementById("prevBtn");
  const nextBtn = document.getElementById("nextBtn");
  const volume = document.getElementById("volume");
  const progress = document.getElementById("progress");
  const timeCurrent = document.getElementById("timeCurrent");
  const timeTotal = document.getElementById("timeTotal");
  const trackTitle = document.getElementById("trackTitle");
  const coverImg = document.getElementById("coverImg");
  const playlistEl = document.getElementById("playlistEl");
  const musicNav = document.getElementById("musicNav");
  const musicSearch = document.getElementById("musicSearch");

  let currentIndex = 0;
  let isSeeking = false;
  let searchTimer = null;

  audio.volume = parseFloat(volume.value);
  const defaultCover = "assets/music-note.svg";
  coverImg.addEventListener("error", () => {
    coverImg.src = defaultCover;
  });

  async function applyCover(track) {
    coverImg.src = defaultCover;
    try {
      let dataUri = track.coverDataUri;
      if (!dataUri) {
        dataUri = await fetchCoverDataUri(API_BASE, track.path);
        track.coverDataUri = dataUri;
      }
      if (dataUri) {
        coverImg.src = dataUri;
      }
    } catch {
      coverImg.src = defaultCover;
    }
  }

  function setControlsEnabled(on) {
    playBtn.disabled = !on;
    prevBtn.disabled = !on;
    nextBtn.disabled = !on;
  }

  function renderPlaylist() {
    playlistEl.innerHTML = "";
    if (!playlist.length) {
      const li = document.createElement("li");
      li.className = "playlist-empty";
      li.textContent = "当前目录无音频，或请进入子文件夹 / 搜索";
      playlistEl.appendChild(li);
      return;
    }

    playlist.forEach((track, i) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "playlist-item" + (i === currentIndex ? " is-active" : "");
      btn.textContent = track.title;
      btn.title = track.path;
      btn.addEventListener("click", () => loadTrack(i, true));
      li.appendChild(btn);
      playlistEl.appendChild(li);
    });
  }

  function updatePlaylistHighlight() {
    playlistEl.querySelectorAll(".playlist-item").forEach((btn, i) => {
      btn.classList.toggle("is-active", i === currentIndex);
    });
  }

  function loadTrack(index, autoplay) {
    if (!playlist.length) return;
    currentIndex = (index + playlist.length) % playlist.length;
    const track = playlist[currentIndex];
    audio.src = track.src;
    trackTitle.textContent = track.title;
    coverImg.alt = track.title + " 封面";
    applyCover(track);
    updatePlaylistHighlight();
    progress.value = 0;
    timeCurrent.textContent = "0:00";
    timeTotal.textContent = "0:00";
    if (autoplay) {
      audio.play().then(() => {
        playBtn.textContent = "⏸";
      }).catch(() => {
        trackTitle.textContent += "（播放失败）";
        playBtn.textContent = "▶";
      });
    } else {
      playBtn.textContent = "▶";
    }
  }

  function renderNav(data) {
    musicNav.innerHTML = "";
    const parts = data.path ? data.path.split("/") : [];

    const crumb = document.createElement("span");
    crumb.className = "music-crumb";
    const rootBtn = document.createElement("button");
    rootBtn.type = "button";
    rootBtn.className = "music-folder-btn";
    rootBtn.textContent = "📁 根目录";
    rootBtn.addEventListener("click", () => {
      musicSearch.value = "";
      loadFolder("");
    });
    crumb.appendChild(rootBtn);

    let acc = "";
    parts.forEach((seg) => {
      acc = acc ? `${acc}/${seg}` : seg;
      const sep = document.createElement("span");
      sep.className = "music-crumb-sep";
      sep.textContent = " / ";
      crumb.appendChild(sep);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "music-folder-btn";
      btn.textContent = seg;
      const target = acc;
      btn.addEventListener("click", () => {
        musicSearch.value = "";
        loadFolder(target);
      });
      crumb.appendChild(btn);
    });
    musicNav.appendChild(crumb);

    const folders = document.createElement("div");
    folders.className = "music-folders";
    data.folders.forEach((f) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "music-folder-btn";
      btn.textContent = "📁 " + f.name;
      btn.addEventListener("click", () => {
        musicSearch.value = "";
        loadFolder(f.path);
      });
      folders.appendChild(btn);
    });
    if (data.folders.length) musicNav.appendChild(folders);
  }

  async function loadFolder(relPath) {
    currentPath = relPath;
    try {
      const res = await fetch(
        `${API_BASE}/api/music/list?path=${encodeURIComponent(relPath)}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "list failed");
      renderNav(data);
      playlist = data.files.map((f) => trackFromPath(f.path, f.title));
      currentIndex = 0;
      renderPlaylist();
      setControlsEnabled(playlist.length > 0);
      if (playlist.length) loadTrack(0, false);
      else trackTitle.textContent = data.path ? "此文件夹暂无音频" : "请选择文件夹或搜索";
    } catch {
      trackTitle.textContent = "无法加载音乐库（请先启动 server）";
      setControlsEnabled(false);
    }
  }

  async function runSearch(q) {
    if (!q) {
      loadFolder(currentPath);
      return;
    }
    try {
      const res = await fetch(
        `${API_BASE}/api/music/search?q=${encodeURIComponent(q)}&limit=50`
      );
      const data = await res.json();
      musicNav.innerHTML = "";
      const hint = document.createElement("span");
      hint.className = "music-crumb";
      hint.textContent = `搜索「${q}」共 ${data.items?.length || 0} 首`;
      musicNav.appendChild(hint);
      playlist = (data.items || []).map((f) => trackFromPath(f.path, f.title));
      currentIndex = 0;
      renderPlaylist();
      setControlsEnabled(playlist.length > 0);
      if (playlist.length) loadTrack(0, false);
      else trackTitle.textContent = "没有匹配的曲目";
    } catch {
      trackTitle.textContent = "搜索失败";
    }
  }

  musicSearch.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => runSearch(musicSearch.value.trim()), 350);
  });

  volume.addEventListener("input", () => {
    audio.volume = parseFloat(volume.value);
  });

  playBtn.addEventListener("click", () => {
    if (!playlist.length) return;
    if (!audio.src) loadTrack(0, false);
    if (audio.paused) {
      audio.play().then(() => {
        playBtn.textContent = "⏸";
      }).catch(() => {
        trackTitle.textContent = "播放失败";
      });
    } else {
      audio.pause();
      playBtn.textContent = "▶";
    }
  });

  prevBtn.addEventListener("click", () => loadTrack(currentIndex - 1, true));
  nextBtn.addEventListener("click", () => loadTrack(currentIndex + 1, true));

  audio.addEventListener("loadedmetadata", () => {
    timeTotal.textContent = formatTime(audio.duration);
    progress.max = audio.duration || 100;
  });

  audio.addEventListener("timeupdate", () => {
    if (isSeeking) return;
    timeCurrent.textContent = formatTime(audio.currentTime);
    if (audio.duration) progress.value = audio.currentTime;
  });

  progress.addEventListener("input", () => {
    isSeeking = true;
    timeCurrent.textContent = formatTime(Number(progress.value));
  });

  progress.addEventListener("change", () => {
    audio.currentTime = Number(progress.value);
    isSeeking = false;
  });

  audio.addEventListener("ended", () => loadTrack(currentIndex + 1, true));
  audio.addEventListener("pause", () => {
    if (!audio.ended) playBtn.textContent = "▶";
  });
  audio.addEventListener("play", () => {
    playBtn.textContent = "⏸";
  });

  setControlsEnabled(false);
  fetch(`${API_BASE}/api/music/status`)
    .then((r) => r.json())
    .then((s) => {
      if (s.ok) {
        trackTitle.textContent = s.indexed
          ? `曲库 ${s.count} 首，浏览文件夹或搜索播放`
          : "正在建立曲库索引…";
        loadFolder("");
      } else {
        trackTitle.textContent = `音乐目录不可用: ${s.root}`;
      }
    })
    .catch(() => {
      trackTitle.textContent = `无法连接 API（${getApiBase()}），请在 server 目录运行 npm start`;
    });
}

document.addEventListener("DOMContentLoaded", initMusicPlayer);
