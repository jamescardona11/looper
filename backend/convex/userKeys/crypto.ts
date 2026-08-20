// AES-GCM encryption helpers for BYOK using Web Crypto (available in both
// Convex V8 isolate and Node runtime). Key is derived once per call from
// BYOK_ENCRYPTION_SECRET via PBKDF2 — slow on purpose so a leaked DB blob
// still requires the secret to decrypt.

import { env } from "../env";

const PBKDF2_ITERATIONS = 100_000;
const SALT = "react-monorepo-stack:byok:v1";

function utf8(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(secret: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    utf8(secret) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: utf8(SALT) as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function getSecret(): string {
  const secret = env.BYOK_ENCRYPTION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "BYOK_ENCRYPTION_SECRET is missing or too short on this Convex deployment. " +
        "Configure it with at least 16 characters before using BYOK.",
    );
  }
  return secret;
}

export async function encryptKey(plaintext: string): Promise<{ ciphertext: string; iv: string }> {
  const key = await deriveKey(getSecret());
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    utf8(plaintext) as BufferSource,
  );
  return {
    ciphertext: bytesToBase64(new Uint8Array(ct)),
    iv: bytesToBase64(iv),
  };
}

export async function decryptKey(record: { ciphertext: string; iv: string }): Promise<string> {
  const key = await deriveKey(getSecret());
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(record.iv) as BufferSource },
    key,
    base64ToBytes(record.ciphertext) as BufferSource,
  );
  return new TextDecoder().decode(pt);
}
