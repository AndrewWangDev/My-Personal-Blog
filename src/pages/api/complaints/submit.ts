import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const userId = locals.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "请先登录" }), { status: 401 });
    }

    const data = await request.formData();
    const targetType = data.get('target_type') as string;
    const targetId = data.get('target_id') as string;
    const reason = data.get('reason') as string;
    const details = data.get('details') as string;
    const turnstileResponse = data.get('cf-turnstile-response') as string;

    if (!targetType || !targetId || !reason || !details) {
      return new Response(JSON.stringify({ error: "请填写完整投诉信息" }), { status: 400 });
    }

    if (!turnstileResponse) {
      return new Response(JSON.stringify({ error: "请完成人机验证" }), { status: 400 });
    }

    // 1. 验证 Turnstile (使用官方推荐的 URLSearchParams 格式与客户端 IP)
    const turnstileSecret = (env as any).TURNSTILE_SECRET_KEY;
    if (!turnstileSecret) {
      return new Response(JSON.stringify({ error: "服务器安全配置未就绪 (Missing Turnstile Secret)" }), { status: 500 });
    }
    const verifyParams = new URLSearchParams();
    verifyParams.append('secret', turnstileSecret);
    verifyParams.append('response', turnstileResponse);
    const clientIp = request.headers.get('CF-Connecting-IP') || '';
    if (clientIp) verifyParams.append('remoteip', clientIp);

    const turnstileCheck = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: verifyParams,
    });
    const turnstileOutcome = await turnstileCheck.json();
    if (!turnstileOutcome.success) {
      return new Response(JSON.stringify({ error: "人机验证未通过，请重试" }), { status: 400 });
    }

    const db = env.DB;
    
    // 2. 获取每日限制额度
    const settings = await db.prepare("SELECT key, value FROM settings WHERE key IN ('max_user_complaints_daily', 'max_total_complaints_daily')").all();
    let maxUserDaily = 5;
    let maxTotalDaily = 100;
    
    settings.results?.forEach((s: any) => {
      if (s.key === 'max_user_complaints_daily') maxUserDaily = parseInt(s.value, 10);
      if (s.key === 'max_total_complaints_daily') maxTotalDaily = parseInt(s.value, 10);
    });

    // 3. 检查单人额度
    const userDailyCountRow = await db.prepare("SELECT COUNT(*) as count FROM complaints WHERE user_id = ? AND date(created_at) = date('now')").bind(userId).first() as { count: number };
    const userDailyCount = userDailyCountRow ? userDailyCountRow.count : 0;
    
    if (userDailyCount >= maxUserDaily) {
       return new Response(JSON.stringify({ error: "limit_exceeded" }), { status: 403 });
    }

    // 4. 检查总额度
    const totalDailyCountRow = await db.prepare("SELECT COUNT(*) as count FROM complaints WHERE date(created_at) = date('now')").first() as { count: number };
    const totalDailyCount = totalDailyCountRow ? totalDailyCountRow.count : 0;
    
    if (totalDailyCount >= maxTotalDaily) {
       return new Response(JSON.stringify({ error: "limit_exceeded" }), { status: 403 });
    }

    // 5. 插入投诉记录
    await db.prepare(
      'INSERT INTO complaints (user_id, target_type, target_id, reason, details) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, targetType, targetId, reason, details).run();

    return new Response(JSON.stringify({ success: true }), { status: 200 });

  } catch (error: any) {
    console.error("【投诉提交报错】:", error.message);
    return new Response(JSON.stringify({ error: "提交失败，请稍后重试" }), { status: 500 });
  }
};
