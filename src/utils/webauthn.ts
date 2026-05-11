// src/utils/webauthn.ts
// Lightweight WebAuthn / Passkey validation utilities for Cloudflare Workers

export function base64UrlEncode(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateRandomChallenge(length = 32): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

// Extract and verify challenge from clientDataJSON
export function parseClientDataJSON(clientDataJSONBase64: string): { challenge: string; type: string; origin: string } {
  const bytes = base64UrlDecode(clientDataJSONBase64);
  const decoder = new TextDecoder('utf-8');
  const jsonStr = decoder.decode(bytes);
  const clientData = JSON.parse(jsonStr);
  return {
    challenge: clientData.challenge,
    type: clientData.type,
    origin: clientData.origin
  };
}

// Parse authenticatorData to extract flags and signCount (for replay detection)
export function parseAuthenticatorData(authenticatorDataBase64: string): { flags: number; signCount: number } {
  const bytes = base64UrlDecode(authenticatorDataBase64);
  const flags = bytes.length >= 33 ? bytes[32] : 0;
  const signCount = bytes.length >= 37
    ? ((bytes[33] << 24) | (bytes[34] << 16) | (bytes[35] << 8) | bytes[36]) >>> 0
    : 0;
  return { flags, signCount };
}

// Convert SPKI or raw public key and verify signature using Web Crypto
export async function verifySignature(
  publicKeySpkiBase64: string,
  authenticatorDataBase64: string,
  clientDataJSONBase64: string,
  signatureBase64: string
): Promise<boolean> {
  try {
    const spkiBytes = base64UrlDecode(publicKeySpkiBase64);
    const authDataBytes = base64UrlDecode(authenticatorDataBase64);
    const clientDataBytes = base64UrlDecode(clientDataJSONBase64);
    const signatureBytes = base64UrlDecode(signatureBase64);

    // Compute SHA-256 of clientDataJSON
    const clientDataHash = await crypto.subtle.digest('SHA-256', clientDataBytes);

    // Concatenate authenticatorData + clientDataHash
    const signedData = new Uint8Array(authDataBytes.length + clientDataHash.byteLength);
    signedData.set(authDataBytes, 0);
    signedData.set(new Uint8Array(clientDataHash), authDataBytes.length);

    // Try importing as ECDSA P-256 first (-7 in WebAuthn)
    try {
      const cryptoKey = await crypto.subtle.importKey(
        'spki',
        spkiBytes,
        { name: 'ECDSA', namedCurve: 'P-256' },
        false,
        ['verify']
      );

      // WebAuthn signature for ES256 is ASN.1 DER encoded in standard authenticators.
      // Web Crypto expects raw R || S (64 bytes). We convert DER to raw IEEE P1363.
      const rawSignature = derToRawSignature(signatureBytes);

      const isValid = await crypto.subtle.verify(
        { name: 'ECDSA', hash: { name: 'SHA-256' } },
        cryptoKey,
        rawSignature,
        signedData
      );

      if (isValid) return true;
    } catch (ecdsaErr) {
      // If ECDSA import fails, try RSA (RS256)
    }

    // Fallback: Try RSA-PSS or RS256 (-257)
    try {
      const cryptoKeyRsa = await crypto.subtle.importKey(
        'spki',
        spkiBytes,
        { name: 'RSASSA-PKCS1-v1_5', hash: { name: 'SHA-256' } },
        false,
        ['verify']
      );

      const isValidRsa = await crypto.subtle.verify(
        'RSASSA-PKCS1-v1_5',
        cryptoKeyRsa,
        signatureBytes,
        signedData
      );

      if (isValidRsa) return true;
    } catch (rsaErr) {}

    return false;
  } catch (err) {
    console.error('Passkey signature verification error:', err);
    return false;
  }
}

// Convert ASN.1 DER ECDSA signature to IEEE P1363 (64 bytes R || S)
function derToRawSignature(derBytes: Uint8Array): Uint8Array {
  if (derBytes.length === 64) {
    return derBytes; // Already raw
  }
  try {
    let offset = 2; // Skip 0x30 and total length
    if (derBytes[offset] === 0x02) {
      // First integer R
      offset++;
      let rLen = derBytes[offset++];
      let r = derBytes.slice(offset, offset + rLen);
      offset += rLen;

      // Second integer S
      if (derBytes[offset++] === 0x02) {
        let sLen = derBytes[offset++];
        let s = derBytes.slice(offset, offset + sLen);

        // Strip leading zeros if 33 bytes
        if (r.length === 33 && r[0] === 0) r = r.slice(1);
        if (s.length === 33 && s[0] === 0) s = s.slice(1);

        const raw = new Uint8Array(64);
        raw.set(r, 32 - r.length);
        raw.set(s, 64 - s.length);
        return raw;
      }
    }
  } catch (e) {}
  return derBytes;
}
