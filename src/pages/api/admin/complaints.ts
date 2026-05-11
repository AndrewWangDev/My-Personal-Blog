import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
  }
  try {
    const db = env.DB;
    // 连接 users 表查询投诉人用户名和邮箱。用 LEFT JOIN 以防用户注销
    const complaints = await db.prepare(`
      SELECT c.*, u.username, u.email 
      FROM complaints c
      LEFT JOIN users u ON c.user_id = u.id
      ORDER BY c.created_at DESC
    `).all();

    return new Response(JSON.stringify({ complaints: complaints.results || [] }), { status: 200 });
  } catch (error: any) {
    console.error("【管理员拉取投诉报错】:", error.message);
    return new Response(JSON.stringify({ error: "服务器内部错误" }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
  }
  try {
    const data = await request.json();
    const id = data.id;
    const status = data.status;
    const result = data.result;

    if (!id || !status) {
      return new Response(JSON.stringify({ error: "参数不完整" }), { status: 400 });
    }

    const db = env.DB;
    await db.prepare(`
      UPDATE complaints 
      SET status = ?, result = ?
      WHERE id = ?
    `).bind(status, result || null, id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("【管理员更新投诉报错】:", error.message);
    return new Response(JSON.stringify({ error: "更新失败" }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: "Forbidden: Admin access required" }), { status: 403 });
  }
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) {
      return new Response(JSON.stringify({ error: "Missing id" }), { status: 400 });
    }

    const db = env.DB;
    // 管理员的彻底删除
    await db.prepare('DELETE FROM complaints WHERE id = ?').bind(id).run();

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("【管理员删除投诉报错】:", error.message);
    return new Response(JSON.stringify({ error: "删除失败" }), { status: 500 });
  }
};
