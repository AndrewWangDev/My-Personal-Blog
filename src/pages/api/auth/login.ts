// src/pages/api/auth/login.ts
import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

import { verifyPassword, hashPassword } from '../../../utils/password';
import { createSignedSession, getSessionSecret } from '../../../utils/session';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const data = await request.formData();
    const email = data.get('email') as string;
    const password = data.get('password') as string;
    const turnstileResponse = data.get('cf-turnstile-response') as string;

    if (!email || !password || !turnstileResponse) {
      return new Response(JSON.stringify({ error: "请填写账号密码并完成人机验证" }), { status: 400 });
    }

    // 验证 Turnstile (使用官方推荐的 URLSearchParams 格式与客户端 IP)
    const turnstileSecret = (env as any).TURNSTILE_SECRET_KEY;
    if (!turnstileSecret) {
      return new Response(JSON.stringify({ error: "服务器人机验证配置缺失" }), { status: 500 });
    }
    const verifyParams = new URLSearchParams();
    verifyParams.append('secret', turnstileSecret);
    verifyParams.append('response', turnstileResponse);
    const clientIp = request.headers.get('CF-Connecting-IP') || '';
    if (clientIp) verifyParams.append('remoteip', clientIp);

    const turnstileCheck = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams,
    });
    const turnstileOutcome = await turnstileCheck.json();
    if (!turnstileOutcome.success) {
      return new Response(JSON.stringify({ error: "人机验证未通过，请重试" }), { status: 400 });
    }

    const db = env.DB;
    // 1. 检查是否在限制封禁名单中
    const restricted = await db.prepare("SELECT email FROM deleted_users WHERE email = ? AND expires_at > datetime('now')").bind(email).first();
    if (restricted) {
      return new Response(JSON.stringify({ error: "该账号目前处于封禁限制状态，暂无法登录" }), { status: 403 });
    }

    // 2. 查找用户 (包含 token_version 用于会话管理)
    const user = await db.prepare('SELECT id, password_hash, username, token_version FROM users WHERE email = ?').bind(email).first();
    
    if (!user) {
      return new Response(JSON.stringify({ error: "该邮箱尚未注册，请先注册" }), { status: 400 });
    }

    // 2. 校验密码（支持 PBKDF2 和老 SHA-256 平滑升级）
    const { isValid, needsRehash } = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return new Response(JSON.stringify({ error: "密码错误，请检查后重试" }), { status: 400 });
    }

    // 老用户密码哈希静默升级为加盐 PBKDF2
    if (needsRehash) {
      try {
        const upgradedHash = await hashPassword(password);
        await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(upgradedHash, user.id).run();
      } catch (e) {
        console.error('Password rehash error:', e);
      }
    }

    // 3. 登录成功，生成防篡改签名 Session 并种下 Cookie
    const sessionSecret = getSessionSecret(env);
    const sessionToken = await createSignedSession(user.id as string, sessionSecret, user.token_version || 1);
    cookies.set('user_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7 // 7天免登录
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: `欢迎回来，${user.username}！`,
      redirectUrl: '/' 
    }), { status: 200 });

  } catch (error: any) {
    console.error("【登录报错】:", error.message);
    return new Response(JSON.stringify({ error: "系统开小差了，请稍后再试" }), { status: 500 });
  }
};