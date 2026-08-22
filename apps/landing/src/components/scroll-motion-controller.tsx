import { useMountEffect } from "../lib/use-mount-effect";

const REVEAL_SELECTOR = "[data-reveal]";
const STORY_STEP_SELECTOR = "[data-story-step]";

function revealImmediately(elements: readonly HTMLElement[]) {
  for (const element of elements) {
    element.dataset.revealVisible = "true";
  }
}

/** Connects the static page markup to browser visibility without owning layout. */
export function ScrollMotionController() {
  useMountEffect(() => {
    const revealElements = Array.from(document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR));
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    if (prefersReducedMotion.matches || !("IntersectionObserver" in window)) {
      revealImmediately(revealElements);
      return;
    }

    const revealObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          const element = entry.target as HTMLElement;
          element.dataset.revealVisible = "true";
          revealObserver.unobserve(element);
        }
      },
      { rootMargin: "0px 0px -12%", threshold: 0.12 },
    );

    for (const element of revealElements) {
      const isRendered = element.getClientRects().length > 0;
      const isNearInitialViewport =
        isRendered && element.getBoundingClientRect().top < innerHeight * 0.9;

      if (isNearInitialViewport) {
        element.dataset.revealVisible = "true";
      } else {
        element.dataset.revealReady = "true";
        revealObserver.observe(element);
      }
    }

    const storySteps = Array.from(document.querySelectorAll<HTMLElement>(STORY_STEP_SELECTOR));
    const storyObserver = new IntersectionObserver(
      (entries) => {
        const activeEntry = entries.find((entry) => entry.isIntersecting);

        if (!activeEntry) {
          return;
        }

        const activeStep = activeEntry.target as HTMLElement;
        const story = activeStep.closest<HTMLElement>("[data-scroll-story]");
        const activeIndex = activeStep.dataset.storyStep;

        if (!story || activeIndex === undefined) {
          return;
        }

        story.dataset.storyActive = activeIndex;

        for (const step of story.querySelectorAll<HTMLElement>(STORY_STEP_SELECTOR)) {
          step.dataset.storyActive = String(step === activeStep);
        }
      },
      { rootMargin: "-42% 0px -42%", threshold: 0 },
    );

    for (const step of storySteps) {
      storyObserver.observe(step);
    }

    return () => {
      revealObserver.disconnect();
      storyObserver.disconnect();
    };
  });

  return null;
}
