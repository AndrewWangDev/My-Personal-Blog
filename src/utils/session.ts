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
 * 格式: <userId>.<timestamp>.<signatureHex>
 */
export async function createSignedSession(userId: string, secret: string): Promise<string> {
  const timestamp = Date.now().toString();
  const payload = `${userId}.${timestamp}`;
  const key = await getHmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  const sigHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return `${payload}.${sigHex}`;
}

/**
 * 校验 Session Token 并解析出合法的 userId
 * 若签名无效、格式错误或超过有效期，则返回 null
 */
export async function verifySignedSession(
  token: string | undefined | null,
  secret: string,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000 // 默认 7 天有效
): Promise<string | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [userId, timestampStr, sigHex] = parts;
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || Date.now() - timestamp > maxAgeMs) {
    return null; // 已过期
  }
  const payload = `${userId}.${timestampStr}`;
  const sigBytes = sigHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16));
  if (!sigBytes || sigBytes.length !== 32) return null;
  
  try {
    const key = await getHmacKey(secret);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      new Uint8Array(sigBytes),
      textEncoder.encode(payload)
    );
    return isValid ? userId : null;
  } catch (err) {
    console.error('Session signature verification error:', err);
    return null;
  }
}
