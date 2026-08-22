import { containerClass } from "../lib/layout";
import { LooperMark } from "./ui/icons";
import { mutedLinkClass } from "./ui/link";

/** Compact footer with only working page or source destinations. */

const FOOTER_LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#local", label: "Local model" },
  { href: "https://github.com/jamescardona11/looper", label: "GitHub" },
];

export function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className={`${containerClass} flex items-center justify-between py-6 md:py-[34px]`}>
        <div className="flex items-center gap-2.5">
          <LooperMark size={18} className="text-primary" />
          <span className="font-medium text-[13px] text-foreground md:text-sm">Looper</span>
        </div>

        <nav aria-label="Footer">
          <ul className="flex items-center gap-5 text-[12px] md:gap-[26px] md:text-[13px]">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href}>
                <a
                  className={`${mutedLinkClass} -my-[13px] inline-flex items-center py-[13px]`}
                  href={link.href}
                  rel={link.href.startsWith("https://") ? "noreferrer" : undefined}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
