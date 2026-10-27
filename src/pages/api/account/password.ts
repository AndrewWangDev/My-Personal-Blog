import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

import { verifyPassword, hashPassword } from '../../../utils/password';
import { createSignedSession, getSessionSecret } from '../../../utils/session';

export const PUT: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const data = await request.json();
    const { oldPassword, newPassword } = data;

    const db = (env as any).DB || env.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: '数据库连接异常' }), { status: 500 });
    }

    const user = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(locals.user.id).first();
    if (!user) {
      return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404 });
    }

    const hasExistingPassword = Boolean(user.password_hash);

    if (hasExistingPassword) {
      if (!oldPassword || !newPassword) {
        return new Response(JSON.stringify({ error: '请提供原密码和新密码' }), { status: 400 });
      }
      if (newPassword.length < 6) {
        return new Response(JSON.stringify({ error: '新密码不能少于 6 位' }), { status: 400 });
      }

      const { isValid } = await verifyPassword(oldPassword, user.password_hash);
      if (!isValid) {
        return new Response(JSON.stringify({ error: '原密码错误' }), { status: 400 });
      }
    } else {
      // 首次设置密码（针对纯第三方 OAuth 登录用户）
      if (!newPassword) {
        return new Response(JSON.stringify({ error: '请提供新密码' }), { status: 400 });
      }
      if (newPassword.length < 6) {
        return new Response(JSON.stringify({ error: '新密码不能少于 6 位' }), { status: 400 });
      }
    }

    const newHash = await hashPassword(newPassword);
    
    // 更新密码并递增 token_version 以主动吊销全网旧设备/旧会话
    await db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
      .bind(newHash, locals.user.id)
      .run();

    // 为当前操作端签发携带最新 token_version 的会话 Token
    const userRow = await db.prepare('SELECT token_version FROM users WHERE id = ?').bind(locals.user.id).first();
    const sessionSecret = getSessionSecret(env);
    const newToken = await createSignedSession(locals.user.id, sessionSecret, Number(userRow?.token_version || 2));
    cookies.set('user_session', newToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: hasExistingPassword ? '密码修改成功' : '初始密码设置成功' 
    }), { status: 200 });
  } catch (err: any) {
    console.error('Change password error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
