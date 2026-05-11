import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const data = await request.json();
    const { age, bio } = data;

    // 基础验证
    const ageNum = parseInt(age, 10);
    if (age && (isNaN(ageNum) || ageNum < 0 || ageNum > 150)) {
      return new Response(JSON.stringify({ error: '年龄不合法' }), { status: 400 });
    }



    // 防注入处理
    const safeBio = bio ? String(bio).replace(/</g, "&lt;").replace(/>/g, "&gt;").substring(0, 500) : '';

    const db = env.DB;
    if (!db) {
      throw new Error("DB not found");
    }

    await db.prepare('UPDATE users SET age = ?, bio = ? WHERE id = ?')
      .bind(age ? String(ageNum) : null, safeBio, locals.user.id)
      .run();

    return new Response(JSON.stringify({ success: true, message: '个人信息已更新' }), { status: 200 });
  } catch (err: any) {
    console.error('Update profile error:', err);
    return new Response(JSON.stringify({ error: '服务器内部错误' }), { status: 500 });
  }
};
