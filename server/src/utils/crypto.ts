import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getMasterKey(): Buffer {
  const key = process.env.MASTER_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('MASTER_ENCRYPTION_KEY não configurada. Adicione ao .env do servidor.');
  }
  // Normalizar para 32 bytes com SHA-256
  return crypto.createHash('sha256').update(key).digest();
}

/**
 * Criptografa uma string com AES-256-CBC
 * Retorna: iv:ciphertext (ambos em hex)
 */
export function encrypt(text: string): string {
  const key = getMasterKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Decriptografa uma string criptografada com encrypt()
 */
export function decrypt(ciphertext: string): string {
  const key = getMasterKey();
  const [ivHex, encryptedHex] = ciphertext.split(':');
  if (!ivHex || !encryptedHex) throw new Error('Formato de ciphertext inválido.');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/**
 * Mascara uma API Key para exibição segura no frontend
 * Ex: "AbCdEfGhIj..." → "AbCd...hIj"
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 8) return '****';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
