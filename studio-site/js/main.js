// ==========================================================
// STUDIO — base template interactions
// Hero slideshow, live clock, mobile menu
// ==========================================================

document.addEventListener("DOMContentLoaded", () => {
  initMobileMenu();
  initHeroSlideshow();
  initClock();
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
  const dots = Array.from(document.querySelectorAll(".hero-dot"));
  const prevBtn = document.getElementById("prevSlide");
  const nextBtn = document.getElementById("nextSlide");
  const titleEl = document.getElementById("heroTitle");
  const linkEl = document.getElementById("heroLink");
  const counterEl = document.querySelector(".counter-current");
  if (!slides.length) return;

  // Content per slide — swap in your real copy/links here,
  // or generate this array server-side from your CMS data.
  const slideContent = [
    { title: "Portraits", href: "portfolio.html#portraits" },
    { title: "Events", href: "portfolio.html#events" },
  ];

  const romanNumerals = ["I", "II", "III", "IV", "V", "VI"];
  const AUTOPLAY_MS = 6000;
  let current = 0;
  let timer = null;

  function render(index) {
    slides.forEach((s, i) => s.classList.toggle("is-active", i === index));
    dots.forEach((d, i) => d.classList.toggle("is-active", i === index));

    const content = slideContent[index];
    if (content) {
      titleEl.textContent = content.title;
      linkEl.href = content.href;
      linkEl.querySelector("span").textContent = "Explore Projects";
    }
    counterEl.textContent = romanNumerals[index] || index + 1;
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

  prevBtn?.addEventListener("click", () => goTo(current - 1));
  nextBtn?.addEventListener("click", () => goTo(current + 1));
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

/* ---------- Live clock ---------- */
function initClock({ timeZone = "Africa/Lagos", label = "LAGOS" } = {}) {
  const el = document.getElementById("heroClock");
  if (!el) return;

  function tick() {
    const time = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(new Date());
    el.textContent = `${time} · ${label}`;
  }

  tick();
  setInterval(tick, 1000);
}
