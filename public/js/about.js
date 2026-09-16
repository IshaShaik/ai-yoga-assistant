document.addEventListener("DOMContentLoaded", () => {
  // Safe activator for reveal animations
  document.documentElement.classList.add("js-active");

  // Dynamic Year
  const currentYear = document.getElementById("currentYear");
  if (currentYear) {
    currentYear.textContent = new Date().getFullYear();
  }

  // Responsive Nav Toggle
  const mobileNavToggle = document.getElementById("mobileNavToggle");
  const siteNav = document.getElementById("siteNav");

  if (mobileNavToggle && siteNav) {
    mobileNavToggle.addEventListener("click", () => {
      const isOpen = siteNav.classList.toggle("open");
      mobileNavToggle.setAttribute("aria-expanded", String(isOpen));
    });

    siteNav.querySelectorAll("a").forEach(link => {
      link.addEventListener("click", () => {
        siteNav.classList.remove("open");
        mobileNavToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  // Reveal on scroll
  const revealElements = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });

    revealElements.forEach(el => observer.observe(el));
  } else {
    revealElements.forEach(el => el.classList.add("visible"));
  }

  // Smooth hash scroll
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener("click", function (e) {
      const targetId = this.getAttribute("href");
      if (targetId && targetId !== "#") {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    });
  });
});