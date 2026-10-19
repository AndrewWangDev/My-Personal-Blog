import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";
import { parseClientDataJSON } from '../../../../utils/webauthn';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const db = (env as any).DB;
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "请先登录" }), { status: 401 });
  }

  try {
    const data = await request.json();
    const { id, response, name, publicKeySpki } = data;

    if (!id || !response || !response.clientDataJSON) {
      return new Response(JSON.stringify({ error: "无效的通行密钥凭据数据" }), { status: 400 });
    }

    const sessionKv = (env as any).SESSION;

    if (!db) {
      return new Response(JSON.stringify({ error: "数据库不可用" }), { status: 500 });
    }

    // 1. Verify challenge from KV or Cookie
    let expectedChallenge = '';
    if (sessionKv) {
      expectedChallenge = await sessionKv.get(`passkey_reg_${user.id}`) || '';
      await sessionKv.delete(`passkey_reg_${user.id}`);
    }
    const cookieChallenge = cookies.get('passkey_reg_ch')?.value;
    if (!expectedChallenge && cookieChallenge) {
      expectedChallenge = cookieChallenge;
    }
    cookies.delete('passkey_reg_ch', { path: '/' });

    if (!expectedChallenge) {
      return new Response(JSON.stringify({ error: "通行密钥注册挑战码已失效，请重试" }), { status: 400 });
    }

    const clientData = parseClientDataJSON(response.clientDataJSON);

    if (clientData.challenge !== expectedChallenge) {
      return new Response(JSON.stringify({ error: "通行密钥挑战码验证失败，请重试" }), { status: 400 });
    }

    if (clientData.type !== 'webauthn.create') {
      return new Response(JSON.stringify({ error: "凭据操作类型不匹配" }), { status: 400 });
    }

    // Origin verification
    const url = new URL(request.url);
    if (clientData.origin !== url.origin) {
      return new Response(JSON.stringify({ error: "来源域名校验失败" }), { status: 403 });
    }

    // 2. Public Key: Prefer client-provided SPKI Base64URL via getPublicKey()
    const storedPublicKey = publicKeySpki || response.attestationObject || '';
    if (!storedPublicKey) {
      return new Response(JSON.stringify({ error: "未能提取有效的通行密钥公钥" }), { status: 400 });
    }

    const keyName = (name && name.trim()) ? name.trim() : "Passkey (" + new Date().toLocaleDateString() + ")";

    // 3. Store into user_passkeys
    await db.prepare(`
      INSERT INTO user_passkeys (id, user_id, name, public_key, counter, transports, created_at)
      VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET 
        name = excluded.name,
        public_key = excluded.public_key,
        transports = excluded.transports
    `).bind(
      id,
      user.id,
      keyName,
      storedPublicKey,
      JSON.stringify(response.transports || ['internal'])
    ).run();

    return new Response(JSON.stringify({ 
      success: true, 
      message: "通行密钥添加成功！",
      passkey: { id, name: keyName } 
    }), { status: 201 });

  } catch (err: any) {
    console.error("Passkey register verification error:", err);
    return new Response(JSON.stringify({ error: err.message || "验证通行密钥注册失败" }), { status: 500 });
  }
};
