import { useEffect } from "react";

// Scroll reveal: every [data-reveal] on the page rises into place when it enters the viewport.
// Content is visible by default -- the hidden start state only applies under html.js (set in main.jsx),
// and reduced-motion users get the end state at once (see index.css).
export default function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll("[data-reveal]:not(.is-in)");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-in"); io.unobserve(e.target); }
      }),
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}
