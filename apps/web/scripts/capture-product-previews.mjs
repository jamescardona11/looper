import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";
import { chromium } from "@playwright/test";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoDir = path.resolve(appDir, "../..");
const outputDir = path.join(appDir, "product-preview/out");
const locale = process.env.LOOPER_PREVIEW_LOCALE === "es" ? "es" : "en";
const browserLocale = locale === "es" ? "es-ES" : "en-US";
const rawDir = path.join(outputDir, "raw", locale);
const browserStatePath = path.join(outputDir, `browser-state-${locale}.json`);
const landingAssetDir = path.join(repoDir, "apps/landing/public");
const productAssetDir = path.join(repoDir, "assets/product");
const port = 4174;
const baseUrl = `http://127.0.0.1:${port}`;

const campaignCopy = {
  en: {
    home: {
      readyText: "Content synced across your Looper devices",
      eyebrow: "LOOPER / WEB",
      title: "Everything you said, ready to use.",
      subtitle: "Dictations, notes and meetings stay synchronized across Looper.",
    },
    meeting: {
      readyText: "Launch review",
      eyebrow: "MEETINGS / WEB",
      title: "Turn meetings into decisions.",
      subtitle: "Review owners, open questions and the transcript without losing context.",
    },
    studio: {
      readyText: "Shape how Looper writes.",
      eyebrow: "STUDIO / WEB",
      title: "Make every word sound like you.",
      subtitle: "Vocabulary, replacements and writing styles stay aligned everywhere.",
    },
    note: {
      readyText: "Launch principles",
      eyebrow: "NOTES / WEB",
      title: "Your notes keep their structure.",
      subtitle: "Open the full document and return to the original source whenever you need it.",
    },
  },
  es: {
    home: {
      readyText: "Contenido sincronizado entre tus dispositivos Looper",
      eyebrow: "LOOPER / WEB",
      title: "Todo lo que dijiste, listo para usar.",
      subtitle: "Dictados, notas y reuniones se mantienen sincronizados en Looper.",
    },
    meeting: {
      readyText: "Revisión de lanzamiento",
      eyebrow: "REUNIONES / WEB",
      title: "Convierte reuniones en decisiones.",
      subtitle: "Revisa responsables, preguntas y la transcripción sin perder el contexto.",
    },
    studio: {
      readyText: "Define cómo escribe Looper.",
      eyebrow: "STUDIO / WEB",
      title: "Haz que cada palabra suene a ti.",
      subtitle: "Vocabulario, reemplazos y estilos de escritura siempre alineados.",
    },
    note: {
      readyText: "Principios del lanzamiento",
      eyebrow: "NOTAS / WEB",
      title: "Tus notas conservan su estructura.",
      subtitle: "Abre el documento completo y vuelve a la fuente original cuando lo necesites.",
    },
  },
}[locale];

const campaigns = [
  {
    id: "home",
    route: "/home",
    ...campaignCopy.home,
    background: "linear-gradient(145deg, #eee8ff 0%, #f8f5ee 55%, #fffefa 100%)",
    frame: "left:54px; top:252px; width:1110px; transform:rotate(-0.7deg);",
  },
  {
    id: "meeting",
    route: "/library",
    ...campaignCopy.meeting,
    background: "linear-gradient(150deg, #f6f2e9 0%, #eeeaff 58%, #ffffff 100%)",
    frame: "left:92px; top:246px; width:1130px; transform:rotate(0.65deg);",
    prepare: async (page) => {
      await page.getByRole("tab", { name: locale === "es" ? /Reuniones/ : /Meetings/ }).click();
      await page.getByText(campaignCopy.meeting.readyText, { exact: true }).first().waitFor();
      await page
        .getByText(locale === "es" ? /abrir la beta privada el viernes/ : /open the private beta on Friday/)
        .first()
        .waitFor({ timeout: 20_000 });
    },
  },
  {
    id: "studio",
    route: "/dictation",
    ...campaignCopy.studio,
    background: "linear-gradient(145deg, #ebe6ff 0%, #f7f3ee 64%, #fffefa 100%)",
    frame: "left:64px; top:250px; width:1128px; transform:rotate(-0.35deg);",
  },
  {
    id: "note",
    route: "/library",
    ...campaignCopy.note,
    background: "linear-gradient(150deg, #faf7f0 0%, #eee9ff 62%, #ffffff 100%)",
    frame: "left:78px; top:248px; width:1120px; transform:rotate(0.4deg);",
    prepare: async (page) => {
      await page.getByRole("tab", { name: locale === "es" ? /Notas/ : /Notes/ }).click();
      await page.getByRole("button", { name: new RegExp(campaignCopy.note.readyText) }).click();
      await page.getByRole("heading", { name: campaignCopy.note.readyText }).waitFor();
    },
  },
];

