// ==========================================================
// STUDIO — base template interactions
// Hero slideshow, mobile menu
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initHeroSlideshow();
  document.getElementById("year").textContent = new Date().getFullYear();
});

/* ---------- Mobile menu ---------- */
function initMobileMenu() {
  const toggle = document.getElementById("menuToggle");
  const nav = document.getElementById("mobileNav");
  if (!toggle || !nav) return;

  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
    document.body.style.overflow = isOpen ? "hidden" : "";
  });

  nav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
    });
  });
}

/* ---------- Hero slideshow ---------- */
function initHeroSlideshow() {
  const slides = Array.from(document.querySelectorAll(".hero-slide"));
  const dotsWrap = document.getElementById("heroDots");
  const titleEl = document.getElementById("heroTitle");
  const captionEl = document.querySelector(".hero-caption");
  const linkEl = document.getElementById("heroLink");
  const counterEl = document.querySelector(".counter-current");
  const totalEl = document.querySelector(".counter-total");
  if (!slides.length) return;

  // Each slide carries its own copy via data-title / data-caption / data-href,
  // so adding a photo is just adding another .hero-slide in the HTML.
  const romanNumerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];
  const AUTOPLAY_MS = 6000;
  let current = 0;
  let timer = null;

  if (dotsWrap) dotsWrap.innerHTML = "";
  const dots = slides.map((_, i) => {
    const dot = document.createElement("button");
    dot.className = "hero-dot";
    dot.type = "button";
    dot.setAttribute("role", "tab");
    dot.setAttribute("aria-label", `Go to slide ${i + 1}`);
    dotsWrap?.appendChild(dot);
    return dot;
  });
  if (totalEl) totalEl.textContent = romanNumerals[slides.length - 1] || slides.length;

  function render(index) {
    slides.forEach((s, i) => s.classList.toggle("is-active", i === index));
    dots.forEach((d, i) => d.classList.toggle("is-active", i === index));

    const data = slides[index].dataset;
    if (data.title) titleEl.textContent = data.title;
    if (data.caption && captionEl) captionEl.textContent = data.caption;
    if (data.href) linkEl.href = data.href;
    if (counterEl) counterEl.textContent = romanNumerals[index] || index + 1;
    current = index;
  }

  function goTo(index) {
    const next = (index + slides.length) % slides.length;
    render(next);
    resetAutoplay();
  }

  function resetAutoplay() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => goTo(current + 1), AUTOPLAY_MS);
  }

  dots.forEach((dot, i) => dot.addEventListener("click", () => goTo(i)));

  // Pause autoplay while the tab is hidden
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      clearInterval(timer);
    } else {
      resetAutoplay();
    }
  });

  render(0);
  resetAutoplay();
}

