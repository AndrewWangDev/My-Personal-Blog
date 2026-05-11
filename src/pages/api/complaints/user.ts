import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ locals }) => {
  try {
    const userId = locals.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const db = env.DB;
    const complaints = await db.prepare(`
      SELECT id, target_type, target_id, reason, details, status, result, created_at 
      FROM complaints 
      WHERE user_id = ? AND is_deleted_by_user = 0
      ORDER BY created_at DESC
    `).bind(userId).all();

    return new Response(JSON.stringify({ complaints: complaints.results || [] }), { status: 200 });
  } catch (error: any) {
    console.error("【拉取用户投诉报错】:", error.message);
    return new Response(JSON.stringify({ error: "服务器内部错误" }), { status: 500 });
  }
};
