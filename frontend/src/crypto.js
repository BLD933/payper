// Client-side content crypto for PayPer (serverless, on-chain delivery).
// Content is AES-256-GCM encrypted with a key derived from its on-chain
// contentHash. The ciphertext is stored in the contract's `uri` field, so
// delivery is 100% on-chain — no off-chain server. Decryption is gated on
// the contract's hasAccess(id, buyer): a non-payer can read the ciphertext
// but the app refuses to decrypt without a confirmed payment.
import { ethers } from "ethers";

// derive a 256-bit key from the contentHash (0x-prefixed keccak256 hex)
async function keyFromHash(contentHash) {
  const bytes = ethers.getBytes(contentHash); // 32 bytes
  return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["decrypt", "encrypt"]);
}

// encrypt plaintext -> base64 ciphertext string
export async function encryptContent(plaintext, contentHash) {
  const key = await keyFromHash(contentHash);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext)
  );
  // prepend iv (12 bytes) to ciphertext, then base64
  const buf = new Uint8Array(12 + ct.byteLength);
  buf.set(iv, 0);
  buf.set(new Uint8Array(ct), 12);
  return btoa(String.fromCharCode(...buf));
}

// decrypt base64 ciphertext -> plaintext (only call after hasAccess is true)
export async function decryptContent(b64, contentHash) {
  const key = await keyFromHash(contentHash);
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const iv = raw.slice(0, 12);
  const ct = raw.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
  return new TextDecoder().decode(pt);
}
