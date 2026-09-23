// ==========================================================
// Admin dashboard — portfolio + client gallery management.
// Everything here requires the admin_session cookie; every fetch below
// relies on 401s from the API to catch an expired/missing session.
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
  const mainEl = document.getElementById("adminMain");
  const loadingEl = document.getElementById("adminLoading");

  const session = await fetch("/api/admin-session").then((r) => r.json()).catch(() => ({ ok: false }));
  if (!session.ok) {
    window.location.href = "/admin/login.html";
    return;
  }
  loadingEl.hidden = true;
  mainEl.hidden = false;

  initTabs();
  initSignOut();
  initPortfolioTab();
  initGalleriesTab();
});

/* ---------- Shared helpers ---------- */

// Thrown by adminFetch on a 401 so callers can tell "you got signed out"
// apart from an ordinary failure (a network blip, a bad file, R2 down) and
// stop retrying instead of treating it like any other per-item error.
class SessionExpiredError extends Error {
  constructor() {
    super("Your session expired. Please sign in again.");
    this.name = "SessionExpiredError";
  }
}

let signingOut = false;
// Fires once, however many requests 401 at the same time (a batch upload can
// have several in flight together) — clears the stale cookie and leaves.
function handleSessionExpired() {
  if (signingOut) return;
  signingOut = true;
  fetch("/api/admin-logout", { method: "POST" }).catch(() => {});
  window.location.href = "/admin/login.html?expired=1";
}

// Use this instead of fetch() for every /api/admin/* call. A 401 means the
// admin session cookie is gone (12h expiry, or signed out elsewhere) — not
// something worth showing per file in a big batch, so this signs the admin
// out and sends them back to login immediately.
async function adminFetch(url, options) {
  const res = await fetch(url, options);
  if (res.status === 401) {
    handleSessionExpired();
    throw new SessionExpiredError();
  }
  return res;
}

function setStatus(el, message, tone) {
  el.textContent = message;
  el.className = "form-status" + (tone ? ` form-status--${tone}` : "");
}

// Runs `fn` over `items` with at most `limit` in flight at once. Like
// Promise.allSettled, but bounded — a big batch of full-res photo uploads
// shouldn't all fire at the same time (browsers cap ~6 connections per
// host anyway, and it's easier on R2's rate limits). Result order matches
// `items`, regardless of completion order.
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function formatSpeed(bytesPerSecond) {
  if (bytesPerSecond >= 1024 * 1024) return `${(bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bytesPerSecond >= 1024) return `${Math.round(bytesPerSecond / 1024)} KB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
}

