import * as SecureStore from 'expo-secure-store';
// @ts-ignore
import aesjs from 'aes-js';

const KEY_SIZE = 32; // 256 bits

// Generate a random key
const generateKey = (): Uint8Array => {
  const bytes = new Uint8Array(KEY_SIZE);
  for (let i = 0; i < KEY_SIZE; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
};

// Retrieve or generate key securely
const getEncryptionKey = async (): Promise<Uint8Array> => {
  const keyName = 'cedismart_storage_encryption_key';
  const hexKey = await SecureStore.getItemAsync(keyName);
  
  if (!hexKey) {
    const newKey = generateKey();
    const generatedHex = aesjs.utils.hex.fromBytes(newKey);
    await SecureStore.setItemAsync(keyName, generatedHex);
    return newKey;
  }
  
  return aesjs.utils.hex.toBytes(hexKey);
};

/**
 * Encrypt a text string using AES-256 CTR mode.
 */
export const encryptData = async (text: string): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    const textBytes = aesjs.utils.utf8.toBytes(text);
    
    // Using a counter set to 5 as the starting vector
    const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(5));
    const encryptedBytes = aesCtr.encrypt(textBytes);
    
    return aesjs.utils.hex.fromBytes(encryptedBytes);
  } catch (error) {
    console.error('[SecureStorage] Encryption error:', error);
    throw error;
  }
};

/**
 * Decrypt a hex-encoded string back to text using AES-256 CTR mode.
 */
export const decryptData = async (hexString: string): Promise<string> => {
  try {
    const key = await getEncryptionKey();
    const encryptedBytes = aesjs.utils.hex.toBytes(hexString);
    
    const aesCtr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(5));
    const decryptedBytes = aesCtr.decrypt(encryptedBytes);
    
    return aesjs.utils.utf8.fromBytes(decryptedBytes);
  } catch (error) {
    console.error('[SecureStorage] Decryption error:', error);
    throw error;
  }
};
