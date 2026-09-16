// ==========================================================
// Client Gallery — login + authenticated photo grid
//
// Talks to /api/gallery-login, /api/gallery-photos, /api/gallery-logout.
// Session lives in an httpOnly cookie set by the login endpoint, so this
// script never touches the password after submitting it once.
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
  const loginSection = document.getElementById("galleryLoginSection");
  const viewSection = document.getElementById("galleryViewSection");
  const loginForm = document.getElementById("galleryLoginForm");
  const submitBtn = document.getElementById("gallerySubmitBtn");
  const statusEl = document.getElementById("galleryLoginStatus");
  const signOutBtn = document.getElementById("gallerySignOutBtn");
  const clientNameEl = document.getElementById("galleryClientName");
  const photoGrid = document.getElementById("galleryPhotoGrid");

  if (!loginSection || !viewSection) return;

  function setStatus(message, tone) {
    statusEl.textContent = message;
    statusEl.className = "form-status" + (tone ? ` form-status--${tone}` : "");
  }

  function renderGallery(gallery) {
    clientNameEl.textContent = gallery.clientName;
    photoGrid.innerHTML = "";

    gallery.photos.forEach((photo) => {
      const figure = document.createElement("figure");
      figure.className = "gallery-photo";

      const img = document.createElement("img");
      img.src = photo.src;
      img.alt = photo.alt || "";
      img.loading = "lazy";
      figure.appendChild(img);

      if (gallery.downloadEnabled) {
        const link = document.createElement("a");
        link.href = photo.src;
        link.download = "";
        link.className = "gallery-photo-download";
        link.setAttribute("aria-label", "Download photo");
        link.textContent = "↓";
        figure.appendChild(link);
      }

      photoGrid.appendChild(figure);
    });

    loginSection.hidden = true;
    viewSection.hidden = false;
  }

  async function tryExistingSession() {
    try {
      const res = await fetch("/api/gallery-photos");
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok) renderGallery(data.gallery);
    } catch {
      // No backend deployed yet, or genuinely signed out — stay on the login form.
    }
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus("", null);

    const slug = loginForm.slug.value.trim();
    const password = loginForm.password.value;

    if (!slug || !password) {
      setStatus("Please enter your gallery code and password.", "error");
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
        setStatus(loginData.error || "Sign-in failed.", "error");
        return;
      }

      const photosRes = await fetch("/api/gallery-photos");
      const photosData = await photosRes.json();
      if (!photosRes.ok || !photosData.ok) {
        setStatus("Signed in, but couldn't load photos. Please try again.", "error");
        return;
      }

      loginForm.reset();
      renderGallery(photosData.gallery);
    } catch (err) {
      setStatus("Couldn't reach the server. This page needs a deployed backend to sign in — see the project notes.", "error");
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
    viewSection.hidden = true;
    loginSection.hidden = false;
    setStatus("", null);
  });

  tryExistingSession();
});