async function waitForServer(url, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Web preview server did not start within ${timeoutMs}ms`);
}

function stopServer(server) {
  if (!server.killed) server.kill("SIGTERM");
}

async function ensurePreviewAccount(page) {
  await page.goto(`${baseUrl}/home`, { waitUntil: "domcontentloaded" });
  const skipSetup = page.getByRole("button", {
    name: locale === "es" ? "Omitir configuración" : "Skip setup",
  });
  try {
    await skipSetup.waitFor({ state: "visible", timeout: 8_000 });
    await skipSetup.click();
  } catch {
    // Returning preview accounts have already completed onboarding.
  }

  try {
    await page.waitForFunction(
      () => {
        const status = document.documentElement.dataset.productPreviewStatus;
        return status === "ready" || status === "error";
      },
      undefined,
      { timeout: 45_000 },
    );
  } catch (error) {
    const status = await page.evaluate(
      () => document.documentElement.dataset.productPreviewStatus ?? "not-mounted",
    );
    throw new Error(`Product preview account did not become ready (status: ${status})`, {
      cause: error,
    });
  }
  const status = await page.evaluate(
    () => document.documentElement.dataset.productPreviewStatus ?? "not-mounted",
  );
  if (status === "error") {
    throw new Error("Product preview seeding failed; inspect the browser console above");
  }
}

async function captureRaw(page, campaign) {
  await page.goto(`${baseUrl}${campaign.route}`, { waitUntil: "networkidle" });
  if (campaign.prepare) await campaign.prepare(page);
  await page.getByText(campaign.readyText, { exact: false }).first().waitFor({ timeout: 20_000 });
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation-duration:0s!important;transition-duration:0s!important;caret-color:transparent!important}",
  });
  await page.evaluate(async () => await document.fonts.ready);
  const rawPath = path.join(rawDir, `${campaign.id}.png`);
  await page.screenshot({ path: rawPath, fullPage: false, animations: "disabled" });
  return rawPath;
}

function campaignHtml(campaign, rawImage) {
  const imageData = rawImage.toString("base64");
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      * { box-sizing: border-box; }
      html, body { width: 1200px; height: 750px; margin: 0; overflow: hidden; }
      body {
        position: relative;
        background: ${campaign.background};
        color: #17171a;
        font-family: "Avenir Next", Avenir, Inter, ui-sans-serif, system-ui, -apple-system, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      body::before {
        content: "";
        position: absolute;
        inset: 0;
        background-image: radial-gradient(circle at 20% 10%, rgba(255,255,255,.8), transparent 30%);
        pointer-events: none;
      }
      .copy { position: absolute; z-index: 2; left: 72px; top: 54px; max-width: 930px; }
      .eyebrow { margin: 0 0 18px; color: #6552e8; font-size: 12px; font-weight: 700; letter-spacing: .16em; }
      h1 { margin: 0; max-width: 920px; font-size: 55px; line-height: .98; letter-spacing: -.047em; font-weight: 650; }
      .subtitle { margin: 17px 0 0; max-width: 690px; color: #5e6069; font-size: 18px; line-height: 1.45; letter-spacing: -.012em; }
      .window {
        position: absolute;
        z-index: 1;
        ${campaign.frame}
        overflow: hidden;
        border: 1px solid rgba(105, 99, 124, .23);
        border-radius: 23px 23px 0 0;
        background: #fffefa;
        box-shadow: 0 30px 80px rgba(69, 57, 112, .18), 0 4px 12px rgba(69, 57, 112, .08);
        transform-origin: 50% 0;
      }
      .chrome {
        height: 46px;
        display: flex;
        align-items: center;
        border-bottom: 1px solid #dedbd4;
        background: rgba(255, 254, 250, .96);
        padding: 0 17px;
      }
      .lights { display: flex; gap: 8px; }
      .light { width: 10px; height: 10px; border-radius: 999px; border: 1px solid rgba(0,0,0,.08); }
      .light:nth-child(1) { background: #ff6258; }
      .light:nth-child(2) { background: #ffbd2e; }
      .light:nth-child(3) { background: #27c840; }
      .address {
        position: absolute;
        left: 50%;
        transform: translateX(-50%);
        color: #77777d;
        font-size: 11px;
        letter-spacing: .01em;
      }
      .product { display: block; width: 100%; height: auto; }
      .mark {
        position: absolute;
        z-index: 2;
        right: 28px;
        bottom: 24px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: rgba(43, 41, 49, .54);
        font-size: 11px;
        font-weight: 650;
        letter-spacing: .08em;
      }
      .glyph { width: 19px; height: 19px; border-radius: 6px 6px 6px 2px; background: #6552e8; }
    </style>
  </head>
  <body>
    <div class="copy">
      <p class="eyebrow">${campaign.eyebrow}</p>
      <h1>${campaign.title}</h1>
      <p class="subtitle">${campaign.subtitle}</p>
    </div>
    <div class="window">
      <div class="chrome">
        <div class="lights"><i class="light"></i><i class="light"></i><i class="light"></i></div>
        <span class="address">app.looper.ai</span>
      </div>
      <img class="product" src="data:image/png;base64,${imageData}" alt="" />
    </div>
    <div class="mark"><span class="glyph"></span> LOOPER</div>
  </body>
</html>`;
}

