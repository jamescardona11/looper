import { expect, test } from "@playwright/test";
import { stepWithShot } from "./helpers/step";

const convexReactiveTimeout = 15_000;

test("creates dictation dictionary terms, replacements and styles", async ({ page }, testInfo) => {
  const token = Date.now().toString(36);
  const term = `Atlas E2E ${token}`;
  const source = `src ${token}`;
  const destination = `dest ${token}`;
  const styleName = `Style ${token}`;
  const stylePrompt = `Rewrite with token ${token}.`;

  await stepWithShot(page, testInfo, "open dictation", async () => {
    await page.goto("/dictation");
    await expect(page.getByRole("heading", { name: /dictation/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /dictionary/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /replacements/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /styles/i })).toBeVisible();
  });

  await stepWithShot(page, testInfo, "create dictionary term", async () => {
    const addTerm = page.getByRole("button", { name: /add term/i });
    await expect(addTerm).toBeEnabled({ timeout: convexReactiveTimeout });
    await page.getByLabel(/term/i).fill(term);
    await addTerm.click();
    await expect(
      page.getByRole("listitem", { name: new RegExp(escapeRegExp(term), "i") }),
    ).toBeVisible({ timeout: convexReactiveTimeout });
  });

  await stepWithShot(page, testInfo, "create replacement", async () => {
    await page.getByLabel(/source phrase/i).fill(source);
    await page.getByLabel(/replacement/i).fill(destination);
    await page.getByRole("button", { name: /add replacement/i }).click();
    await expect(
      page.getByRole("listitem", {
        name: new RegExp(`${escapeRegExp(source)}.*${escapeRegExp(destination)}`, "i"),
      }),
    ).toBeVisible({ timeout: convexReactiveTimeout });
  });

  await stepWithShot(page, testInfo, "create style", async () => {
    await page.getByLabel(/style name/i).fill(styleName);
    await page.getByLabel(/style prompt/i).fill(stylePrompt);
    await page.getByRole("button", { name: /add style/i }).click();
    await expect(
      page.getByRole("article", {
        name: new RegExp(`${escapeRegExp(styleName)}.*${escapeRegExp(stylePrompt)}`, "i"),
      }),
    ).toBeVisible({ timeout: convexReactiveTimeout });
  });

  await stepWithShot(page, testInfo, "clean up created records", async () => {
    await page
      .getByRole("button", { name: new RegExp(`remove term.*${escapeRegExp(term)}`, "i") })
      .click();
    await expect(
      page.getByRole("listitem", { name: new RegExp(escapeRegExp(term), "i") }),
    ).toBeHidden({ timeout: convexReactiveTimeout });

    await page
      .getByRole("button", {
        name: new RegExp(`remove replacement.*${escapeRegExp(source)}`, "i"),
      })
      .click();
    await expect(
      page.getByRole("listitem", { name: new RegExp(escapeRegExp(source), "i") }),
    ).toBeHidden({ timeout: convexReactiveTimeout });

    await page
      .getByRole("button", { name: new RegExp(`remove style.*${escapeRegExp(styleName)}`, "i") })
      .click();
    await expect(
      page.getByRole("article", { name: new RegExp(escapeRegExp(styleName), "i") }),
    ).toBeHidden({ timeout: convexReactiveTimeout });
  });
});

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
