import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

import { hashPassword } from '../../../../utils/password';

// PUT: Update user details
export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const userId = params.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: '缺少用户 ID' }), { status: 400 });
  }

  try {
    const db = env.DB;
    const data = await request.json();
    const { email, newPassword } = data;

    // Update basic info only if a valid email is provided
    if (email && typeof email === 'string' && email.trim().length > 0) {
      await db.prepare('UPDATE users SET email = ? WHERE id = ?')
        .bind(email.trim(), userId)
        .run();
    }

    // If admin provided a new password, overwrite it
    if (newPassword && newPassword.trim().length > 0) {
      if (newPassword.length < 6) {
        return new Response(JSON.stringify({ error: '新密码不能少于 6 位' }), { status: 400 });
      }
      const newHash = await hashPassword(newPassword);
      await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .bind(newHash, userId)
        .run();
    }

    return new Response(JSON.stringify({ success: true, message: '用户信息已更新' }), { status: 200 });
  } catch (err: any) {
    console.error('Admin update user error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};

// DELETE: Delete (deactivate) user account
export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const userId = params.id;
  if (!userId) {
    return new Response(JSON.stringify({ error: '缺少用户 ID' }), { status: 400 });
  }

  // Prevent admin self-deletion
  if (userId === locals.user.id) {
    return new Response(JSON.stringify({ error: '不能注销自己的管理员账号' }), { status: 400 });
  }

  try {
    const db = env.DB;

    // Get user email for restriction record
    const user = await db.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first();
    if (!user || !user.email) {
      return new Response(JSON.stringify({ error: '用户不存在' }), { status: 404 });
    }

    // 使用 batch 原子级联清理所有关联表
    await db.batch([
      db.prepare('UPDATE comments SET is_deleted = 1 WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM interactions WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM user_oauth_accounts WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM user_passkeys WHERE user_id = ?').bind(userId),
      db.prepare('UPDATE complaints SET user_id = NULL WHERE user_id = ?').bind(userId),
      db.prepare(`
        INSERT INTO deleted_users (email, expires_at) 
        VALUES (?, datetime('now', '+30 days')) 
        ON CONFLICT(email) DO UPDATE SET expires_at = datetime('now', '+30 days')
      `).bind(user.email),
      db.prepare('DELETE FROM users WHERE id = ?').bind(userId)
    ]);

    return new Response(JSON.stringify({ success: true, message: '用户已注销' }), { status: 200 });
  } catch (err: any) {
    console.error('Admin delete user error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
