/**
 * 头像上传：选择图片后保存至 assets/avatar-custom.*
 */
function initAvatarUpload() {
  const img = document.getElementById("avatarImg");
  const input = document.getElementById("avatarInput");
  if (!img || !input) return;

  const defaultSrc = "assets/avatar.svg";

  function setAvatarSrc(path) {
    img.src = path ? `${path}?t=${Date.now()}` : defaultSrc;
  }

  img.addEventListener("error", () => {
    img.src = defaultSrc;
  });

  fetch(`${getApiBase()}/api/avatar`)
    .then((r) => r.json())
    .then((data) => {
      if (data?.path) setAvatarSrc(data.path);
    })
    .catch(() => {});

  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      alert("请选择图片文件（jpg / png / gif / webp）");
      input.value = "";
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      alert("图片不能超过 2MB");
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const res = await fetch(`${getApiBase()}/api/avatar`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: reader.result }),
        });
        const data = await res.json();
        if (!res.ok) {
          alert(data.error === "too_large" ? "图片过大" : "上传失败");
          return;
        }
        setAvatarSrc(data.path);
      } catch {
        alert("上传失败，请确认 server 已启动");
      } finally {
        input.value = "";
      }
    };
    reader.readAsDataURL(file);
  });
}

document.addEventListener("DOMContentLoaded", initAvatarUpload);
