import type { APIRoute } from "astro";
import { env as cfEnv } from "cloudflare:workers";

export const GET: APIRoute = async (context) => {
  const { locals } = context;
  
  // 1. 权限校验
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    // Astro v6 严禁访问 locals.runtime.env，必须通过 cloudflare:workers 引入
    const db = (cfEnv as any).DB;
    
    if (!db) {
      console.error("D1 Binding 'DB' not found in cloudflare:workers env");
      return new Response(JSON.stringify({ error: "数据库绑定未找到，请检查 wrangler.json 配置" }), { status: 500 });
    }

    // 3. 执行查询
    // 注意：如果是新数据库，settings 表可能不存在，这里增加自动创建逻辑以增强鲁棒性
    try {
      const response = await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'email_%' OR key LIKE 'max_%_complaints_daily'").all();
      
      const settings: Record<string, string> = {};
      if (response && response.results) {
        response.results.forEach((row: any) => {
          settings[row.key] = row.value;
        });
      }
      
      return new Response(JSON.stringify({ success: true, settings }));
    } catch (dbError: any) {
      if (dbError.message?.includes("no such table: settings")) {
        // 如果表不存在，返回空设置并引导初始化
        return new Response(JSON.stringify({ success: true, settings: {}, message: "Settings table not initialized" }));
      }
      throw dbError;
    }

  } catch (error: any) {
    console.error("Admin Settings GET Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), { status: 500 });
  }
};

export const POST: APIRoute = async (context) => {
  const { locals, request } = context;
  
  if (!locals.user || locals.user.role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const { settings } = body;
    if (!settings) return new Response(JSON.stringify({ error: 'Missing settings data' }), { status: 400 });

    const db = (cfEnv as any).DB;
    if (!db) return new Response(JSON.stringify({ error: "数据库绑定未找到" }), { status: 500 });

    // 确保表存在
    await db.prepare("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)").run();

    const statements = Object.entries(settings).map(([key, value]) => {
      return db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, String(value));
    });

    if (statements.length > 0) {
      await db.batch(statements);
    }
    return new Response(JSON.stringify({ success: true, message: '设置已保存' }));
  } catch (error: any) {
    console.error("Admin Settings POST Error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal Server Error" }), { status: 500 });
  }
};
