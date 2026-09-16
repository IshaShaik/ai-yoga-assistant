document.addEventListener("DOMContentLoaded", () => {

/* =========================================================
MOBILE NAVIGATION
========================================================= */

const mobileNavToggle =
document.getElementById("mobileNavToggle");

const siteNav =
document.getElementById("siteNav");

if (mobileNavToggle && siteNav) {

```
mobileNavToggle.addEventListener("click", () => {

  const isOpen =
    siteNav.classList.toggle("open");

  mobileNavToggle.setAttribute(
    "aria-expanded",
    String(isOpen)
  );

  mobileNavToggle.setAttribute(
    "aria-label",
    isOpen
      ? "Close navigation"
      : "Open navigation"
  );

});


/* Close menu after clicking a link */

siteNav.querySelectorAll("a").forEach(link => {

  link.addEventListener("click", () => {

    siteNav.classList.remove("open");

    mobileNavToggle.setAttribute(
      "aria-expanded",
      "false"
    );

    mobileNavToggle.setAttribute(
      "aria-label",
      "Open navigation"
    );

  });

});
```

}

/* =========================================================
REVEAL ANIMATIONS
========================================================= */

const revealElements =
document.querySelectorAll(".reveal");

if ("IntersectionObserver" in window) {

```
const observer =
  new IntersectionObserver(
    (entries, obs) => {

      entries.forEach(entry => {

        if (entry.isIntersecting) {

          entry.target.classList.add("visible");

          obs.unobserve(entry.target);

        }

      });

    },
    {
      threshold:0.12
    }
  );


revealElements.forEach(element => {

  observer.observe(element);

});
```

} else {

```
revealElements.forEach(element => {

  element.classList.add("visible");

});
```

}

/* =========================================================
CURRENT YEAR
========================================================= */

const currentYear =
document.getElementById("currentYear");

if (currentYear) {

```
currentYear.textContent =
  new Date().getFullYear();
```

}

/* =========================================================
CLOSE MOBILE MENU WHEN CLICKING OUTSIDE
========================================================= */

document.addEventListener("click", event => {

```
if (!siteNav || !mobileNavToggle) {
  return;
}

const clickedInsideNav =
  siteNav.contains(event.target);

const clickedToggle =
  mobileNavToggle.contains(event.target);


if (
  !clickedInsideNav &&
  !clickedToggle &&
  siteNav.classList.contains("open")
) {

  siteNav.classList.remove("open");

  mobileNavToggle.setAttribute(
    "aria-expanded",
    "false"
  );

  mobileNavToggle.setAttribute(
    "aria-label",
    "Open navigation"
  );

}
```

});

/* =========================================================
ESC KEY CLOSES MOBILE NAV
========================================================= */

document.addEventListener("keydown", event => {

```
if (event.key === "Escape" && siteNav) {

  siteNav.classList.remove("open");

  if (mobileNavToggle) {

    mobileNavToggle.setAttribute(
      "aria-expanded",
      "false"
    );

    mobileNavToggle.setAttribute(
      "aria-label",
      "Open navigation"
    );

  }

}
```

});

/* =========================================================
SMOOTH INTERNAL LINKS
========================================================= */

document.querySelectorAll('a[href^="#"]').forEach(link => {

```
link.addEventListener("click", event => {

  const targetId =
    link.getAttribute("href");

  if (!targetId || targetId === "#") {
    return;
  }

  const target =
    document.querySelector(targetId);

  if (!target) {
    return;
  }

  event.preventDefault();

  target.scrollIntoView({
    behavior:"smooth",
    block:"start"
  });

});
```

});

/* =========================================================
VOICE BUTTON VISUAL STATE

```
 This does not replace your existing voice-command
 implementation in common.js. It only keeps the button
 visually accessible if that system toggles the class.
```

========================================================= */

const voiceButton =
document.getElementById("voiceCmdBtn");

if (voiceButton) {

```
voiceButton.addEventListener("keydown", event => {

  if (event.key === "Enter" ||
      event.key === " ") {

    event.preventDefault();

    voiceButton.click();

  }

});
```

}

/* =========================================================
PAGE READY
========================================================= */

document.documentElement.classList.add(
"about-page-ready"
);

});
