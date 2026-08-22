import { useRef } from "react";
import { containerClass } from "../lib/layout";
import { ctaInkClass } from "./ui/cta";
import { DownloadIcon, WaveformMark } from "./ui/icons";
import { mutedLinkClass } from "./ui/link";

/**
 * Top navigation. Not sticky: the approved design scrolls it away with the page.
 *
 * The desktop artboard shows five links plus a Download button; the mobile
 * artboard shows only a hamburger and never says what is behind it. We render
 * the same five links in a native <details> disclosure so the control works
 * before React hydrates and carries its own aria-expanded. The Download button
 * stays out of the mobile sheet on purpose: the hero CTA is one screen below it.
 */

const NAV_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#features", label: "Features" },
  { href: "#local", label: "Local model" },
  { href: "#roadmap", label: "Roadmap" },
  { href: "#pricing", label: "Pricing" },
];

export function SiteHeader() {
  const menu = useRef<HTMLDetailsElement>(null);

  const closeMenu = () => {
    if (menu.current) {
      menu.current.open = false;
    }
  };

  return (
    <header className="relative border-border border-b">
      {/* Where you are on a page this long. State, not decoration, which is why it
          is the one thing tied to the root scroller instead of to a view timeline.
          Hidden from assistive tech: it repeats the scrollbar, it does not add to it. */}
      <div
        aria-hidden="true"
        className="lp-progress pointer-events-none absolute inset-x-0 bottom-[-1px] h-[2px] origin-left bg-primary"
      />
      <div
        className={`${containerClass} flex items-center justify-between py-3.5 md:h-[68px] md:py-[22px]`}
      >
        <a
          href="#top"
          className="flex items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 md:gap-2.5"
        >
          <WaveformMark size={22} className="size-[19px] text-primary md:size-[22px]" />
          <span className="font-display font-semibold text-[17px] tracking-[-0.04em] md:text-[19px]">
            Looper
          </span>
        </a>

        <nav aria-label="Sections" className="hidden items-center gap-[30px] md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className={`${mutedLinkClass} text-[14px]`}>
              {link.label}
            </a>
          ))}
        </nav>

        <a
          href="#download"
          className={`${ctaInkClass} gap-2 rounded-[10px] px-[18px] py-2.5 text-[14px] max-md:hidden`}
        >
          <DownloadIcon size={15} />
          Download
        </a>

        <details ref={menu} className="md:hidden">
          <summary
            aria-label="Open the section menu"
            className="-mr-2.5 flex size-11 cursor-pointer list-none items-center justify-center rounded-lg focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
          >
            <svg
              aria-hidden="true"
              focusable="false"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="size-[22px]"
            >
              <path d="M4 7h16" />
              <path d="M4 12h16" />
              <path d="M4 17h16" />
            </svg>
          </summary>

          <nav
            aria-label="Sections"
            className="absolute inset-x-0 top-full z-20 flex flex-col border-border border-b bg-background px-5 pb-2 shadow-[0_20px_44px_-22px_rgba(0,0,0,.22)]"
          >
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                className={`${mutedLinkClass} flex min-h-11 items-center border-border border-b text-[15px] last:border-b-0`}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </details>
      </div>
    </header>
  );
}
