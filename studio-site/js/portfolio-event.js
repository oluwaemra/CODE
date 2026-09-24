// ==========================================================
// Single-event page (portfolio.html's "View All") — every photo in one
// event, read from GET /api/portfolio?event=<slug>, with the same
// masonry grid + full-size viewer as portfolio.html.
// ==========================================================

document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("galleryGrid");
  const loadingEl = document.getElementById("galleryLoading");
  const emptyState = document.getElementById("galleryEmpty");
  const titleEl = document.getElementById("eventTitle");
  if (!grid) return;

  const slug = new URLSearchParams(window.location.search).get("slug");
  if (!slug) {
    showNotFound();
    return;
  }

  let event = null;
  try {
    const res = await fetch(`/api/portfolio?event=${encodeURIComponent(slug)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.event) event = data.event;
    }
  } catch {
    // No backend deployed yet, or a network hiccup — falls through to "not found".
  }

  if (loadingEl) loadingEl.remove();

  if (!event) {
    showNotFound();
    return;
  }

  titleEl.textContent = event.title;
  document.title = `${event.title} — EMRASHOTIT STUDIOS`;

  const items = event.photos.map((photo, i) => ({
    id: `${event.slug}-${i}`,
    imageUrl: photo.src,
    alt: photo.alt || event.title,
    title: event.title,
    href: "#",
  }));

  if (!items.length) {
    showNotFound("No photos in this event yet — check back soon.");
    return;
  }

  renderItems(items);
  initLightbox(items, grid);

  function showNotFound(message) {
    if (loadingEl) loadingEl.remove();
    if (message) emptyState.textContent = message;
    emptyState.hidden = false;
  }

  function renderItems(list) {
    list.forEach((item) => {
      const link = document.createElement("a");
      link.href = item.imageUrl;
      link.className = "gallery-item";
      link.dataset.id = item.id;
      link.setAttribute("aria-label", `View photo full size`);

      const img = document.createElement("img");
      img.src = item.imageUrl;
      img.alt = item.alt;
      img.loading = "lazy";
      link.appendChild(img);

      grid.insertBefore(link, emptyState);
    });
  }
});

// ---------- Full-size viewer ----------
// Same behavior as portfolio.html's: click a tile, arrow keys/buttons or
// swipe to move through the set, Esc/X/backdrop click to close.
function initLightbox(items, grid) {
  if (!items.length) return;
  const byId = new Map(items.map((item) => [item.id, item]));

  const box = document.createElement("div");
  box.className = "lightbox";
  box.hidden = true;
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-modal", "true");
  box.setAttribute("aria-label", "Photo viewer");
  box.innerHTML = `
    <button type="button" class="lightbox-close" aria-label="Close">×</button>
    <button type="button" class="lightbox-nav lightbox-nav--prev" aria-label="Previous photo">‹</button>
    <figure class="lightbox-figure">
      <img class="lightbox-img" alt="">
    </figure>
    <button type="button" class="lightbox-nav lightbox-nav--next" aria-label="Next photo">›</button>
  `;
  document.body.appendChild(box);

  const imgEl = box.querySelector(".lightbox-img");
  const prevBtn = box.querySelector(".lightbox-nav--prev");
  const nextBtn = box.querySelector(".lightbox-nav--next");
  const closeBtn = box.querySelector(".lightbox-close");

  let visibleIds = [];
  let index = 0;
  let lastFocus = null;

  function currentIds() {
    return Array.from(grid.querySelectorAll(".gallery-item:not([hidden])")).map((el) => el.dataset.id);
  }

  function show(i) {
    index = (i + visibleIds.length) % visibleIds.length;
    const item = byId.get(visibleIds[index]);
    if (!item) return;
    imgEl.src = item.imageUrl;
    imgEl.alt = item.alt || "";
    const multiple = visibleIds.length > 1;
    prevBtn.hidden = nextBtn.hidden = !multiple;
  }

  function open(id) {
    visibleIds = currentIds();
    const start = visibleIds.indexOf(id);
    if (start === -1) return;
    lastFocus = document.activeElement;
    box.hidden = false;
    document.body.classList.add("lightbox-open");
    show(start);
    closeBtn.focus();
  }

  function close() {
    box.hidden = true;
    imgEl.removeAttribute("src");
    document.body.classList.remove("lightbox-open");
    if (lastFocus) lastFocus.focus();
  }

  grid.addEventListener("click", (event) => {
    const tile = event.target.closest(".gallery-item");
    if (!tile || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    open(tile.dataset.id);
  });

  prevBtn.addEventListener("click", () => show(index - 1));
  nextBtn.addEventListener("click", () => show(index + 1));
  closeBtn.addEventListener("click", close);
  box.addEventListener("click", (event) => {
    if (event.target === box || event.target.classList.contains("lightbox-figure")) close();
  });

  document.addEventListener("keydown", (event) => {
    if (box.hidden) return;
    if (event.key === "Escape") close();
    else if (event.key === "ArrowLeft") show(index - 1);
    else if (event.key === "ArrowRight") show(index + 1);
  });

  let touchX = null;
  box.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
}
