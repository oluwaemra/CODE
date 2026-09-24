// ==========================================================
// Portfolio page — fetches items from /api/portfolio (managed via the
// /admin panel), renders the grid, then wires up category filtering.
//
// Falls back to a small set of placeholder items if the API can't be
// reached (e.g. no backend deployed yet) or hasn't been populated yet,
// so the page never looks broken or empty.
// ==========================================================

const FALLBACK_ITEMS = [
  { id: "fallback-1", title: "Editorial Series 01", category: "portraits", imageUrl: "images/hero-portraits.svg", alt: "Portraits — editorial series", href: "#" },
  { id: "fallback-2", title: "Lagos Live Sessions", category: "events", imageUrl: "images/hero-events.svg", alt: "Events coverage", href: "#" },
  { id: "fallback-3", title: "Class of 2026", category: "graduation", imageUrl: "images/cat-graduation.svg", alt: "Graduation portraits", href: "#" },
  { id: "fallback-4", title: "Studio Collaboration", category: "featured", imageUrl: "images/cat-featured.svg", alt: "Featured project", href: "#" },
];

// Categories with no published work yet — hidden site-wide (not just from
// the filter bar) until there's real content. Remove an entry here — and
// restore its nav link + filter button — once photos exist for it.
const HIDDEN_CATEGORIES = ["commercial", "video"];

const CATEGORY_LABELS = {
  portraits: "Portraits",
  events: "Events",
  commercial: "Commercial",
  graduation: "Graduation",
  video: "Video Production",
  featured: "Featured",
};

