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

  function renderItems(list) {
    list.forEach((item) => {
      const link = document.createElement("a");
      link.href = item.href || "#";
      link.className = "gallery-item";
      link.dataset.category = item.category;

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
    const galleryItems = Array.from(document.querySelectorAll(".gallery-item"));
    if (!filterButtons.length || !galleryItems.length) return;

    function applyFilter(filter) {
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
