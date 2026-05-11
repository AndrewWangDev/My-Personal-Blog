import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ request }) => {
  try {
    // 1. Verify Secret Token
    const authHeader = request.headers.get('Authorization') || '';
    const customHeader = request.headers.get('x-cron-secret') || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    const providedSecret = bearerToken || customHeader;
    const expectedSecret = (env as any)?.CRON_SECRET;

    if (!expectedSecret) {
      return new Response(JSON.stringify({ error: "服务器内部定时任务密钥未配置" }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: "Unauthorized: Invalid secret key" }), { 
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 2. Parse payload
    const data = await request.json();
    const { title, author, thumbnail_url, cover_url, content } = data;

    if (!title || !content) {
      return new Response(JSON.stringify({ error: "Missing required fields: title and content are mandatory" }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const db = (env as any)?.DB;
    if (!db) {
      return new Response(JSON.stringify({ error: "Database connection unavailable" }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 3. Check for existing news to ensure idempotency
    const existing = await db.prepare('SELECT id FROM news WHERE title = ? LIMIT 1').bind(title.trim()).first();
    if (existing) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "News with this title already exists. Skipped.",
        skipped: true,
        id: existing.id
      }), { 
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // 4. Insert news into D1
    const finalAuthor = author || 'Andrew Wang Dev';
    const finalThumbnail = thumbnail_url || null;
    const finalCover = cover_url || finalThumbnail;

    const result = await db.prepare(`
      INSERT INTO news (title, author, thumbnail_url, cover_url, content)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      title.trim(),
      finalAuthor,
      finalThumbnail,
      finalCover,
      content.trim()
    ).run();

    if (result.success) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: "News published successfully", 
        id: result.meta?.last_row_id || null 
      }), { 
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } else {
      return new Response(JSON.stringify({ error: "Failed to insert news into database" }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  } catch (error: any) {
    console.error("Error in internal news ingestion API:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
