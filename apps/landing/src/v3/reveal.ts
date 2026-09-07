/** A reveal belongs to its DOM node; React's ref cleanup also covers StrictMode. */
export function revealWhenVisible(node: HTMLElement | null) {
  if (!node) return;
  node.dataset.observe = "true";
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        node.dataset.revealed = "true";
        observer.disconnect();
      }
    },
    { threshold: 0.12 },
  );
  observer.observe(node);
  return () => observer.disconnect();
}