async function composeCampaign(browser, campaign, rawPath) {
  const rawImage = await readFile(rawPath);
  const context = await browser.newContext({
    viewport: { width: 1200, height: 750 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await page.setContent(campaignHtml(campaign, rawImage), { waitUntil: "load" });
  await page.evaluate(async () => await document.fonts.ready);
  const filename = `looper-web-${campaign.id}-campaign-${locale}.png`;
  const landingPath = path.join(landingAssetDir, filename);
  await page.screenshot({ path: landingPath });
  await writeFile(path.join(productAssetDir, filename), await readFile(landingPath));
  await context.close();
  return landingPath;
}

async function createCaptureContext(browser, useSavedState) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    colorScheme: "light",
    locale: browserLocale,
    ...(useSavedState && existsSync(browserStatePath)
      ? { storageState: browserStatePath }
      : {}),
  });
  await context.addInitScript((selectedLocale) => {
    localStorage.setItem("locale", selectedLocale);
    localStorage.setItem("looper-theme", "light");
    localStorage.setItem("cookie-consent", "declined");
  }, locale);
  return context;
}

function reportBrowserErrors(page) {
  page.on("console", (message) => {
    if (message.type() === "error") process.stderr.write(`[browser] ${message.text()}\n`);
  });
  page.on("pageerror", (error) => process.stderr.write(`[browser] ${error.message}\n`));
}

await mkdir(rawDir, { recursive: true });
await mkdir(productAssetDir, { recursive: true });

const server = spawn(
  "pnpm",
  ["dev", "--host", "127.0.0.1", "--port", String(port), "--strictPort", "--mode", "production"],
  {
    cwd: appDir,
    env: { ...process.env, VITE_PRODUCT_PREVIEW: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);

let browser;
try {
  await waitForServer(baseUrl);
  browser = await chromium.launch({ headless: true });
  let context = await createCaptureContext(browser, true);
  let page = await context.newPage();
  reportBrowserErrors(page);
  try {
    await ensurePreviewAccount(page);
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("waiting-for-auth")) throw error;
    await context.close();
    context = await createCaptureContext(browser, false);
    page = await context.newPage();
    reportBrowserErrors(page);
    await ensurePreviewAccount(page);
  }

  const outputPaths = [];
  for (const campaign of campaigns) {
    const rawPath = await captureRaw(page, campaign);
    outputPaths.push(await composeCampaign(browser, campaign, rawPath));
  }

  await context.storageState({ path: browserStatePath });
  await context.close();
  process.stdout.write(`${outputPaths.join("\n")}\n`);
} finally {
  if (browser) await browser.close();
  stopServer(server);
}
