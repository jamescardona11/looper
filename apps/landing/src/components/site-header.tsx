import { useRef } from "react";
import { containerClass } from "../lib/layout";
import { desktopDownloadUrl } from "../lib/links";
import { ctaInkClass } from "./ui/cta";
import { LooperMark } from "./ui/icons";
import { mutedLinkClass } from "./ui/link";

/** Sticky section navigation with a native mobile disclosure. */

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
    <header className="sticky top-0 z-20 border-border border-b bg-background/95 backdrop-blur-xl">
      <div className={`${containerClass} flex min-h-[68px] items-center justify-between py-3`}>
        <a
          href="#top"
          className="flex items-center gap-2 rounded-sm focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-4 md:gap-2.5"
        >
          <LooperMark size={24} className="size-[21px] text-primary md:size-6" />
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
          href={desktopDownloadUrl}
          className={`${ctaInkClass} rounded-[10px] px-[18px] py-2.5 text-[14px] max-md:hidden`}
        >
          Download Desktop
        </a>

        <details ref={menu} className="md:hidden">
          <summary
            aria-label="Open the section menu"
            className="-mr-2.5 flex h-11 cursor-pointer list-none items-center justify-center rounded-lg px-2.5 font-medium text-[14px] focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden"
          >
            Menu
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
            <a
              href={desktopDownloadUrl}
              onClick={closeMenu}
              className={`${mutedLinkClass} flex min-h-11 items-center text-[15px]`}
            >
              Download Desktop
            </a>
          </nav>
        </details>
      </div>
    </header>
  );
}
