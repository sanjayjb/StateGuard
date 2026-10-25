import { TreeSnapshot } from '../dag/types';

export type TTLPolicy = 'session' | '1h' | '24h' | '7d' | 'never';

export interface StorageRecord {
  ciphertext: string;
  iv: string;
  salt: string;
  expiresAt: number | null; // null means never
  version: string;
}

export class CryptoStorage {
  private static STORAGE_KEY = 'stateguard_session_encrypted';
  private static TTL_KEY = 'stateguard_session_ttl_policy';
  private masterPassphrase: string = 'stateguard-ephemeral-local-key';

  constructor(passphrase?: string) {
    if (passphrase) {
      this.masterPassphrase = passphrase;
    }
  }

  /**
   * Derives an AES-GCM 256-bit key using PBKDF2
   */
  private async deriveKey(saltBytes: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(this.masterPassphrase),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltBytes as unknown as BufferSource,
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypts and saves tree snapshot with specified TTL policy
   */
  public async saveSnapshot(snapshot: TreeSnapshot, ttlPolicy: TTLPolicy = '24h'): Promise<void> {
    const plaintext = JSON.stringify(snapshot);
    const enc = new TextEncoder();
    const encoded = enc.encode(plaintext);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(salt);

    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoded
    );

    const ciphertext = this.bufferToBase64(new Uint8Array(ciphertextBuffer));
    const ivBase64 = this.bufferToBase64(iv);
    const saltBase64 = this.bufferToBase64(salt);

    let expiresAt: number | null = null;
    const now = Date.now();
    if (ttlPolicy === '1h') expiresAt = now + 60 * 60 * 1000;
    else if (ttlPolicy === '24h') expiresAt = now + 24 * 60 * 60 * 1000;
    else if (ttlPolicy === '7d') expiresAt = now + 7 * 24 * 60 * 60 * 1000;
    else if (ttlPolicy === 'session') expiresAt = null; // Session storage

    const record: StorageRecord = {
      ciphertext,
      iv: ivBase64,
      salt: saltBase64,
      expiresAt,
      version: '1.0.0',
    };

    await this.writeRaw(CryptoStorage.STORAGE_KEY, JSON.stringify(record));
    await this.writeRaw(CryptoStorage.TTL_KEY, ttlPolicy);
  }

  /**
   * Loads and decrypts tree snapshot, verifying TTL expiration
   */
  public async loadSnapshot(): Promise<TreeSnapshot | null> {
    const raw = await this.readRaw(CryptoStorage.STORAGE_KEY);
    if (!raw) return null;

    try {
      const record: StorageRecord = JSON.parse(raw);

      // Check TTL expiration
      if (record.expiresAt && Date.now() > record.expiresAt) {
        console.warn('StateGuard encrypted session expired due to TTL auto-purge. Purging.');
        await this.clear();
        return null;
      }

      const salt = this.base64ToBuffer(record.salt);
      const iv = this.base64ToBuffer(record.iv);
      const ciphertext = this.base64ToBuffer(record.ciphertext);

      const key = await this.deriveKey(salt);
      const decryptedBuffer = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv as unknown as BufferSource },
        key,
        ciphertext as unknown as BufferSource
      );

      const dec = new TextDecoder();
      const plaintext = dec.decode(decryptedBuffer);
      return JSON.parse(plaintext) as TreeSnapshot;
    } catch (err) {
      console.error('Failed to decrypt StateGuard snapshot:', err);
      return null;
    }
  }

  public async clear(): Promise<void> {
    await this.removeRaw(CryptoStorage.STORAGE_KEY);
  }

  public async getTTLPolicy(): Promise<TTLPolicy> {
    const policy = await this.readRaw(CryptoStorage.TTL_KEY);
    return (policy as TTLPolicy) || '24h';
  }

  // Storage primitives compatible with Chrome Extension Storage or LocalStorage
  private async writeRaw(key: string, value: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: value }, () => resolve());
      });
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  }

  private async readRaw(key: string): Promise<string | null> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
          resolve((result[key] as string) || null);
        });
      });
    }

    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }

    return null;
  }

  private async removeRaw(key: string): Promise<void> {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      return new Promise((resolve) => {
        chrome.storage.local.remove(key, () => resolve());
      });
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  }

  private bufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  private base64ToBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
