/**
 * Symmetric encryption for a `.env` file so it can be committed safely.
 *
 * Uses only `node:crypto`:
 *   - **AES-256-GCM** for authenticated encryption (tamper-evident), with a
 *   - random 12-byte IV per encryption, and a
 *   - 32-byte key derived from the passphrase with **scrypt** over a random
 *     16-byte salt.
 *
 * The encrypted file is UTF-8 text (a header comment plus one base64 line) so it
 * diffs and commits cleanly. The base64 payload is:
 *
 * ```
 * salt(16) ‖ iv(12) ‖ authTag(16) ‖ ciphertext(…)
 * ```
 *
 * Decryption re-derives the key from the passphrase and salt and verifies the
 * GCM tag, so a wrong passphrase (or any edit to the ciphertext) fails loudly
 * instead of returning garbage.
 */
import { randomBytes, scryptSync, createCipheriv, createDecipheriv } from "node:crypto";

const MAGIC = "LSENC1:";
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;
const SCRYPT_N = 16384; // CPU/memory cost; ~tens of ms to derive.

const HEADER = [
  "# lacspace-dotenv encrypted env — AES-256-GCM, scrypt KDF. Safe to commit.",
  "# Decrypt with: npx lacspace-dotenv decrypt <file> --key <passphrase>",
].join("\n");

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_LEN, { N: SCRYPT_N });
}

/**
 * Encrypt a `.env` file's text with a passphrase. Returns the full text of the
 * `.env.enc` file (header comment + `LSENC1:` base64 line).
 */
export function encryptEnv(plaintext: string, passphrase: string): string {
  if (!passphrase) throw new Error("a passphrase is required to encrypt");
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const payload = Buffer.concat([salt, iv, tag, ct]).toString("base64");
  return `${HEADER}\n${MAGIC}${payload}\n`;
}

/**
 * Decrypt the text of a `.env.enc` file produced by {@link encryptEnv}. Throws
 * if the passphrase is wrong or the ciphertext was tampered with.
 */
export function decryptEnv(encText: string, passphrase: string): string {
  if (!passphrase) throw new Error("a passphrase is required to decrypt");
  const line = encText.split(/\r?\n/).find((l) => l.startsWith(MAGIC));
  if (!line) throw new Error(`not a lacspace-dotenv encrypted file (missing ${MAGIC} marker)`);
  let raw: Buffer;
  try {
    raw = Buffer.from(line.slice(MAGIC.length).trim(), "base64");
  } catch {
    throw new Error("encrypted payload is not valid base64");
  }
  if (raw.length < SALT_LEN + IV_LEN + TAG_LEN) throw new Error("encrypted payload is truncated");
  const salt = raw.subarray(0, SALT_LEN);
  const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ct = raw.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(passphrase, Buffer.from(salt));
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    throw new Error("decryption failed — wrong passphrase or the file was modified");
  }
}

/** True if `text` looks like a lacspace-dotenv encrypted file. */
export function isEncrypted(text: string): boolean {
  return text.split(/\r?\n/).some((l) => l.startsWith(MAGIC));
}
