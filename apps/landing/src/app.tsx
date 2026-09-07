import { ComparisonTable } from "./components/comparison-table";
import { Features } from "./components/features";
import { FinalCta } from "./components/final-cta";
import { Hero } from "./components/hero";
import { HowItWorks } from "./components/how-it-works";
import { LocalModel } from "./components/local-model";
import { PlatformStrip } from "./components/platform-strip";
import { Access } from "./components/access";
import { ProductSurfaces } from "./components/product-surfaces";
import { Roadmap } from "./components/roadmap";
import { ScrollMotionController } from "./components/scroll-motion-controller";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";
import { SmallPrint } from "./components/small-print";
import { useLandingCopy } from "./lib/landing-copy";

/**
 * The launch page, in the order both artboards run it.
 *
 * `<HowItWorks />` is the three beats: speak anywhere, the meeting band that
 * breaks the split rhythm, then the split reversed. It is one import because the
 * design puts nothing between them; the three are exported individually too, so
 * the day something goes between them this fragment can be unpacked.
 *
 * The <main> wrapper is load-bearing beyond semantics: vite.config.ts sets
 * `renderAfterElementExists: "main h1"`, so the prerenderer waits for the hero's
 * <h1> to appear inside a <main> before it snapshots the page. Move the header
 * inside <main>, or drop the wrapper, and the build hangs rather than failing.
 */
export function App() {
  const copy = useLandingCopy();

  return (
    <>
      <a
        href="#main-content"
        className="fixed top-3 left-3 z-30 -translate-y-20 rounded-lg bg-foreground px-4 py-3 text-background focus:translate-y-0"
      >
        {copy.common.skip}
      </a>
      <ScrollMotionController />
      <SiteHeader />
      <main id="main-content">
        <Hero />
        <PlatformStrip />
        <HowItWorks />
        <ProductSurfaces />
        <Features />
        <LocalModel />
        <ComparisonTable />
        <SmallPrint />
        <Roadmap />
        <Access />
        <FinalCta />
      </main>
      <SiteFooter />
    </>
  );
}
