import "./styles/global.css";

const navToggle = document.querySelector<HTMLButtonElement>(".nav-toggle");
const navLinks = document.querySelector<HTMLElement>(".nav-links");

navToggle?.addEventListener("click", () => {
  const open = navLinks?.classList.toggle("open");
  navToggle.setAttribute("aria-expanded", open ? "true" : "false");
});

document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (e) => {
    const href = (e.currentTarget as HTMLAnchorElement).getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      navLinks?.classList.remove("open");
      navToggle?.setAttribute("aria-expanded", "false");
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
});
