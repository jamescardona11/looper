import { beforeAll, describe, expect, it } from "vitest";

// crypto.ts reads BYOK_ENCRYPTION_SECRET from process.env
beforeAll(() => {
  process.env.BYOK_ENCRYPTION_SECRET = "test-secret-must-be-at-least-16-chars-long";
});

describe("BYOK encryption round-trip", () => {
  it("encrypts and decrypts back to the original plaintext", async () => {
    const { encryptKey, decryptKey } = await import("./crypto");
    const plaintext = "sk-test-1234567890abcdef";

    const { ciphertext, iv } = await encryptKey(plaintext);
    expect(ciphertext).toBeTruthy();
    expect(iv).toBeTruthy();
    expect(ciphertext).not.toBe(plaintext);

    const recovered = await decryptKey({ ciphertext, iv });
    expect(recovered).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", async () => {
    const { encryptKey } = await import("./crypto");
    const plaintext = "sk-test-same-key-twice";

    const a = await encryptKey(plaintext);
    const b = await encryptKey(plaintext);

    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails to decrypt with wrong IV", async () => {
    const { encryptKey, decryptKey } = await import("./crypto");
    const { ciphertext } = await encryptKey("sk-test-wrong-iv");
    const wrongIv = btoa("000000000000");

    await expect(decryptKey({ ciphertext, iv: wrongIv })).rejects.toThrow();
  });
});
