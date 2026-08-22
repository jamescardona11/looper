import { containerClass } from "../lib/layout";
import { WaveformMark } from "./ui/icons";
import { mutedLinkClass } from "./ui/link";

/*
 * Footer. The waveform mark and the Contact link are desktop only, matching the
 * mobile artboard, which drops both.
 *
 * The links carry py-[13px] with a matching negative margin: that lifts each hit
 * target to 44px for touch without changing the 24px/34px footer rhythm.
 *
 * TODO: #privacy, #terms and #contact are the artboard's own placeholders. They
 * point at nothing until those pages exist.
 */

const FOOTER_LINKS = [
  { href: "#privacy", label: "Privacy", desktopOnly: false },
  { href: "#terms", label: "Terms", desktopOnly: false },
  { href: "#contact", label: "Contact", desktopOnly: true },
];

export function SiteFooter() {
  return (
    <footer className="border-border border-t">
      <div className={`${containerClass} flex items-center justify-between py-6 md:py-[34px]`}>
        <div className="flex items-center gap-2.5">
          <WaveformMark size={18} className="hidden text-ink-muted md:block" />
          <span className="text-[13px] text-muted-foreground md:text-sm">Looper</span>
        </div>

        <nav aria-label="Footer">
          <ul className="flex items-center gap-5 text-[12px] md:gap-[26px] md:text-[13px]">
            {FOOTER_LINKS.map((link) => (
              <li key={link.href} className={link.desktopOnly ? "hidden md:block" : undefined}>
                <a
                  className={`${mutedLinkClass} -my-[13px] inline-flex items-center py-[13px]`}
                  href={link.href}
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
