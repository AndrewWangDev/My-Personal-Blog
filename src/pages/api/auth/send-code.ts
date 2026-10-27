import type { APIRoute } from 'astro';
import { env as cfEnv } from "cloudflare:workers";
import { isAllowedEmailDomain } from "../../../utils/validation";

const templates: Record<string, any> = {
  zh: {
    subject: '[Andrew Wang Dev] 您的注册验证码',
    greeting: '您好',
    welcome: '欢迎注册 Andrew Wang Dev 个人开发者门户。为完成注册，请输入以下验证码：',
    expiry: '该验证码将在 <strong>5 分钟</strong> 内过期。',
    ignore: '如果您并没有尝试注册，请安全地忽略此邮件。',
    footer: '此为系统自动发送的邮件，请勿直接回复。',
    text_welcome: '欢迎注册 Andrew Wang Dev 个人开发者门户。\n\n您的注册验证码是：\n\n{otp}\n\n该验证码将在 5 分钟内过期。\n如果您并没有尝试注册，请安全地忽略此邮件。\n\n© 2026 Andrew Wang.'
  },
  'zh-tw': {
    subject: '[Andrew Wang Dev] 您的註冊驗證碼',
    greeting: '您好',
    welcome: '歡迎註冊 Andrew Wang Dev 個人開發者門戶。為完成註冊，請輸入以下驗證碼：',
    expiry: '該驗證碼將在 <strong>5 分鐘</strong> 內過期。',
    ignore: '如果您並沒有嘗試註冊，請安全地忽略此郵件。',
    footer: '此為系統自動發送的郵件，請勿直接回覆。',
    text_welcome: '歡迎註冊 Andrew Wang Dev 個人開發者門戶。\n\n您的註冊驗證碼是：\n\n{otp}\n\n該驗證碼將在 5 分鐘內過期。\n如果您並沒有嘗試註冊，請安全地忽略此郵件。\n\n© 2026 Andrew Wang.'
  },
  en: {
    subject: '[Andrew Wang Dev] Your Registration Code',
    greeting: 'Hello',
    welcome: 'Welcome to the Andrew Wang Dev Portal. To complete your registration, please enter the following code:',
    expiry: 'This code will expire in <strong>5 minutes</strong>.',
    ignore: "If you didn't attempt to register, please safely ignore this email.",
    footer: 'This is an automated email, please do not reply.',
    text_welcome: 'Welcome to the Andrew Wang Dev Portal.\n\nYour registration code is:\n\n{otp}\n\nThis code will expire in 5 minutes.\nIf you did not attempt to register, please safely ignore this email.\n\n© 2026 Andrew Wang.'
  },
  ja: {
    subject: '[Andrew Wang Dev] 登録認証コード',
    greeting: 'こんにちは',
    welcome: 'Andrew Wang Dev ポータルへようこそ。登録を完了するには、以下の認証コードを入力してください：',
    expiry: 'このコードの有効期限は <strong>5 分</strong> です。',
    ignore: '登録を試みていない場合は、このメールを無視してください。',
    footer: 'これは自動送信メールです。返信しないでください。',
    text_welcome: 'Andrew Wang Dev ポータルへようこそ。\n\n登録認証コードは：\n\n{otp}\n\nこのコードの有効期限は 5 分です。\n登録を試みていない場合は、このメールを無視してください。\n\n© 2026 Andrew Wang.'
  },
  de: {
    subject: '[Andrew Wang Dev] Ihr Registrierungscode',
    greeting: 'Hallo',
    welcome: 'Willkommen im Andrew Wang Dev Portal. Um Ihre Registrierung abzuschließen, geben Sie bitte den folgenden Code ein:',
    expiry: 'Dieser Code läuft in <strong>5 Minuten</strong> ab.',
    ignore: 'Wenn Sie nicht versucht haben, sich zu registrieren, ignorieren Sie diese E-Mail bitte.',
    footer: 'Dies ist eine automatische E-Mail, bitte antworten Sie nicht.',
    text_welcome: 'Willkommen im Andrew Wang Dev Portal.\n\nIhr Registrierungscode ist:\n\n{otp}\n\nDieser Code läuft in 5 Minuten ab.\nWenn Sie nicht versucht haben, sich zu registrieren, ignorieren Sie diese E-Mail bitte.\n\n© 2026 Andrew Wang.'
  }
};