document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("galleryGrid");
  const loadingEl = document.getElementById("galleryLoading");
  const emptyState = document.getElementById("galleryEmpty");
  const eventsList = document.getElementById("eventsList");
  const eventsLoadingEl = document.getElementById("eventsLoading");
  const eventsEmptyState = document.getElementById("eventsEmpty");
  const filterButtons = Array.from(document.querySelectorAll(".filter-btn"));
  if (!grid) return;

  let items = FALLBACK_ITEMS;
  try {
    const res = await fetch("/api/portfolio");
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.items) && data.items.length > 0) {
        items = data.items;
      }
    }
  } catch {
    // No backend deployed yet — stick with FALLBACK_ITEMS.
  }

  items = items.filter((item) => !HIDDEN_CATEGORIES.includes(item.category));

  if (loadingEl) loadingEl.remove();
  renderItems(items);
  initFiltering();
  initLightbox(items, grid);
  loadEvents(); // separate + non-blocking — the flat grid above works either way

  // The "Events" filter shows grouped event blocks (name + the admin's
  // featured photos + View All) instead of the flat grid — fetched
  // separately since it's a different shape (events, not flat items).
  async function loadEvents() {
    let events = [];
    try {
      const res = await fetch("/api/portfolio?events=1");
      if (res.ok) {
        const data = await res.json();
        if (data.ok && Array.isArray(data.events)) events = data.events;
      }
    } catch {
      // No backend deployed yet, or nothing published — show the empty state.
    }
    renderEvents(events);
  }

  function renderEvents(events) {
    if (eventsLoadingEl) eventsLoadingEl.remove();
    eventsEmptyState.hidden = events.length !== 0;

    events.forEach((event) => {
      const group = document.createElement("div");
      group.className = "event-group";
      group.innerHTML = `
        <div class="event-group-header">
          <h2 class="event-group-title"></h2>
          ${event.hasMore ? `<a class="text-link event-view-all" href="portfolio-event.html?slug=${encodeURIComponent(event.slug)}">View All →</a>` : ""}
        </div>
        <div class="gallery-grid event-group-grid"></div>
      `;
      group.querySelector(".event-group-title").textContent = event.title;

      const subGrid = group.querySelector(".event-group-grid");
      event.featuredPhotos.forEach((photo, i) => {
        const link = document.createElement("a");
        link.href = photo.src;
        link.className = "gallery-item";
        link.dataset.id = `${event.slug}-${i}`;
        link.setAttribute("aria-label", `View a photo from ${event.title}`);

        const img = document.createElement("img");
        img.src = photo.src;
        img.alt = photo.alt || event.title;
        img.loading = "lazy";
        link.appendChild(img);

        subGrid.appendChild(link);
      });

      eventsList.insertBefore(group, eventsEmptyState);
    });

    const eventItems = events.flatMap((event) =>
      event.featuredPhotos.map((photo, i) => ({
        id: `${event.slug}-${i}`,
        imageUrl: photo.src,
        alt: photo.alt || event.title,
        title: event.title,
        href: "#",
      }))
    );
    initLightbox(eventItems, eventsList);
  }

  function renderItems(list) {
    list.forEach((item) => {
      const link = document.createElement("a");
      link.href = item.imageUrl;
      link.className = "gallery-item";
      link.dataset.category = item.category;
      link.dataset.id = item.id;
      link.setAttribute("aria-label", `View ${item.title} full size`);

      const img = document.createElement("img");
      img.src = item.imageUrl;
      img.alt = item.alt || item.title;
      img.loading = "lazy";
      link.appendChild(img);

      const copy = document.createElement("div");
      copy.className = "gallery-item-copy";
      copy.innerHTML = `
        <span class="gallery-item-tag">${CATEGORY_LABELS[item.category] || item.category}</span>
        <h3></h3>
      `;
      copy.querySelector("h3").textContent = item.title;
      link.appendChild(copy);

      grid.insertBefore(link, emptyState);
    });
  }

  function initFiltering() {
    // Scoped to #galleryGrid specifically — the events section below reuses
    // the same .gallery-item class for its own photo tiles, and those aren't
    // tagged with a category, so an unscoped selector would hide them too.
    const galleryItems = Array.from(grid.querySelectorAll(".gallery-item"));
    // Only filterButtons.length gates this — not also galleryItems.length —
    // so the Events filter still works even on a day with zero flat items.
    if (!filterButtons.length) return;

    function applyFilter(filter) {
      const showEvents = filter === "events";
      grid.hidden = showEvents;
      eventsList.hidden = !showEvents;
      if (showEvents) return;

      let visibleCount = 0;
      galleryItems.forEach((item) => {
        const match = filter === "all" || item.dataset.category === filter;
        item.hidden = !match;
        if (match) visibleCount++;
      });
      if (emptyState) emptyState.hidden = visibleCount !== 0;
    }

    function setActive(activeBtn) {
      filterButtons.forEach((btn) => {
        const isActive = btn === activeBtn;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
      });
    }

    filterButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        setActive(btn);
        applyFilter(btn.dataset.filter);
      });
    });

    // Deep-link support: portfolio.html#events pre-selects a category
    const hash = window.location.hash.replace("#", "");
    const matchingBtn = filterButtons.find((btn) => btn.dataset.filter === hash);
    if (matchingBtn) {
      setActive(matchingBtn);
      applyFilter(hash);
    }
  }
});

// ---------- Full-size viewer ----------
// Click a tile to see the photo at full size over the page. Arrow keys / buttons
// move through whatever the current filter shows; Esc, the X or a click on the
// backdrop closes it.
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
      <figcaption class="lightbox-caption">
        <a class="lightbox-project" hidden>View project →</a>
      </figcaption>
    </figure>
    <button type="button" class="lightbox-nav lightbox-nav--next" aria-label="Next photo">›</button>
  `;
  document.body.appendChild(box);

  const imgEl = box.querySelector(".lightbox-img");
  const projectEl = box.querySelector(".lightbox-project");
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
    imgEl.alt = item.alt || item.title;
    const hasProject = item.href && item.href !== "#";
    projectEl.hidden = !hasProject;
    box.classList.toggle("has-caption", Boolean(hasProject));
    if (hasProject) projectEl.href = item.href;
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

  // Swipe left/right on touch screens
  let touchX = null;
  box.addEventListener("touchstart", (e) => { touchX = e.changedTouches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
  });
}
