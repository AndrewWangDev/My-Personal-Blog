// src/pages/api/auth/register.ts
import type { APIRoute } from 'astro';
// 【只保留这一种官方指定的引入方式】
import { env } from "cloudflare:workers";

import { hashPassword } from '../../../utils/password';

import { isAllowedEmailDomain, validateUsername } from '../../../utils/validation';

// 【关键：去掉了括号里的 locals 参数，再也不去碰它】
export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.formData();
    const email = data.get('email') as string;
    const username = data.get('username') as string;
    const password = data.get('password') as string;
    const verifyCode = data.get('verify_code') as string;
    const turnstileResponse = data.get('cf-turnstile-response') as string;

    if (!email || !username || !password || !verifyCode) {
      return new Response(JSON.stringify({ error: "请填写完整注册信息（包含 6 位验证码）" }), { status: 400 });
    }

    const uCheck = validateUsername(username);
    if (!uCheck.valid) {
      return new Response(JSON.stringify({ error: uCheck.error }), { status: 400 });
    }

    if (!turnstileResponse) {
      return new Response(JSON.stringify({ error: "人机验证未完成，请重新点击人机验证框" }), { status: 400 });
    }

    if (!isAllowedEmailDomain(email)) {
      return new Response(JSON.stringify({ error: "仅支持 Gmail, Outlook, Yahoo, Hotmail, iCloud, Proton 邮箱注册，请更换重试" }), { status: 400 });
    }
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

    // --- 数据库操作区 ---
    // 【直接使用 env.DB，再也不写降级兼容】
    const db = env.DB;
    
    if (!db) {
      throw new Error("数据库依然隐身。请确认 wrangler.toml 里的 preview_database_id 已配置并重启了服务。");
    }
    
    const existingUser = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existingUser) {
      return new Response(JSON.stringify({ error: "该邮箱已被注册，请直接登录" }), { status: 400 });
    }

    const recentlyDeleted = await db.prepare("SELECT email FROM deleted_users WHERE email = ? AND expires_at > datetime('now')").bind(email).first();
    if (recentlyDeleted) {
      return new Response(JSON.stringify({ error: "该邮箱已被注销且处于保护期内，期间仅能注册一次，请解禁后重试" }), { status: 400 });
    }

    // --- 验证码校验 ---
    const verification = await db.prepare("SELECT code, expires_at FROM email_verifications WHERE email = ?").bind(email).first() as any;
    if (!verification || verification.code !== verifyCode) {
      return new Response(JSON.stringify({ error: "验证码错误或已过期" }), { status: 400 });
    }
    if (new Date(verification.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "验证码已过期，请重新获取" }), { status: 400 });
    }
    // 校验通过后删除验证码，防止二次使用
    await db.prepare("DELETE FROM email_verifications WHERE email = ?").bind(email).run();

    const userId = crypto.randomUUID();
    const hashedPassword = await hashPassword(password);
    
    await db.prepare(
      'INSERT INTO users (id, email, username, password_hash) VALUES (?, ?, ?, ?)'
    ).bind(userId, email, username, hashedPassword).run();

    return new Response(JSON.stringify({ success: true, message: "注册成功！" }), { status: 200 });
    
  } catch (error: any) {
    console.error("【后端入库报错】:", error.message || error);
    const errorMsg = error.message.includes("数据库依然隐身") 
      ? error.message 
      : `注册遇到了点麻烦: ${error.message}`;
    return new Response(JSON.stringify({ error: errorMsg }), { status: 500 });
  }
};