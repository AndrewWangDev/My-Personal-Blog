import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";
import { getUserCredentialSummary } from '../../../../utils/credentials';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "未授权，请先登录" }), { status: 401 });
  }

  try {
    const { provider } = await request.json();
    if (!provider || !['google', 'github'].includes(provider)) {
      return new Response(JSON.stringify({ error: "无效的解绑目标" }), { status: 400 });
    }

    const db = (env as any).DB;
    if (!db) {
      return new Response(JSON.stringify({ error: "数据库连接异常" }), { status: 500 });
    }

    // 1. 安全硬约束：没有其他验证方式时不允许解绑（防孤岛死号）
    const summary = await getUserCredentialSummary(db, locals.user.id);

    if (!summary.canUnbindOrDelete) {
      return new Response(JSON.stringify({ 
        error: "无法解绑：这是您当前唯一的登录方式。为了账号安全，请先设置登录密码或添加其他登录凭据后再尝试解绑。",
        code: "UNBIND_FORBIDDEN_LAST_CREDENTIAL"
      }), { status: 400 });
    }

    // 2. 执行解绑
    const result = await db.prepare(
      'DELETE FROM user_oauth_accounts WHERE user_id = ? AND provider = ?'
    ).bind(locals.user.id, provider).run();

    const rowsAffected = result.meta?.changes ?? result.changes ?? 0;
    if (rowsAffected > 0) {
      return new Response(JSON.stringify({ 
        success: true, 
        message: `${provider === 'google' ? 'Google' : 'GitHub'} 账号已成功解绑` 
      }), { status: 200 });
    } else {
      return new Response(JSON.stringify({ error: "该账号尚未绑定，无需解绑" }), { status: 404 });
    }

  } catch (error: any) {
    console.error("OAuth unbind error:", error);
    return new Response(JSON.stringify({ error: error.message || "解绑失败" }), { status: 500 });
  }
};
