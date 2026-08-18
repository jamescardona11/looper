import { test, type Page, type TestInfo } from "@playwright/test";

export async function stepWithShot(
  page: Page,
  testInfo: TestInfo,
  name: string,
  action: () => Promise<void>,
) {
  await test.step(name, async () => {
    await testInfo.attach(`${name}-before`, {
      body: await page.screenshot({ animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });

    await action();

    await testInfo.attach(`${name}-after`, {
      body: await page.screenshot({ animations: "disabled", caret: "hide" }),
      contentType: "image/png",
    });
  });
}
