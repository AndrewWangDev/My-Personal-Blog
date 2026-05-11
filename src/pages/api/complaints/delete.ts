import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const userId = locals.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const url = new URL(request.url);
    const complaintId = url.searchParams.get('id');
    if (!complaintId) {
      return new Response(JSON.stringify({ error: "Missing complaint id" }), { status: 400 });
    }

    const db = env.DB;
    // 使用软删除，仅将 is_deleted_by_user 置为 1，前提是该记录必须属于当前用户
    const result = await db.prepare(`
      UPDATE complaints 
      SET is_deleted_by_user = 1 
      WHERE id = ? AND user_id = ?
    `).bind(complaintId, userId).run();

    if (result.meta?.changes === 0) {
      return new Response(JSON.stringify({ error: "Not found or not authorized" }), { status: 404 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (error: any) {
    console.error("【删除投诉报错】:", error.message);
    return new Response(JSON.stringify({ error: "服务器内部错误" }), { status: 500 });
  }
};