export const POST: APIRoute = async (context) => {
  const { request, cookies, locals } = context;
  try {
    const body = await request.json();
    const { email, turnstileResponse } = body;
    if (!email) return new Response(JSON.stringify({ error: "邮箱不能为空" }), { status: 400 });
    if (!isAllowedEmailDomain(email)) return new Response(JSON.stringify({ error: "仅支持 Gmail, Outlook, Yahoo, Hotmail, iCloud, Proton 邮箱，请更换重试" }), { status: 400 });
    if (!turnstileResponse) return new Response(JSON.stringify({ error: "请先完成人机验证" }), { status: 400 });

    const db = (cfEnv as any).DB;
    if (!db) return new Response(JSON.stringify({ error: "数据库连接失败" }), { status: 500 });
    
    const domain = email.split('@')[1]?.toLowerCase();
    const lang = cookies.get('lang')?.value || 'zh';
    const t = templates[lang] || templates.zh;

    // 0. Verify Turnstile
    const verifyData = new FormData();
    const turnstileSecret = (import.meta.env as any).TURNSTILE_SECRET_KEY || (cfEnv as any).TURNSTILE_SECRET_KEY;
    verifyData.append('secret', turnstileSecret);
    verifyData.append('response', turnstileResponse);
    
    const turnstileCheck = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyData,
    });
    const turnstileOutcome = await turnstileCheck.json() as any;
    if (!turnstileOutcome.success) {
      return new Response(JSON.stringify({ error: "人机验证失效，请刷新重试" }), { status: 400 });
    }

    // 1. 获取动态限制 (带容错)
    const settings: Record<string, number> = {};
    try {
      const response = await db.prepare("SELECT key, value FROM settings WHERE key LIKE 'email_%'").all();
      if (response && response.results) {
        response.results.forEach((row: any) => {
          settings[row.key] = parseInt(row.value);
        });
      }
    } catch (e) {
      console.warn("Failed to load settings, using defaults:", e);
    }

    const monthlyLimit = settings['email_monthly_limit'] || 800;
    const dailyLimit = settings['email_daily_limit'] || 30;
    const hourlyLimit = settings['email_hourly_limit'] || 10;
    const userDailyLimit = settings['email_user_daily_limit'] || 3;
    const domainDailyLimit = settings['email_domain_daily_limit'] || 20;

    // 2. 频率限制检查
    const monthlyTotalRow = await db.prepare("SELECT count(*) as count FROM email_logs WHERE created_at > datetime('now', '-1 month')").first() as any;
    const monthlyTotal = monthlyTotalRow?.count || 0;
    if (monthlyTotal >= monthlyLimit) return new Response(JSON.stringify({ error: "系统繁忙，请使用其他注册方式" }), { status: 429 });

    const dailyTotalRow = await db.prepare("SELECT count(*) as count FROM email_logs WHERE created_at > datetime('now', '-1 day')").first() as any;
    const dailyTotal = dailyTotalRow?.count || 0;
    if (dailyTotal >= dailyLimit) return new Response(JSON.stringify({ error: "系统繁忙，请使用其他注册方式" }), { status: 429 });

    const hourlyTotalRow = await db.prepare("SELECT count(*) as count FROM email_logs WHERE created_at > datetime('now', '-1 hour')").first() as any;
    const hourlyTotal = hourlyTotalRow?.count || 0;
    if (hourlyTotal >= hourlyLimit) return new Response(JSON.stringify({ error: "系统繁忙，请使用其他注册方式" }), { status: 429 });

    const userDailyRow = await db.prepare("SELECT count(*) as count FROM email_logs WHERE email = ? AND created_at > datetime('now', '-1 day')").bind(email).first() as any;
    const userDaily = userDailyRow?.count || 0;
    if (userDaily >= userDailyLimit) return new Response(JSON.stringify({ error: "该邮箱今日发送次数已达上限" }), { status: 429 });

    const domainDailyRow = await db.prepare("SELECT count(*) as count FROM email_logs WHERE domain = ? AND created_at > datetime('now', '-1 day')").bind(domain).first() as any;
    const domainDaily = domainDailyRow?.count || 0;
    if (domainDaily >= domainDailyLimit) return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试" }), { status: 429 });

    // 3. 生成密码学安全验证码 (CSPRNG 6 位数字)
    const randomBuffer = new Uint32Array(1);
    crypto.getRandomValues(randomBuffer);
    const otp = (100000 + (randomBuffer[0] % 900000)).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5分钟有效

    // 4. 发送邮件 (Resend API)
    const resendApiKey = (cfEnv as any).RESEND_API_KEY;
    if (!resendApiKey) return new Response(JSON.stringify({ error: "邮件服务配置错误" }), { status: 500 });

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Andrew Wang Dev <noreply@andrewwangdev.com>',
        to: [email],
        subject: t.subject,
        text: t.text_welcome.replace('{otp}', otp).replace('{email}', email),
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="background-color: #2563eb; padding: 24px 32px; text-align: left;">
              <span style="color: #ffffff; font-size: 26px; font-weight: bold; letter-spacing: 0.5px;">Andrew Wang Dev</span>
            </div>
            <div style="padding: 40px 32px; background-color: #ffffff;">
              <p style="font-size: 16px; color: #374151; margin-bottom: 16px; margin-top: 0;">${t.greeting} <a href="mailto:${email}" style="color: #2563eb; text-decoration: none;">${email}</a>，</p>
              <p style="font-size: 16px; color: #374151; line-height: 1.6; margin-bottom: 32px;">${t.welcome}</p>
              <div style="margin: 32px 0;">
                <span style="font-size: 42px; font-weight: 700; color: #111827; letter-spacing: 12px;">${otp}</span>
              </div>
              <p style="font-size: 15px; color: #4b5563; margin-bottom: 8px;">${t.expiry}</p>
              <p style="font-size: 15px; color: #4b5563; margin-top: 0;">${t.ignore}</p>
            </div>
            <div style="background-color: #f9fafb; padding: 24px 32px; text-align: left; border-top: 1px solid #e5e7eb;">
              <p style="font-size: 12px; color: #6b7280; margin: 0;">&copy; 2026 Andrew Wang. All rights reserved.</p>
              <p style="font-size: 12px; color: #9ca3af; margin: 6px 0 0 0;">${t.footer}</p>
            </div>
          </div>
        `
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.json();
      console.error("Resend API Error:", err);
      return new Response(JSON.stringify({ error: "邮件发送失败，请稍后重试" }), { status: 500 });
    }

    await db.batch([
      db.prepare("INSERT OR REPLACE INTO email_verifications (email, code, expires_at) VALUES (?, ?, ?)").bind(email, otp, expiresAt),
      db.prepare("INSERT INTO email_logs (email, domain) VALUES (?, ?)").bind(email, domain)
    ]);

    return new Response(JSON.stringify({ success: true }));

  } catch (error: any) {
    console.error("Send code error:", error);
    return new Response(JSON.stringify({ error: "系统繁忙，请稍后再试: " + (error.message || "") }), { status: 500 });
  }
};
