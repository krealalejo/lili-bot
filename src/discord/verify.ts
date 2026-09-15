import { webcrypto } from 'node:crypto';

const ED25519 = { name: 'Ed25519' } as const;

/**
 * Importing the key costs a few milliseconds, and the public key never changes for the
 * lifetime of the process, so it is cached. Matters because every request pays this.
 */
const keyCache = new Map<string, Promise<CryptoKey>>();

function encodeUtf8(text: string): Uint8Array<ArrayBuffer> {
  const encoded = new TextEncoder().encode(text);
  const copy = new Uint8Array(new ArrayBuffer(encoded.byteLength));
  copy.set(encoded);

  return copy;
}

function hexToBytes(hex: string): Uint8Array<ArrayBuffer> | null {
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    return null;
  }

  const bytes = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  return bytes;
}

function importKey(publicKeyHex: string): Promise<CryptoKey> {
  const cached = keyCache.get(publicKeyHex);
  if (cached !== undefined) {
    return cached;
  }

  const bytes = hexToBytes(publicKeyHex);
  const imported =
    bytes === null
      ? Promise.reject(new Error('DISCORD_PUBLIC_KEY is not valid hex'))
      : webcrypto.subtle.importKey('raw', bytes, ED25519, false, ['verify']);

  // Cache the promise, not the result, so concurrent requests share one import.
  keyCache.set(publicKeyHex, imported);
  imported.catch(() => keyCache.delete(publicKeyHex));

  return imported;
}

/**
 * Discord signs `timestamp + rawBody` with Ed25519. The body must be the bytes exactly as
 * received — reserialising parsed JSON changes them and the signature stops matching.
 *
 * This is the only thing standing between the public Cloud Run URL and the bot, so it runs
 * before anything else looks at the payload.
 */
export async function isSignatureValid(args: {
  publicKeyHex: string;
  signatureHex: string | undefined;
  timestamp: string | undefined;
  rawBody: string;
}): Promise<boolean> {
  const { publicKeyHex, signatureHex, timestamp, rawBody } = args;

  if (signatureHex === undefined || timestamp === undefined) {
    return false;
  }

  const signature = hexToBytes(signatureHex);
  if (signature === null) {
    return false;
  }

  try {
    const key = await importKey(publicKeyHex);
    const message = encodeUtf8(timestamp + rawBody);

    return await webcrypto.subtle.verify(ED25519, key, signature, message);
  } catch {
    return false;
  }
}
