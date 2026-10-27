import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";
import { parseClientDataJSON, verifySignature, parseAuthenticatorData } from '../../../../utils/webauthn';
import { createSignedSession, getSessionSecret } from '../../../../utils/session';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const data = await request.json();
    const { id, response } = data;

    if (!id || !response || !response.clientDataJSON || !response.authenticatorData || !response.signature) {
      return new Response(JSON.stringify({ error: "缺少通行密钥签名数据" }), { status: 400 });
    }

    const db = (env as any).DB;
    const sessionKv = (env as any).SESSION;
    if (!db) {
      return new Response(JSON.stringify({ error: "数据库不可用" }), { status: 500 });
    }

    // 1. Verify challenge from KV or Cookie
    const authSessionId = cookies.get('passkey_auth_session')?.value;
    const cookieChallenge = cookies.get('passkey_auth_ch')?.value;
    let expectedChallenge = '';
    if (authSessionId && sessionKv) {
      expectedChallenge = await sessionKv.get(`passkey_auth_${authSessionId}`) || '';
      await sessionKv.delete(`passkey_auth_${authSessionId}`);
    }
    if (!expectedChallenge && cookieChallenge) {
      expectedChallenge = cookieChallenge;
    }
    // Delete challenges to prevent replay
    cookies.delete('passkey_auth_session', { path: '/' });
    cookies.delete('passkey_auth_ch', { path: '/' });

    if (!expectedChallenge) {
      return new Response(JSON.stringify({ error: "挑战码已失效，请重新登录" }), { status: 400 });
    }

    const clientData = parseClientDataJSON(response.clientDataJSON);

    if (clientData.challenge !== expectedChallenge) {
      return new Response(JSON.stringify({ error: "挑战码失效或不匹配，请重新登录" }), { status: 400 });
    }

    if (clientData.type !== 'webauthn.get') {
      return new Response(JSON.stringify({ error: "凭据请求类型不匹配" }), { status: 400 });
    }

    // Origin verification
    const url = new URL(request.url);
    if (clientData.origin !== url.origin) {
      return new Response(JSON.stringify({ error: "来源域名校验失败" }), { status: 403 });
    }

    // 2. Fetch passkey and user from DB
    const passkey = await db.prepare(
      'SELECT id, user_id, public_key, counter FROM user_passkeys WHERE id = ?'
    ).bind(id).first();

    if (!passkey) {
      return new Response(JSON.stringify({ error: "未找到该通行密钥，可能已被注销" }), { status: 404 });
    }

    // 3. Cryptographic signature check
    const isValid = await verifySignature(
      passkey.public_key,
      response.authenticatorData,
      response.clientDataJSON,
      response.signature
    );

    if (!isValid) {
      return new Response(JSON.stringify({ error: "通行密钥生物/PIN 签名校验失败" }), { status: 401 });
    }

    // 4. Counter and flags verification (anti-replay)
    const authData = parseAuthenticatorData(response.authenticatorData);
    if (!(authData.flags & 0x01)) {
      return new Response(JSON.stringify({ error: "未通过用户存在性校验 (User Presence)" }), { status: 401 });
    }

    const currentCounter = Number(passkey.counter || 0);
    if (authData.signCount > 0 && currentCounter > 0 && authData.signCount <= currentCounter) {
      return new Response(JSON.stringify({ error: "检测到凭据重放或克隆风险，已拦截本次登录" }), { status: 403 });
    }

    // Update last_used_at and counter
    const newCounter = Math.max(authData.signCount, currentCounter);
    await db.prepare('UPDATE user_passkeys SET last_used_at = CURRENT_TIMESTAMP, counter = ? WHERE id = ?')
      .bind(newCounter, id).run();

    // 5. Query user profile and issue session cookie
    const user = await db.prepare(`
      SELECT u.id, u.username, u.role, u.token_version,
             (SELECT 1 FROM deleted_users d WHERE d.email = u.email AND d.expires_at > datetime('now')) as is_restricted
      FROM users u WHERE u.id = ?
    `).bind(passkey.user_id).first();

    if (!user) {
      return new Response(JSON.stringify({ error: "关联用户不存在" }), { status: 404 });
    }

    if (user.is_restricted) {
      return new Response(JSON.stringify({ error: "该账号目前处于封禁限制状态，无法登录" }), { status: 403 });
    }

    const sessionSecret = getSessionSecret(env);
    const sessionToken = await createSignedSession(user.id as string, sessionSecret, (user as any).token_version || 1);
    cookies.set('user_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    return new Response(JSON.stringify({
      success: true,
      message: "通行密钥登录成功",
      user: { id: user.id, username: user.username, role: user.role }
    }), { status: 200 });

  } catch (err: any) {
    console.error("Passkey auth verification error:", err);
    return new Response(JSON.stringify({ error: err.message || "通行密钥验证失败" }), { status: 500 });
  }
};
