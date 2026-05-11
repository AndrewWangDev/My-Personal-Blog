import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const GET: APIRoute = async ({ request, locals }) => {
  const url = new URL(request.url);
  const postId = url.searchParams.get('post_id');
  const currentUserId = locals.user?.id || '';

  if (!postId) {
    return new Response(JSON.stringify({ error: "post_id is required" }), { status: 400 });
  }

  try {
    const db = env.DB;
    // 获取评论列表及其用户信息和点赞信息（不暴露用户原生数据库 UUID）
    const { results } = await db.prepare(`
      SELECT c.id, c.content, c.created_at, c.parent_id, c.is_deleted, u.username,
             (c.user_id = ?) as is_own,
             (SELECT count(*) FROM interactions WHERE target_type = 'comment_like' AND target_id = c.id) as like_count,
             EXISTS(SELECT 1 FROM interactions WHERE target_type = 'comment_like' AND target_id = c.id AND user_id = ?) as has_liked
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.post_id = ?
      ORDER BY c.created_at ASC
    `).bind(currentUserId, currentUserId, postId).all();

    // 组装成父子结构
    const comments: any[] = [];
    const map = new Map();

    (results || []).forEach(row => {
      const isDeleted = !!row.is_deleted;
      const comment = { 
        id: row.id,
        content: isDeleted ? "This comment has been deleted." : row.content,
        username: isDeleted ? "System Admin" : row.username,
        created_at: row.created_at,
        parent_id: row.parent_id,
        is_deleted: isDeleted,
        is_own: !!row.is_own,
        like_count: row.like_count || 0,
        has_liked: !!row.has_liked,
        replies: [] 
      };
      map.set(row.id, comment);
      if (row.parent_id) {
        const parent = map.get(row.parent_id);
        if (parent) {
          parent.replies.push(comment);
        }
      } else {
        comments.push(comment);
      }
    });

    return new Response(JSON.stringify({ success: true, comments }), { status: 200 });
  } catch (error) {
    console.error("Error fetching comments:", error);
    return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试" }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.id) {
    return new Response(JSON.stringify({ error: "请先登录" }), { status: 401 });
  }
  const userId = locals.user.id;

  try {
    const { postId, content, parentId } = await request.json();

    if (!postId || !content) {
      return new Response(JSON.stringify({ error: "参数不完整" }), { status: 400 });
    }

    // TODO: 实现 KV 频率限制 (防刷)
    
    const db = env.DB;
    await db.prepare(`
      INSERT INTO comments (post_id, user_id, parent_id, content) 
      VALUES (?, ?, ?, ?)
    `).bind(postId, userId, parentId || null, content).run();

    return new Response(JSON.stringify({ success: true, message: "评论成功" }), { status: 200 });
  } catch (error) {
    console.error("Error posting comment:", error);
    return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试" }), { status: 500 });
  }
};
