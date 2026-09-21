// ==========================================================
// Client Gallery — login, cover screen, photo grid, favourites,
// share, download-all (zip) and full-size viewer.
//
// Talks to /api/gallery-login, /api/gallery-photos (GET photos, POST like)
// and /api/gallery-logout. The session lives in an httpOnly cookie set by
// the login endpoint, so this script never keeps the password.
// ==========================================================

const ICONS = {
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.3-9.1C1.5 8.3 3.4 5 6.6 5c2 0 3.7 1.1 5.4 3.2C13.7 6.1 15.4 5 17.4 5c3.2 0 5.1 3.3 3.9 6.4-1.8 4.5-9.3 9.1-9.3 9.1z"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M12 15l-4.5-4.5M12 15l4.5-4.5M4 17v2.5A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5V17"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5l14 14M19 5 5 19"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4.5 7.5 12 15 19.5"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4.5 16.5 12 9 19.5"/></svg>',
};

document.addEventListener("DOMContentLoaded", () => {
  const loginSection = document.getElementById("galleryLoginSection");
  const viewSection = document.getElementById("galleryViewSection");
  const loginForm = document.getElementById("galleryLoginForm");
  const submitBtn = document.getElementById("gallerySubmitBtn");
  const loginStatus = document.getElementById("galleryLoginStatus");
  if (!loginSection || !viewSection) return;

  const cover = document.getElementById("gvCover");
  const coverBg = document.getElementById("gvCoverBg");
  const coverTitle = document.getElementById("galleryClientName");
  const enterBtn = document.getElementById("gvEnter");
  const app = document.getElementById("gvApp");
  const titleEl = document.getElementById("gvTitle");
  const grid = document.getElementById("galleryPhotoGrid");
  const emptyEl = document.getElementById("gvEmpty");
  const statusEl = document.getElementById("gvStatus");
  const favBtn = document.getElementById("gvFavFilter");
  const favCount = document.getElementById("gvFavCount");
  const shareBtn = document.getElementById("gvShare");
  const zipBtn = document.getElementById("gvDownloadAll");
  const signOutBtn = document.getElementById("gallerySignOutBtn");

  let gallery = null;
  let likes = new Set();
  let favOnly = false;
  let statusTimer = null;

  // ---------- small helpers ----------

  function setLoginStatus(message, tone) {
    loginStatus.textContent = message;
    loginStatus.className = "form-status" + (tone ? ` form-status--${tone}` : "");
  }

  function toast(message, { sticky = false } = {}) {
    clearTimeout(statusTimer);
    statusEl.textContent = message;
    statusEl.hidden = !message;
    if (message && !sticky) statusTimer = setTimeout(() => { statusEl.hidden = true; }, 3500);
  }

  // Storage lives on another origin, where browsers ignore the `download`
  // attribute; this query param makes the storage service itself send the
  // original file as a download instead of opening it in a tab.
  function downloadUrl(src) {
    try {
      const url = new URL(src);
      url.searchParams.set("download", "1");
      return url.toString();
    } catch {
      return src;
    }
  }

  function visiblePhotos() {
    return favOnly ? gallery.photos.filter((p) => likes.has(p.src)) : gallery.photos;
  }

  function fileName(photo, index, used) {
    let name = photo.name;
    if (!name) {
      const ext = (photo.src.split("?")[0].match(/\.(jpe?g|png|webp)$/i) || [".jpg"])[0];
      name = `${gallery.slug}-${String(index + 1).padStart(3, "0")}${ext}`;
    }
    // Two different photos can share a file name (e.g. two cameras); keep both.
    if (used.has(name)) {
      const dot = name.lastIndexOf(".");
      let n = 2;
      let candidate;
      do {
        candidate = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
        n++;
      } while (used.has(candidate));
      name = candidate;
    }
    used.add(name);
    return name;
  }

  // ---------- likes ----------

  function syncLikeUI() {
    grid.querySelectorAll(".gv-photo").forEach((el) => {
      const on = likes.has(el.dataset.src);
      el.classList.toggle("is-liked", on);
      const btn = el.querySelector(".gv-like");
      btn.setAttribute("aria-pressed", String(on));
      btn.setAttribute("aria-label", on ? "Remove from favourites" : "Add to favourites");
    });
    favCount.textContent = String(likes.size);
    favCount.hidden = likes.size === 0;
    favBtn.classList.toggle("is-on", favOnly);
    favBtn.setAttribute("aria-pressed", String(favOnly));
    lightbox.syncLike();
  }

  async function toggleLike(src) {
    const liked = !likes.has(src);
    if (liked) likes.add(src);
    else likes.delete(src);
    if (favOnly && !liked) applyFilter();
    syncLikeUI();
    try {
      const res = await fetch("/api/gallery-photos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ src, liked }),
      });
      if (res.status === 401) throw new Error("Your session expired. Please sign in again.");
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't save that.");
      likes = new Set(data.likes);
    } catch (err) {
      if (liked) likes.delete(src);
      else likes.add(src);
      toast(err.message || "Couldn't save that. Please try again.");
    }
    syncLikeUI();
  }

  // ---------- grid ----------

  function buildGrid() {
    grid.innerHTML = "";
    gallery.photos.forEach((photo, index) => {
      const figure = document.createElement("figure");
      figure.className = "gv-photo";
      figure.dataset.src = photo.src;

      const open = document.createElement("button");
      open.type = "button";
      open.className = "gv-photo-open";
      open.setAttribute("aria-label", `Open photo ${index + 1}`);
      const img = document.createElement("img");
      img.src = photo.thumb || photo.src;
      img.alt = photo.alt || "";
      img.loading = "lazy";
      open.appendChild(img);
      open.addEventListener("click", () => {
        const list = visiblePhotos();
        lightbox.open(list.indexOf(photo), list);
      });

      const like = document.createElement("button");
      like.type = "button";
      like.className = "gv-like";
      like.innerHTML = ICONS.heart;
      like.addEventListener("click", () => toggleLike(photo.src));

      figure.append(open, like);
      grid.appendChild(figure);
    });
    applyFilter();
  }

  function applyFilter() {
    let shown = 0;
    grid.querySelectorAll(".gv-photo").forEach((el) => {
      const show = !favOnly || likes.has(el.dataset.src);
      el.hidden = !show;
      if (show) shown++;
    });
    if (!gallery.photos.length) {
      emptyEl.textContent = "Your photos aren't ready yet — check back soon.";
      emptyEl.hidden = false;
    } else if (shown === 0) {
      emptyEl.textContent = "No favourites yet. Tap the heart on any photo to add it here.";
      emptyEl.hidden = false;
    } else {
      emptyEl.hidden = true;
    }
  }

  favBtn.addEventListener("click", () => {
    favOnly = !favOnly;
    applyFilter();
    syncLikeUI();
    window.scrollTo({ top: 0 });
  });

  // ---------- share ----------

  shareBtn.addEventListener("click", async () => {
    const url = `${location.origin}${location.pathname}?code=${encodeURIComponent(gallery.slug)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${gallery.clientName} — Emrashotit Studios`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast("Link copied. Whoever opens it will still need the gallery password.");
    } catch (err) {
      if (err && err.name === "AbortError") return;
      toast(`Copy this link: ${url}`, { sticky: true });
    }
  });

  // ---------- download everything as a zip ----------

  let zipping = false;
  zipBtn.addEventListener("click", async () => {
    if (zipping || !gallery.photos.length) return;
    zipping = true;
    zipBtn.disabled = true;

    const zipName = `${gallery.slug}.zip`;
    // Chrome/Edge can stream the zip straight to disk (no memory limit);
    // the picker must be opened right away, inside the click.
    let writable = null;
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: zipName,
          types: [{ description: "Zip archive", accept: { "application/zip": [".zip"] } }],
        });
        writable = await handle.createWritable();
      } catch (err) {
        if (err && err.name === "AbortError") {
          zipping = false;
          zipBtn.disabled = false;
          return;
        }
        writable = null;
      }
    }

    try {
      toast("Preparing your zip…", { sticky: true });
      const { downloadZip } = await import("https://esm.sh/client-zip@2");
      const photos = gallery.photos;
      const used = new Set();
      let done = 0;

      async function* files() {
        for (let i = 0; i < photos.length; i++) {
          const res = await fetch(photos[i].src);
          if (!res.ok) throw new Error(`Couldn't fetch photo ${i + 1}.`);
          done = i + 1;
          toast(`Zipping photo ${done} of ${photos.length}…`, { sticky: true });
          yield { name: fileName(photos[i], i, used), lastModified: new Date(), input: res };
        }
      }

      const response = downloadZip(files());
      if (writable) {
        await response.body.pipeTo(writable);
      } else {
        const blob = await response.blob();
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = zipName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 60000);
      }
      toast(`Downloaded ${photos.length} photo${photos.length === 1 ? "" : "s"}.`);
    } catch (err) {
      try { await writable?.abort(); } catch { /* ignore */ }
      toast(err.message || "The zip couldn't be created. Please try again.");
    } finally {
      zipping = false;
      zipBtn.disabled = false;
    }
  });

  // ---------- full-size viewer ----------

  const lightbox = (() => {
    const box = document.createElement("div");
    box.className = "gv-lightbox";
    box.hidden = true;
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Photo viewer");
    box.innerHTML = `
      <div class="gv-lb-top">
        <span class="gv-lb-count"></span>
        <div class="gv-lb-actions">
          <button type="button" class="gv-icon gv-lb-like" aria-label="Add to favourites">${ICONS.heart}</button>
          <a class="gv-icon gv-lb-download" aria-label="Download this photo" hidden>${ICONS.download}</a>
          <button type="button" class="gv-icon gv-lb-close" aria-label="Close">${ICONS.close}</button>
        </div>
      </div>
      <button type="button" class="gv-lb-nav gv-lb-prev" aria-label="Previous photo">${ICONS.prev}</button>
      <img class="gv-lb-img" alt="">
      <button type="button" class="gv-lb-nav gv-lb-next" aria-label="Next photo">${ICONS.next}</button>
    `;
    document.body.appendChild(box);

    const img = box.querySelector(".gv-lb-img");
    const count = box.querySelector(".gv-lb-count");
    const likeBtn = box.querySelector(".gv-lb-like");
    const dlLink = box.querySelector(".gv-lb-download");

    let list = [];
    let index = 0;
    let lastFocus = null;

    function current() { return list[index]; }

    function show(i) {
      if (!list.length) return;
      index = (i + list.length) % list.length;
      const photo = current();
      // Show the small preview instantly, then swap in the original once it's loaded.
      img.src = photo.thumb || photo.src;
      img.alt = photo.alt || "";
      if (photo.thumb) {
        const full = new Image();
        full.onload = () => { if (current() === photo) img.src = photo.src; };
        full.src = photo.src;
      }
      count.textContent = `${index + 1} / ${list.length}`;
      dlLink.hidden = !gallery.downloadEnabled;
      if (gallery.downloadEnabled) dlLink.href = downloadUrl(photo.src);
      box.querySelector(".gv-lb-prev").hidden = box.querySelector(".gv-lb-next").hidden = list.length < 2;
      syncLike();
    }

    function syncLike() {
      if (box.hidden || !current()) return;
      const on = likes.has(current().src);
      likeBtn.classList.toggle("is-on", on);
      likeBtn.setAttribute("aria-pressed", String(on));
      likeBtn.setAttribute("aria-label", on ? "Remove from favourites" : "Add to favourites");
    }

    function open(i, photos) {
      if (!photos.length) return;
      list = photos.slice();
      lastFocus = document.activeElement;
      box.hidden = false;
      document.body.classList.add("gv-noscroll");
      show(Math.max(i, 0));
      box.querySelector(".gv-lb-close").focus();
    }

    function close() {
      box.hidden = true;
      img.removeAttribute("src");
      document.body.classList.remove("gv-noscroll");
      lastFocus?.focus?.();
    }

    box.querySelector(".gv-lb-close").addEventListener("click", close);
    box.querySelector(".gv-lb-prev").addEventListener("click", () => show(index - 1));
    box.querySelector(".gv-lb-next").addEventListener("click", () => show(index + 1));
    likeBtn.addEventListener("click", () => current() && toggleLike(current().src));
    box.addEventListener("click", (e) => { if (e.target === box) close(); });

    document.addEventListener("keydown", (e) => {
      if (box.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") show(index - 1);
      else if (e.key === "ArrowRight") show(index + 1);
    });

    let touchX = null;
    box.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", (e) => {
      if (touchX === null) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
    });

    return { open, close, syncLike, isOpen: () => !box.hidden };
  })();

  // ---------- show / hide the gallery ----------

  function showGallery(data) {
    gallery = data;
    likes = new Set(data.likes || []);
    favOnly = false;

    coverTitle.textContent = data.clientName;
    titleEl.textContent = data.clientName;
    zipBtn.hidden = !data.downloadEnabled;
    buildGrid();
    syncLikeUI();

    // Cover: the first photo, small preview first then the original.
    const first = data.photos[0];
    coverBg.style.backgroundImage = "";
    if (first) {
      coverBg.style.backgroundImage = `url("${first.thumb || first.src}")`;
      if (first.thumb) {
        const full = new Image();
        full.onload = () => { coverBg.style.backgroundImage = `url("${first.src}")`; };
        full.src = first.src;
      }
    }

    loginSection.hidden = true;
    viewSection.hidden = false;
    document.body.classList.add("in-gallery");
    // No photos yet → skip the cover and go straight to the (empty) gallery.
    cover.hidden = !first;
    app.hidden = Boolean(first);
    window.scrollTo({ top: 0 });
  }

  enterBtn.addEventListener("click", () => {
    cover.hidden = true;
    app.hidden = false;
    window.scrollTo({ top: 0 });
  });

  function showLogin() {
    lightbox.close();
    viewSection.hidden = true;
    loginSection.hidden = false;
    document.body.classList.remove("in-gallery");
    gallery = null;
  }

  // ---------- sign in / out ----------

  // ?code=… (from a shared link) pre-fills the gallery code.
  const codeParam = new URLSearchParams(location.search).get("code");
  if (codeParam && loginForm.slug) loginForm.slug.value = codeParam;

  async function tryExistingSession() {
    try {
      const res = await fetch("/api/gallery-photos");
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) showGallery(data.gallery);
    } catch {
      // No backend deployed yet, or genuinely signed out — stay on the login form.
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setLoginStatus("", null);

    const slug = loginForm.slug.value.trim();
    const password = loginForm.password.value;

    if (!slug || !password) {
      setLoginStatus("Please enter your gallery code and password.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Checking…";

    try {
      const loginRes = await fetch("/api/gallery-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, password }),
      });
      const loginData = await loginRes.json();

      if (!loginRes.ok || !loginData.ok) {
        setLoginStatus(loginData.error || "Sign-in failed.", "error");
        return;
      }

      const photosRes = await fetch("/api/gallery-photos");
      const photosData = await photosRes.json();
      if (!photosRes.ok || !photosData.ok) {
        setLoginStatus("Signed in, but couldn't load photos. Please try again.", "error");
        return;
      }

      loginForm.reset();
      showGallery(photosData.gallery);
    } catch (err) {
      setLoginStatus("Couldn't reach the server. This page needs a deployed backend to sign in — see the project notes.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "View Gallery";
    }
  });

  signOutBtn?.addEventListener("click", async () => {
    try {
      await fetch("/api/gallery-logout", { method: "POST" });
    } catch {
      // Best effort — fall through to resetting the UI either way.
    }
    showLogin();
    setLoginStatus("", null);
  });

  tryExistingSession();
});
