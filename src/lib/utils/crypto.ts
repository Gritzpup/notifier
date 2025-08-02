import CryptoJS from 'crypto-js';

export interface Credentials {
  discord?: {
    token: string;
  };
  telegram?: {
    botToken: string;
  };
  twitch?: {
    username: string;
    oauth: string;
    channels: string[];
  };
}

const STORAGE_KEY = 'notif_hub_creds';
const SALT = 'notif_hub_salt_2024';

export function encryptCredentials(credentials: Credentials, passphrase: string): string {
  const saltedPassphrase = passphrase + SALT;
  return CryptoJS.AES.encrypt(JSON.stringify(credentials), saltedPassphrase).toString();
}

export function decryptCredentials(encryptedData: string, passphrase: string): Credentials | null {
  try {
    const saltedPassphrase = passphrase + SALT;
    const decrypted = CryptoJS.AES.decrypt(encryptedData, saltedPassphrase);
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    return JSON.parse(decryptedString);
  } catch (error) {
    console.error('Failed to decrypt credentials:', error);
    return null;
  }
}

export function saveCredentials(credentials: Credentials, passphrase: string): void {
  const encrypted = encryptCredentials(credentials, passphrase);
  localStorage.setItem(STORAGE_KEY, encrypted);
}

export function loadCredentials(passphrase: string): Credentials | null {
  const encrypted = localStorage.getItem(STORAGE_KEY);
  if (!encrypted) return null;
  return decryptCredentials(encrypted, passphrase);
}

export function clearCredentials(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasStoredCredentials(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}