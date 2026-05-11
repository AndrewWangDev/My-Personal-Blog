// src/pages/api/auth/login.ts
import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

import { verifyPassword, hashPassword } from '../../../utils/password';
import { createSignedSession, DEFAULT_SESSION_SECRET } from '../../../utils/session';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const data = await request.formData();
    const email = data.get('email') as string;
    const password = data.get('password') as string;
    const turnstileResponse = data.get('cf-turnstile-response') as string;

    if (!email || !password || !turnstileResponse) {
      return new Response(JSON.stringify({ error: "请填写账号密码并完成人机验证" }), { status: 400 });
    }

    // 验证 Turnstile
    const verifyData = new FormData();
    const turnstileSecret = (env as any).TURNSTILE_SECRET_KEY;
    if (!turnstileSecret) {
      return new Response(JSON.stringify({ error: "服务器人机验证配置缺失" }), { status: 500 });
    }
    verifyData.append('secret', turnstileSecret);
    verifyData.append('response', turnstileResponse);
    const turnstileCheck = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyData,
    });
    const turnstileOutcome = await turnstileCheck.json();
    if (!turnstileOutcome.success) {
      return new Response(JSON.stringify({ error: "人机验证未通过，请重试" }), { status: 400 });
    }

    const db = env.DB;
    // 1. 查找用户
    const user = await db.prepare('SELECT id, password_hash, username FROM users WHERE email = ?').bind(email).first();
    
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
    const sessionSecret = (env as any).SESSION_SECRET || DEFAULT_SESSION_SECRET;
    const sessionToken = await createSignedSession(user.id as string, sessionSecret);
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