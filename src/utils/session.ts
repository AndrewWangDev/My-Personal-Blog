// src/utils/session.ts

const textEncoder = new TextEncoder();

export function getSessionSecret(env: any): string {
  const secret = env?.SESSION_SECRET || (import.meta.env as any)?.SESSION_SECRET;
  if (!secret) {
    if (import.meta.env.DEV) {
      console.warn('⚠️ [DEV ONLY] SESSION_SECRET is not set in environment. Using temporary local dev key.');
      return 'dev-local-session-secret-key-32b-only-for-local-dev!';
    }
    throw new Error('CRITICAL SECURITY ERROR: SESSION_SECRET is not configured in production environment bindings!');
  }
  return secret;
}

async function getHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * 创建防篡改的签名 Session Token
 * 格式: <userId>.<timestamp>.<tokenVersion>.<signatureHex>
 */
export async function createSignedSession(userId: string, secret: string, tokenVersion = 1): Promise<string> {
  const timestamp = Date.now().toString();
  const versionStr = String(tokenVersion || 1);
  const payload = `${userId}.${timestamp}.${versionStr}`;
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${payload}.${sigHex}`;
}

export interface VerifiedSession {
  userId: string;
  tokenVersion: number;
}

/**
 * 校验 Session Token 并解析出合法的 userId 与 tokenVersion
 * 支持 4 段式 (新规范带版本号) 与 3 段式 (老规范平滑过渡)
 * 若签名无效、格式错误或超过有效期，则返回 null
 */
export async function verifySignedSession(
  token: string | undefined | null,
  secret: string,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000 // 默认 7 天有效
): Promise<VerifiedSession | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3 && parts.length !== 4) return null;

  try {
    const key = await getHmacKey(secret);

    if (parts.length === 4) {
      const [userId, timestampStr, versionStr, sigHex] = parts;
      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
        return null;
      }
      const tokenVersion = parseInt(versionStr, 10);
      if (isNaN(tokenVersion) || tokenVersion < 1) {
        return null;
      }

      const payload = `${userId}.${timestampStr}.${versionStr}`;
      const sigBytes = sigHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16));
      if (!sigBytes || sigBytes.length !== 32) return null;

      const isValid = await crypto.subtle.verify(
        'HMAC',
        key,
        new Uint8Array(sigBytes),
        textEncoder.encode(payload)
      );
      return isValid ? { userId, tokenVersion } : null;
    } else {
      // 3 parts (legacy token: userId.timestamp.sig)
      const [userId, timestampStr, sigHex] = parts;
      const timestamp = parseInt(timestampStr, 10);
      if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
        return null;
      }
      const payload = `${userId}.${timestampStr}`;
      const sigBytes = sigHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16));
      if (!sigBytes || sigBytes.length !== 32) return null;

      const isValid = await crypto.subtle.verify(
        'HMAC',
        key,
        new Uint8Array(sigBytes),
        textEncoder.encode(payload)
      );
      return isValid ? { userId, tokenVersion: 1 } : null;
    }
  } catch (err) {
    console.error('Session signature verification error:', err);
    return null;
  }
}
