import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";
import { getUserCredentialSummary } from '../../../utils/credentials';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const db = (env as any).DB;
    if (!db) return new Response(JSON.stringify({ error: "DB error" }), { status: 500 });

    const { results } = await db.prepare(
      'SELECT id, name, created_at, last_used_at FROM user_passkeys WHERE user_id = ? ORDER BY created_at DESC'
    ).bind(locals.user.id).all();

    return new Response(JSON.stringify({ success: true, passkeys: results || [] }), { status: 200 });
  } catch (err: any) {
    console.error("Fetch passkeys error:", err);
    return new Response(JSON.stringify({ error: "获取通行密钥列表失败" }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const { id } = await request.json();
    if (!id) {
      return new Response(JSON.stringify({ error: "缺少通行密钥 ID" }), { status: 400 });
    }

    const db = (env as any).DB;
    if (!db) return new Response(JSON.stringify({ error: "DB error" }), { status: 500 });

    // 1. 安全硬约束：检查是否为最后唯一的有效验证方式
    const summary = await getUserCredentialSummary(db, locals.user.id);
    if (!summary.canUnbindOrDelete) {
      return new Response(JSON.stringify({ 
        error: "无法删除：这是您当前唯一的登录凭据。请先设置登录密码或绑定第三方账号后再删除。",
        code: "DELETE_FORBIDDEN_LAST_CREDENTIAL"
      }), { status: 400 });
    }

    // 2. 执行删除
    const result = await db.prepare(
      'DELETE FROM user_passkeys WHERE id = ? AND user_id = ?'
    ).bind(id, locals.user.id).run();

    const rowsAffected = result.meta?.changes ?? result.changes ?? 0;
    if (rowsAffected > 0) {
      return new Response(JSON.stringify({ success: true, message: "通行密钥已成功移除" }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ error: "未找到该通行密钥" }), { status: 404 });
    }

  } catch (err: any) {
    console.error("Delete passkey error:", err);
    return new Response(JSON.stringify({ error: err.message || "删除通行密钥失败" }), { status: 500 });
  }
};
