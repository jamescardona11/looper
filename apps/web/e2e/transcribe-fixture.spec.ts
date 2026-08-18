import { expect, test } from "@playwright/test";

test("serves the Harvard audio fixture and renders the transcribe page", async ({
  page,
  request,
}) => {
  const fixture = await request.get("/__e2e-audio-fixtures/harvard.wav");
  expect(fixture.ok()).toBe(true);
  expect(fixture.headers()["content-type"]).toContain("audio/wav");
  expect(Number(fixture.headers()["content-length"] ?? "0")).toBeGreaterThan(3_000_000);

  await page.goto("/transcribe?audioFixture=harvard");
  await expect(page.getByRole("heading", { name: /transcribe/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /drop an audio file/i })).toBeVisible();
});