// Parses a JSON reply, but if the server sent plain text/HTML instead (a
// crash or a platform limit), surfaces its status and message rather than
// the browser's cryptic "string did not match the expected pattern".
async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server error (${res.status}): ${text.replace(/\s+/g, " ").slice(0, 140)}`);
  }
}

// Resizes/compresses an image client-side before upload (up to 2560px on the
// long edge), so a full-res camera JPEG doesn't blow past the serverless
// function's request-body limit. Returns { dataBase64, contentType, filename }.
function prepareImageForUpload(file, { maxDimension = 2560, quality = 0.92, filenamePrefix = "" } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not decode image."));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          const scale = maxDimension / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);

        // Always JPEG: PNG photos blow past the request-size limit. Step the
        // quality down only if the encoded image would exceed ~4MB (Vercel
        // rejects request bodies over 4.5MB).
        const MAX_BASE64_CHARS = 4 * 1024 * 1024;
        let q = quality;
        let dataBase64 = canvas.toDataURL("image/jpeg", q).split(",")[1];
        while (dataBase64.length > MAX_BASE64_CHARS && q > 0.5) {
          q -= 0.07;
          dataBase64 = canvas.toDataURL("image/jpeg", q).split(",")[1];
        }
        if (dataBase64.length > MAX_BASE64_CHARS) {
          reject(new Error("This image is too large to upload. Try a smaller export."));
          return;
        }
        const filename = filenamePrefix + file.name.replace(/\.[^.]+$/, "") + ".jpg";
        resolve({ dataBase64, contentType: "image/jpeg", filename });
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Portfolio thumbnails: resized/compressed client-side, then sent through
// a normal POST to /api/admin/upload. Fine (even desirable — smaller,
// faster-loading) for images that only ever get shown on the public site.
async function uploadImage(file, options) {
  const prepared = await prepareImageForUpload(file, options);
  const res = await adminFetch("/api/admin/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(prepared),
  });
  const data = await readJson(res);
  if (!res.ok || !data.ok) throw new Error(data.error || "Upload failed.");
  return data.url;
}

// PUTs a file to a presigned URL via XHR (not fetch — only XHR exposes
// upload progress across all browsers), reporting bytes sent so far.
function putFileWithProgress(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => onProgress?.(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error("Upload failed."));
    };
    xhr.onerror = () => reject(new Error("Upload failed."));
    xhr.send(file);
  });
}

// Client gallery photos: uploaded at FULL original quality, no resize —
// these are deliverables clients download, not web thumbnails. A normal
// POST can't carry a full-res camera JPEG (serverless functions cap
// request bodies at 4.5MB), so this fetches a short-lived presigned R2 URL
// from /api/admin/gallery-upload-token and PUTs the original file bytes
// straight to R2 from the browser, bypassing that limit entirely.
async function uploadGalleryPhotoFullQuality(file, onProgress) {
  const tokenRes = await adminFetch("/api/admin/gallery-upload-token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, contentType: file.type }),
  });
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.ok) throw new Error(tokenData.error || "Couldn't start upload.");

  await putFileWithProgress(tokenData.uploadUrl, file, onProgress);
  return tokenData.publicUrl;
}

/* ---------- Tabs ---------- */

function initTabs() {
  const tabs = Array.from(document.querySelectorAll(".admin-tab"));
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => {
        t.classList.toggle("is-active", t === tab);
        t.setAttribute("aria-selected", String(t === tab));
      });
      document.querySelectorAll(".admin-panel").forEach((panel) => {
        const isActive = panel.id === `panel-${tab.dataset.tab}`;
        panel.hidden = !isActive;
        panel.classList.toggle("is-active", isActive);
      });
    });
  });
}

function initSignOut() {
  document.getElementById("adminSignOutBtn")?.addEventListener("click", async () => {
    await fetch("/api/admin-logout", { method: "POST" }).catch(() => {});
    window.location.href = "/admin/login.html";
  });
}

/* ---------- Portfolio tab ---------- */

const CATEGORY_LABELS = {
  portraits: "Portraits",
  events: "Events",
  commercial: "Commercial",
  graduation: "Graduation",
  video: "Video Production",
  featured: "Featured",
};

function initPortfolioTab() {
  const form = document.getElementById("portfolioForm");
  const submitBtn = document.getElementById("pfSubmitBtn");
  const statusEl = document.getElementById("pfStatus");
  const grid = document.getElementById("portfolioItemGrid");
  const emptyEl = document.getElementById("portfolioEmpty");

  async function loadItems() {
    const res = await adminFetch("/api/admin/portfolio");
    const data = await res.json();
    if (!res.ok || !data.ok) return;
    renderItems(data.items);
  }

  function renderItems(items) {
    grid.querySelectorAll(".admin-item-card").forEach((el) => el.remove());
    emptyEl.hidden = items.length !== 0;

    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "admin-item-card";
      card.innerHTML = `
        <img src="${item.imageUrl}" alt="${item.alt || item.title}" class="admin-item-thumb">
        <div class="admin-item-body">
          <span class="admin-item-tag">${CATEGORY_LABELS[item.category] || item.category}</span>
          <h3 class="admin-item-title"></h3>
          <div class="admin-item-actions">
            <button type="button" class="text-link admin-edit-btn">Edit</button>
            <button type="button" class="text-link admin-delete-btn">Delete</button>
          </div>
          <form class="admin-edit-form" hidden>
            <input type="text" name="title" placeholder="Title">
            <select name="category">
              ${Object.entries(CATEGORY_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join("")}
            </select>
            <input type="text" name="alt" placeholder="Alt text">
            <input type="text" name="href" placeholder="Link">
            <div class="admin-edit-form-actions">
              <button type="submit" class="btn btn--outline btn--sm">Save</button>
              <p class="form-status admin-edit-status" role="status"></p>
            </div>
          </form>
        </div>
      `;
      card.querySelector(".admin-item-title").textContent = item.title;

      const editForm = card.querySelector(".admin-edit-form");
      editForm.title.value = item.title;
      editForm.category.value = item.category;
      editForm.alt.value = item.alt || "";
      editForm.href.value = item.href || "";

      card.querySelector(".admin-edit-btn").addEventListener("click", () => {
        editForm.hidden = !editForm.hidden;
      });

      card.querySelector(".admin-delete-btn").addEventListener("click", async () => {
        if (!confirm(`Delete "${item.title}"?`)) return;
        const res = await adminFetch(`/api/admin/portfolio?id=${encodeURIComponent(item.id)}`, { method: "DELETE" });
        const data = await res.json();
        if (res.ok && data.ok) loadItems();
        else alert(data.error || "Delete failed.");
      });

      editForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const statusEl2 = editForm.querySelector(".admin-edit-status");
        setStatus(statusEl2, "Saving…", null);
        const res = await adminFetch("/api/admin/portfolio", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: item.id,
            title: editForm.title.value,
            category: editForm.category.value,
            alt: editForm.alt.value,
            href: editForm.href.value,
          }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          setStatus(statusEl2, "Saved.", "success");
          loadItems();
        } else {
          setStatus(statusEl2, data.error || "Save failed.", "error");
        }
      });

      grid.insertBefore(card, emptyEl);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(statusEl, "", null);

    const title = form.title.value.trim();
    const category = form.category.value;
    const file = form.image.files[0];
    const alt = form.alt.value.trim();
    const href = form.href.value.trim();

    if (!title || !category || !file) {
      setStatus(statusEl, "Title, category, and an image are required.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Uploading…";

    try {
      const imageUrl = await uploadImage(file);
      const res = await adminFetch("/api/admin/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, category, imageUrl, alt, href }),
      });
      const data = await readJson(res);
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not save item.");

      form.reset();
      setStatus(statusEl, "Added.", "success");
      loadItems();
    } catch (err) {
      setStatus(statusEl, err.message || "Something went wrong.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Add Item";
    }
  });

  loadItems();
}

/* ---------- Client galleries tab ---------- */

function initGalleriesTab() {
  const form = document.getElementById("galleryForm");
  const submitBtn = document.getElementById("galSubmitBtn");
  const statusEl = document.getElementById("galStatus");
  const list = document.getElementById("galleryList");
  const emptyEl = document.getElementById("galleriesEmpty");

  // Suggest a slug from the client name, but let the admin override it.
  let slugTouched = false;
  form.slug.addEventListener("input", () => { slugTouched = true; });
  form.clientName.addEventListener("input", () => {
    if (slugTouched) return;
    form.slug.value = form.clientName.value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  });

  async function loadGalleries() {
    const res = await adminFetch("/api/admin/galleries");
    const data = await res.json();
    if (!res.ok || !data.ok) return;
    renderGalleries(data.galleries);
  }

  function renderGalleries(galleries) {
    list.querySelectorAll(".admin-gallery-card").forEach((el) => el.remove());
    emptyEl.hidden = galleries.length !== 0;

    galleries.forEach((gallery) => {
      const card = document.createElement("div");
      card.className = "admin-gallery-card";
      card.innerHTML = `
        <div class="admin-gallery-header">
          <div>
            <h3></h3>
            <span class="admin-gallery-slug"></span>
          </div>
          <div class="admin-gallery-header-actions">
            <label class="admin-checkbox-label">
              <input type="checkbox" class="admin-download-toggle">
              Downloads
            </label>
            <button type="button" class="text-link admin-delete-gallery-btn">Delete</button>
          </div>
        </div>

        <form class="admin-inline-form admin-password-form">
          <input type="text" name="password" placeholder="Set new password">
          <button type="submit" class="btn btn--outline btn--sm">Update</button>
          <p class="form-status admin-password-status" role="status"></p>
        </form>

        <div class="admin-fav-bar" hidden>
          <span class="admin-fav-summary"></span>
          <label class="admin-checkbox-label">
            <input type="checkbox" class="admin-fav-only">
            Favourites only
          </label>
          <button type="button" class="btn btn--outline btn--sm admin-fav-copy">Copy favourites list</button>
          <p class="form-status admin-fav-status" role="status"></p>
        </div>

        <div class="admin-photo-grid"></div>

        <form class="admin-inline-form admin-add-photo-form">
          <input type="file" name="photo" accept="image/png,image/jpeg,image/webp" multiple>
          <button type="submit" class="btn btn--outline btn--sm">Add Photo(s)</button>
          <button type="button" class="btn btn--outline btn--sm admin-retry-failed-btn" hidden>Retry failed</button>
          <p class="form-status admin-photo-status" role="status"></p>
        </form>
        <div class="admin-progress" hidden role="progressbar" aria-valuemin="0" aria-valuemax="100">
          <div class="admin-progress-row">
            <div class="admin-progress-track"><div class="admin-progress-fill"></div></div>
            <span class="admin-progress-pct">0%</span>
          </div>
          <p class="admin-progress-label"></p>
        </div>
      `;

      card.querySelector("h3").textContent = gallery.clientName;
      const likedSrcs = new Set(gallery.likes || []);
      card.querySelector(".admin-gallery-slug").textContent =
        `/${gallery.slug} · ${gallery.photos.length} photo${gallery.photos.length === 1 ? "" : "s"}` +
        (likedSrcs.size ? ` · ♥ ${likedSrcs.size} favourite${likedSrcs.size === 1 ? "" : "s"}` : "");

      const downloadToggle = card.querySelector(".admin-download-toggle");
      downloadToggle.checked = gallery.downloadEnabled;
      downloadToggle.addEventListener("change", async () => {
        await adminFetch("/api/admin/galleries", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: gallery.slug, downloadEnabled: downloadToggle.checked }),
        });
      });

      card.querySelector(".admin-delete-gallery-btn").addEventListener("click", async () => {
        if (!confirm(`Delete the gallery for "${gallery.clientName}"? This cannot be undone.`)) return;
        const res = await adminFetch(`/api/admin/galleries?slug=${encodeURIComponent(gallery.slug)}`, { method: "DELETE" });
        const data = await res.json();
        if (res.ok && data.ok) loadGalleries();
        else alert(data.error || "Delete failed.");
      });

      const pwForm = card.querySelector(".admin-password-form");
      pwForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const statusEl2 = pwForm.querySelector(".admin-password-status");
        const newPassword = pwForm.password.value.trim();
        if (!newPassword) return;
        setStatus(statusEl2, "Saving…", null);
        const res = await adminFetch("/api/admin/galleries", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ slug: gallery.slug, password: newPassword }),
        });
        const data = await res.json();
        if (res.ok && data.ok) {
          pwForm.reset();
          setStatus(statusEl2, "Password updated.", "success");
        } else {
          setStatus(statusEl2, data.error || "Failed.", "error");
        }
      });

      const photoGrid = card.querySelector(".admin-photo-grid");
      const photoName = (photo) => photo.name || decodeURIComponent(photo.src.split("?")[0].split("/").pop() || "photo");

      const favBar = card.querySelector(".admin-fav-bar");
      if (likedSrcs.size) {
        favBar.hidden = false;
        favBar.querySelector(".admin-fav-summary").textContent =
          `${likedSrcs.size} of ${gallery.photos.length} photos favourited by the client`;
        favBar.querySelector(".admin-fav-only").addEventListener("change", (event) => {
          photoGrid.querySelectorAll(".admin-photo-thumb").forEach((el) => {
            el.hidden = event.target.checked && !el.classList.contains("is-liked");
          });
        });
        favBar.querySelector(".admin-fav-copy").addEventListener("click", async () => {
          const statusEl3 = favBar.querySelector(".admin-fav-status");
          const names = gallery.photos.filter((p) => likedSrcs.has(p.src)).map(photoName);
          try {
            await navigator.clipboard.writeText(names.join("\n"));
            setStatus(statusEl3, `Copied ${names.length} file name${names.length === 1 ? "" : "s"}.`, "success");
          } catch {
            setStatus(statusEl3, "Couldn't copy — your browser blocked clipboard access.", "error");
          }
        });
      }

      gallery.photos.forEach((photo) => {
        const thumb = document.createElement("div");
        thumb.className = "admin-photo-thumb" + (likedSrcs.has(photo.src) ? " is-liked" : "");
        thumb.title = photoName(photo);
        thumb.innerHTML = `<img src="${photo.thumb || photo.src}" alt="${photo.alt || ""}"><span class="admin-photo-like" aria-label="Favourited by the client">♥</span><button type="button" class="admin-photo-remove" aria-label="Remove photo">×</button>`;
        thumb.querySelector(".admin-photo-remove").addEventListener("click", async () => {
          if (!confirm("Remove this photo from the gallery?")) return;
          const nextPhotos = gallery.photos.filter((p) => p.src !== photo.src);
          const res = await adminFetch("/api/admin/galleries", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ slug: gallery.slug, photos: nextPhotos }),
          });
          const data = await res.json();
          if (res.ok && data.ok) loadGalleries();
          else alert(data.error || "Failed.");
        });
        photoGrid.appendChild(thumb);
      });

      const UPLOAD_CONCURRENCY = 5;
      const addPhotoForm = card.querySelector(".admin-add-photo-form");
      const submitBtn2 = addPhotoForm.querySelector("button[type=submit]");
      const retryBtn = addPhotoForm.querySelector(".admin-retry-failed-btn");
      const progressWrap = card.querySelector(".admin-progress");
      const progressFill = card.querySelector(".admin-progress-fill");
      const progressPct = card.querySelector(".admin-progress-pct");
      const progressLabel = card.querySelector(".admin-progress-label");
      const statusEl2 = addPhotoForm.querySelector(".admin-photo-status");
      let lastFailedFiles = [];
      // Refreshing the list rebuilds this whole card, so a refresh already
      // scheduled from a first attempt has to be cancelled if "Retry failed"
      // starts a new upload before it fires — otherwise it would yank the
      // card (and this upload's progress bar) out from under itself mid-way.
      let refreshTimer = null;

      async function uploadFiles(files) {
        if (!files.length) return;

        setStatus(statusEl2, "", null);
        submitBtn2.disabled = true;
        retryBtn.hidden = true;
        clearTimeout(refreshTimer);

        // Bytes sent per file, kept in sync as each file's XHR reports
        // progress, so the bar reflects the whole batch, not just one file.
        const sentPerFile = new Array(files.length).fill(0);
        const totalBytes = files.reduce((sum, f) => sum + f.size, 0) || 1;
        const failedFiles = [];
        let completed = 0;
        // Photos are saved to the gallery as each one finishes, not all in one
        // request at the end — chained so two photos finishing close together
        // never race each other overwriting the gallery's photo list, and a
        // late failure can't lose photos that already succeeded.
        let saveChain = Promise.resolve(gallery.photos.slice());

        progressWrap.hidden = false;
        progressWrap.setAttribute("aria-valuenow", "0");
        progressFill.style.width = "0%";
        progressPct.textContent = "0%";
        progressLabel.textContent = `0 of ${files.length} photos uploaded`;

        let lastSampleAt = performance.now();
        let lastSampleBytes = 0;
        let speedLabel = "";
        const speedTimer = setInterval(() => {
          const now = performance.now();
          const bytes = sentPerFile.reduce((a, b) => a + b, 0);
          const elapsed = (now - lastSampleAt) / 1000;
          const bps = elapsed > 0 ? (bytes - lastSampleBytes) / elapsed : 0;
          speedLabel = bps > 512 ? ` · ${formatSpeed(bps)}` : "";
          lastSampleAt = now;
          lastSampleBytes = bytes;
          updateProgress();
        }, 500);

        function updateProgress() {
          const sent = sentPerFile.reduce((a, b) => a + b, 0);
          const pct = Math.min(100, Math.round((sent / totalBytes) * 100));
          progressFill.style.width = `${pct}%`;
          progressPct.textContent = `${pct}%`;
          progressWrap.setAttribute("aria-valuenow", String(pct));
          progressLabel.textContent = `${completed} of ${files.length} photo${files.length === 1 ? "" : "s"} uploaded${speedLabel}`;
        }

        await mapWithConcurrency(files, UPLOAD_CONCURRENCY, async (file, i) => {
          let url;
          try {
            url = await uploadGalleryPhotoFullQuality(file, (loaded) => {
              sentPerFile[i] = loaded;
              updateProgress();
            });
          } catch (err) {
            if (err instanceof SessionExpiredError) return; // already redirecting to login
            sentPerFile[i] = file.size; // count it "done" for the bar even though it failed
            failedFiles.push(file);
            console.error(`Upload failed for ${file.name}:`, err);
            updateProgress();
            return;
          }
          // A small preview for the client's grid; the download button still
          // serves the untouched original. If the preview fails, the photo
          // still works (the grid just falls back to the original).
          let thumb;
          try {
            thumb = await uploadImage(file, { maxDimension: 1200, quality: 0.8, filenamePrefix: "preview-" });
          } catch (err) {
            console.warn("Preview upload failed for", file.name, err);
          }
          sentPerFile[i] = file.size;
          const photo = { src: url, thumb, name: file.name, alt: `${gallery.clientName} — photo` };

          saveChain = saveChain.then(async (currentPhotos) => {
            try {
              const updated = [...currentPhotos, photo];
              const res = await adminFetch("/api/admin/galleries", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ slug: gallery.slug, photos: updated }),
              });
              const data = await res.json();
              if (!res.ok || !data.ok) throw new Error(data.error || "Couldn't save this photo.");
              completed++;
              updateProgress();
              // Keep the shared gallery object in sync — a retry or a second
              // "Add Photo(s)" submit before the list refreshes starts a new
              // saveChain from gallery.photos, which would otherwise still be
              // the count from before this batch and overwrite these saves.
              gallery.photos = updated;
              return updated;
            } catch (err) {
              if (err instanceof SessionExpiredError) return currentPhotos; // already redirecting to login
              failedFiles.push(file);
              console.error(`Couldn't save ${file.name}:`, err);
              updateProgress();
              return currentPhotos; // keep the chain alive for the rest of the batch
            }
          });
          await saveChain;
        });

        clearInterval(speedTimer);
        updateProgress();
        submitBtn2.disabled = false;
        lastFailedFiles = failedFiles;

        if (!failedFiles.length) {
          setStatus(statusEl2, `Added ${completed} photo${completed === 1 ? "" : "s"}.`, "success");
          addPhotoForm.reset();
        } else {
          const names = failedFiles.map((f) => f.name).join(", ");
          setStatus(statusEl2, `Added ${completed} of ${files.length} — failed: ${names}.`, "error");
          retryBtn.hidden = false;
          retryBtn.textContent = `Retry ${failedFiles.length} failed`;
        }
        // Give the admin a moment to read the result before the card
        // re-renders (loadGalleries rebuilds the whole list, which would
        // otherwise wipe this message and the progress bar instantly). A
        // pending "Retry failed" click cancels this first (see above).
        refreshTimer = setTimeout(loadGalleries, failedFiles.length ? 8000 : 1500);
      }

      addPhotoForm.addEventListener("submit", (event) => {
        event.preventDefault();
        uploadFiles(Array.from(addPhotoForm.photo.files || []));
      });

      retryBtn.addEventListener("click", () => uploadFiles(lastFailedFiles));

      list.insertBefore(card, emptyEl);
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(statusEl, "", null);

    const clientName = form.clientName.value.trim();
    const slug = form.slug.value.trim().toLowerCase();
    const password = form.password.value;
    const downloadEnabled = form.downloadEnabled.checked;

    if (!clientName || !slug || !password) {
      setStatus(statusEl, "Client name, gallery code, and password are required.", "error");
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Creating…";

    try {
      const res = await adminFetch("/api/admin/galleries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientName, slug, password, downloadEnabled }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Could not create gallery.");

      form.reset();
      slugTouched = false;
      setStatus(statusEl, "Gallery created.", "success");
      loadGalleries();
    } catch (err) {
      setStatus(statusEl, err.message || "Something went wrong.", "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create Gallery";
    }
  });

  loadGalleries();
}
