import { webcrypto } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';
import { isSignatureValid } from './verify.ts';

const toHex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');

let publicKeyHex: string;
let otherPublicKeyHex: string;
let sign: (message: string) => Promise<string>;

// generateKey is typed as returning a single key for symmetric algorithms, so the pair
// needs an explicit cast for Ed25519.
const generatePair = async (): Promise<webcrypto.CryptoKeyPair> =>
  (await webcrypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as unknown as webcrypto.CryptoKeyPair;

beforeAll(async () => {
  const pair = await generatePair();
  const other = await generatePair();

  publicKeyHex = toHex(await webcrypto.subtle.exportKey('raw', pair.publicKey));
  otherPublicKeyHex = toHex(await webcrypto.subtle.exportKey('raw', other.publicKey));
  sign = async (message) =>
    toHex(
      await webcrypto.subtle.sign(
        { name: 'Ed25519' },
        pair.privateKey,
        new TextEncoder().encode(message),
      ),
    );
});

describe('isSignatureValid', () => {
  const timestamp = '1700000000';
  const rawBody = JSON.stringify({ type: 1 });

  it('accepts a signature Discord would have produced', async () => {
    const signatureHex = await sign(timestamp + rawBody);

    expect(await isSignatureValid({ publicKeyHex, signatureHex, timestamp, rawBody })).toBe(true);
  });

  it('rejects a tampered body', async () => {
    const signatureHex = await sign(timestamp + rawBody);

    expect(
      await isSignatureValid({
        publicKeyHex,
        signatureHex,
        timestamp,
        rawBody: JSON.stringify({ type: 2 }),
      }),
    ).toBe(false);
  });

  it('rejects a replayed signature under a different timestamp', async () => {
    const signatureHex = await sign(timestamp + rawBody);

    expect(
      await isSignatureValid({ publicKeyHex, signatureHex, timestamp: '1700000001', rawBody }),
    ).toBe(false);
  });

  it('rejects a signature from somebody else key', async () => {
    const signatureHex = await sign(timestamp + rawBody);

    expect(
      await isSignatureValid({ publicKeyHex: otherPublicKeyHex, signatureHex, timestamp, rawBody }),
    ).toBe(false);
  });

  it('rejects missing, malformed and odd-length headers instead of throwing', async () => {
    const cases = [undefined, '', 'zz', 'abc', 'not-hex-at-all'];

    for (const signatureHex of cases) {
      expect(await isSignatureValid({ publicKeyHex, signatureHex, timestamp, rawBody })).toBe(false);
    }

    expect(
      await isSignatureValid({
        publicKeyHex,
        signatureHex: await sign(timestamp + rawBody),
        timestamp: undefined,
        rawBody,
      }),
    ).toBe(false);
  });
});
