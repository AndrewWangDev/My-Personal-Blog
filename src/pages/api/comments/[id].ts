import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const DELETE: APIRoute = async ({ params, request, locals }) => {
  const { id } = params;
  if (!id) return new Response(JSON.stringify({ error: "Missing ID" }), { status: 400 });

  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const db = env.DB;
    
    const comment = await db.prepare('SELECT user_id FROM comments WHERE id = ?').bind(id).first();
    if (!comment) return new Response(JSON.stringify({ error: "Comment not found" }), { status: 404 });

    // Admin can delete any comment. Owner can delete their own comment.
    if (user.role !== 'admin' && comment.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden: Not your comment" }), { status: 403 });
    }

    // Check for hard delete flag (admin only)
    const url = new URL(request.url);
    const isHardDelete = url.searchParams.get('hard') === 'true';

    if (isHardDelete && user.role === 'admin') {
      // Physical delete
      const { success } = await db.prepare('DELETE FROM comments WHERE id = ?').bind(id).run();
      if (success) {
        return new Response(JSON.stringify({ success: true, message: "Comment permanently removed" }), { status: 200 });
      }
    } else {
      // Soft delete (default)
      const { success } = await db.prepare('UPDATE comments SET is_deleted = 1 WHERE id = ?').bind(id).run();
      if (success) {
        return new Response(JSON.stringify({ success: true, message: "Comment soft-deleted" }), { status: 200 });
      }
    }

    return new Response(JSON.stringify({ error: "Failed to perform deletion" }), { status: 500 });
  } catch (error) {
    console.error("Error deleting comment:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
};
