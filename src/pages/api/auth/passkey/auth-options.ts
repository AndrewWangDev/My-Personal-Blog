import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";
import { generateRandomChallenge } from '../../../../utils/webauthn';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const url = new URL(request.url);
    const rpId = url.hostname;
    const challenge = generateRandomChallenge(32);
    const authSessionId = crypto.randomUUID();

    // Store challenge in KV for 5 minutes
    const sessionKv = (env as any).SESSION;
    if (sessionKv) {
      await sessionKv.put(`passkey_auth_${authSessionId}`, challenge, { expirationTtl: 300 });
    }

    cookies.set('passkey_auth_session', authSessionId, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 300
    });

    cookies.set('passkey_auth_ch', challenge, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 300
    });

    const options = {
      challenge,
      timeout: 60000,
      rpId,
      userVerification: "preferred"
    };

    return new Response(JSON.stringify({ success: true, options }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    console.error("Passkey auth options error:", err);
    return new Response(JSON.stringify({ error: "初始化通行密钥登录失败" }), { status: 500 });
  }
};
