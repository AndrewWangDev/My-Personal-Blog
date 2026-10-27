import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";
import { verifyPassword } from '../../../utils/password';

export const DELETE: APIRoute = async ({ request, cookies, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const userId = locals.user.id;

  try {
    const db = env.DB;
    if (!db) {
      throw new Error("DB not found");
    }

    // 1. 获取用户信息以验证密码/身份
    const user = await db.prepare('SELECT id, email, password_hash, auth_provider FROM users WHERE id = ?').bind(userId).first();
    if (!user || !user.email) {
      return new Response(JSON.stringify({ error: '用户不存在' }), { status: 400 });
    }

    // 2. 检查二次认证凭证 (密码或 OAuth 确认标记)
    const body = await request.json().catch(() => ({}));
    const { password, confirmation } = body;

    if (user.password_hash) {
      if (!password) {
        return new Response(JSON.stringify({ error: '请提供当前账号密码以验证注销' }), { status: 400 });
      }
      const { isValid } = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return new Response(JSON.stringify({ error: '密码错误，无法注销账号' }), { status: 400 });
      }
    } else {
      if (confirmation !== 'DELETE' && confirmation !== user.email) {
        return new Response(JSON.stringify({ error: '第三方登录用户请输入 DELETE 以确认注销' }), { status: 400 });
      }
    }

    // 3. 将评论软删除（占位）
    await db.prepare('UPDATE comments SET is_deleted = 1 WHERE user_id = ?').bind(userId).run();

    // 4. 硬删除关联的第三方绑定、通行密钥与点赞收藏互动记录
    await db.batch([
      db.prepare('DELETE FROM interactions WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM user_oauth_accounts WHERE user_id = ?').bind(userId),
      db.prepare('DELETE FROM user_passkeys WHERE user_id = ?').bind(userId),
      db.prepare('UPDATE complaints SET user_id = NULL WHERE user_id = ?').bind(userId)
    ]);

    // 5. 将邮箱写入 deleted_users 防止恶意注册 (upsert 以应对极小概率的多次注销情况)
    await db.prepare(`
      INSERT INTO deleted_users (email, expires_at) 
      VALUES (?, datetime('now', '+30 days')) 
      ON CONFLICT(email) DO UPDATE SET expires_at = datetime('now', '+30 days')
    `).bind(user.email).run();

    // 6. 彻底删除用户记录
    await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

    // 7. 清除 Cookie
    cookies.delete('user_session', { path: '/' });

    return new Response(JSON.stringify({ success: true, message: '账号已永久注销' }), { status: 200 });
  } catch (err: any) {
    console.error('Delete account error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
