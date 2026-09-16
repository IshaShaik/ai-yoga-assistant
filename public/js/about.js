document.addEventListener("DOMContentLoaded", () => {
  // Page reveal safety indicator
  document.documentElement.classList.add("js-active");

  // Dynamic Year
  const currentYear = document.getElementById("currentYear");
  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }

  // Mobile Navigation
  const mobileNavToggle = document.getElementById("mobileNavToggle");
  const siteNav = document.getElementById("siteNav");

  if (mobileNavToggle && siteNav) {
    mobileNavToggle.addEventListener("click", () => {
      const isOpen = siteNav.classList.toggle("open");
      mobileNavToggle.setAttribute("aria-expanded", String(isOpen));
      mobileNavToggle.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
    });

    siteNav.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        siteNav.classList.remove("open");
        mobileNavToggle.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("click", event => {
      if (!siteNav.contains(event.target) && !mobileNavToggle.contains(event.target) && siteNav.classList.contains("open")) {
        siteNav.classList.remove("open");
        mobileNavToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // Reveal Animations
  const revealElements = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    revealElements.forEach(el => observer.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add("visible"));
  }

  // Smooth Scroll
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener("click", event => {
      const targetId = link.getAttribute("href");
      if (!targetId || targetId === "#") return;
      const target = document.querySelector(targetId);
      if (target) {
        event.preventDefault();
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  });
});