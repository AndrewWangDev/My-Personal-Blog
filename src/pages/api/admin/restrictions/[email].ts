import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

// PUT: Update restriction expiry date
export const PUT: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const email = decodeURIComponent(params.email || '');
  if (!email) {
    return new Response(JSON.stringify({ error: '缺少邮箱' }), { status: 400 });
  }

  try {
    const db = env.DB;
    const data = await request.json();
    const { expires_at } = data;

    if (!expires_at) {
      return new Response(JSON.stringify({ error: '请提供新的截止时间' }), { status: 400 });
    }

    await db.prepare('UPDATE deleted_users SET expires_at = ? WHERE email = ?')
      .bind(expires_at, email)
      .run();

    return new Response(JSON.stringify({ success: true, message: '限制时间已更新' }), { status: 200 });
  } catch (err: any) {
    console.error('Admin update restriction error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};

// DELETE: Remove restriction
export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 });
  }

  const email = decodeURIComponent(params.email || '');
  if (!email) {
    return new Response(JSON.stringify({ error: '缺少邮箱' }), { status: 400 });
  }

  try {
    const db = env.DB;
    await db.prepare('DELETE FROM deleted_users WHERE email = ?').bind(email).run();
    return new Response(JSON.stringify({ success: true, message: '限制已解除' }), { status: 200 });
  } catch (err: any) {
    console.error('Admin delete restriction error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
