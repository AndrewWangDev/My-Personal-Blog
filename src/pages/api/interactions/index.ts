import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const targetType = url.searchParams.get('target_type');
  const targetId = url.searchParams.get('target_id');
  const userId = locals.user?.id;

  if (!targetType || !targetId) {
    return new Response(JSON.stringify({ error: "missing parameters" }), { status: 400 });
  }

  try {
    const db = env.DB;
    // 获取总点赞/收藏数
    const countResult = await db.prepare(`
      SELECT count(*) as total 
      FROM interactions 
      WHERE target_type = ? AND target_id = ?
    `).bind(targetType, targetId).first();

    // 检查当前用户是否已点赞/收藏
    let hasInteracted = false;
    if (userId) {
      const userResult = await db.prepare(`
        SELECT 1 FROM interactions 
        WHERE user_id = ? AND target_type = ? AND target_id = ?
      `).bind(userId, targetType, targetId).first();
      hasInteracted = !!userResult;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      total: countResult?.total || 0,
      hasInteracted
    }), { status: 200 });

  } catch (error) {
    console.error("Error fetching interactions:", error);
    return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试" }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.id) {
    return new Response(JSON.stringify({ error: "请先登录" }), { status: 401 });
  }
  const userId = locals.user.id;

  try {
    const { targetType, targetId } = await request.json();

    if (!targetType || !targetId) {
      return new Response(JSON.stringify({ error: "参数不完整" }), { status: 400 });
    }

    const db = env.DB;

    // 检查是否已存在
    const existing = await db.prepare(`
      SELECT id FROM interactions 
      WHERE user_id = ? AND target_type = ? AND target_id = ?
    `).bind(userId, targetType, targetId).first();

    if (existing) {
      // 如果已存在，则取消
      await db.prepare(`DELETE FROM interactions WHERE id = ?`).bind(existing.id).run();
      return new Response(JSON.stringify({ success: true, action: 'removed' }), { status: 200 });
    } else {
      // 如果不存在，则添加
      await db.prepare(`
        INSERT INTO interactions (user_id, target_type, target_id) 
        VALUES (?, ?, ?)
      `).bind(userId, targetType, targetId).run();
      return new Response(JSON.stringify({ success: true, action: 'added' }), { status: 200 });
    }

  } catch (error) {
    console.error("Error updating interaction:", error);
    return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试" }), { status: 500 });
  }
};
