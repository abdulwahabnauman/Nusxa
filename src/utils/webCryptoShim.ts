/**
 * WebCrypto shim for React Native.
 *
 * crypto-js needs a secure random source for its AES salt: it looks for
 * `globalThis.crypto.getRandomValues` (browser) or `require('crypto')`
 * (Node). Hermes provides neither — `require('crypto')` cannot resolve
 * through Metro — so every password-based `AES.encrypt` throws
 * "Native crypto module could not be used to get secure random number."
 *
 * Install a `globalThis.crypto` backed by the platform CSPRNG
 * (expo-crypto → Android SecureRandom / iOS SecRandomCopyBytes).
 * MUST be imported before crypto-js so the shim exists when crypto-js
 * captures its random source at module load.
 */
import * as ExpoCrypto from 'expo-crypto';

type CryptoLike = { getRandomValues?: unknown };

const existing = (globalThis as { crypto?: CryptoLike }).crypto;
if (!existing || typeof existing.getRandomValues !== 'function') {
  Object.defineProperty(globalThis, 'crypto', {
    value: {
      getRandomValues: <T extends ArrayBufferView>(array: T): T => {
        const bytes = ExpoCrypto.getRandomBytes(array.byteLength);
        new Uint8Array(array.buffer, array.byteOffset, array.byteLength).set(bytes);
        return array;
      },
    },
    configurable: true,
    writable: false,
  });
}

export {};
