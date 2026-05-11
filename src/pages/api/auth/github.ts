import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";
import { isOAuthBoundToAnotherUser } from '../../../utils/credentials';
import { createSignedSession, verifySignedSession, DEFAULT_SESSION_SECRET } from '../../../utils/session';

// Helper to process GitHub user profile and execute 4-step state machine
async function processGitHubAuth(githubToken: string, currentSessionId: string | undefined, action: string | undefined, db: any, cookies: any, sessionSecret: string, verifiedUserId?: string | null) {
  // 1. Fetch GitHub User Profile
  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'User-Agent': 'AndrewWangDev-Website',
      'Accept': 'application/vnd.github.v3+json'
    }
  });
  if (!userRes.ok) {
    throw new Error('获取 GitHub 用户信息失败');
  }
  const githubUser = await userRes.json();
  const githubId = String(githubUser.id);
  const githubUsername = githubUser.login || 'GitHubUser';

  // 2. Fetch GitHub Verified Emails
  const emailsRes = await fetch('https://api.github.com/user/emails', {
    headers: {
      'Authorization': `Bearer ${githubToken}`,
      'User-Agent': 'AndrewWangDev-Website',
      'Accept': 'application/vnd.github.v3+json'
    }
  });

  let primaryVerifiedEmail = '';
  if (emailsRes.ok) {
    const emails = await emailsRes.json();
    if (Array.isArray(emails)) {
      // Find primary verified email first
      const primary = emails.find((e: any) => e.primary && e.verified);
      if (primary && primary.email) {
        primaryVerifiedEmail = primary.email.trim();
      } else {
        // Fallback to any verified email
        const anyVerified = emails.find((e: any) => e.verified);
        if (anyVerified && anyVerified.email) {
          primaryVerifiedEmail = anyVerified.email.trim();
        }
      }
    }
  }

  // Fallback to user.email if verified
  if (!primaryVerifiedEmail && githubUser.email) {
    primaryVerifiedEmail = githubUser.email.trim();
  }

  // 规则 (1): 如果第三方账号邮箱没有被验证/没有邮箱，那么拦截，不允许绑定、也不允许通过它登录/注册
  if (!primaryVerifiedEmail) {
    return {
      status: 403,
      data: { error: "GitHub 账号未提供已验证的有效电子邮箱，已被系统拦截，无法绑定或登录" }
    };
  }

  // A. 如果是已登录用户在个人中心发起【绑定 GitHub】
  const validUserId = verifiedUserId || (currentSessionId ? await verifySignedSession(currentSessionId, sessionSecret) : null);
  if (action === 'bind' && validUserId) {
    const currentUser = await db.prepare('SELECT id FROM users WHERE id = ?').bind(validUserId).first();
    if (!currentUser) {
      return { status: 401, data: { error: "登录已失效，请重新登录" } };
    }

    // 检查该 GitHub ID 是否已被其他账号绑定（不允许覆盖绑定）
    const conflictCheck = await isOAuthBoundToAnotherUser(db, 'github', githubId, currentUser.id);
    if (conflictCheck.conflict) {
      return { 
        status: 409, 
        data: { error: "该 GitHub 账号已被其他用户绑定，不允许覆盖绑定" } 
      };
    }

    await db.prepare(`
      INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, provider_email)
      VALUES (?, 'github', ?, ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET 
        provider_user_id = excluded.provider_user_id,
        provider_email = excluded.provider_email
    `).bind(currentUser.id, githubId, primaryVerifiedEmail).run();

    return { 
      status: 200, 
      data: { success: true, message: "GitHub 账号绑定成功" } 
    };
  }

  // B. 第三方登录 / 注册四步状态机

  // 规则 (2): 检查用户 ID 是否关联到某一个账号？若已经关联，使用关联账号登录
  const linkedAccount = await db.prepare(
    'SELECT user_id FROM user_oauth_accounts WHERE provider = ? AND provider_user_id = ?'
  ).bind('github', githubId).first();

  if (linkedAccount) {
    const user = await db.prepare('SELECT id, username, role FROM users WHERE id = ?').bind(linkedAccount.user_id).first();
    if (user) {
      const sessionToken = await createSignedSession(user.id, sessionSecret);
      cookies.set('user_session', sessionToken, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7
      });
      return { status: 200, data: { success: true, message: "GitHub 登录成功", user } };
    }
  }

  // 规则 (3): 如果没有关联，检查用户邮箱是否为某一个账号的邮箱？若是，使用此账号登录；并将第三方账号ID绑定到此账号
  const userByEmail = await db.prepare('SELECT id, username, role FROM users WHERE email = ?').bind(primaryVerifiedEmail).first();

  if (userByEmail) {
    const conflictCheck = await isOAuthBoundToAnotherUser(db, 'github', githubId, userByEmail.id);
    if (conflictCheck.conflict) {
      return { 
        status: 409, 
        data: { error: "该 GitHub 账号已被其他用户关联，无法合并登录" } 
      };
    }

    await db.prepare(`
      INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, provider_email)
      VALUES (?, 'github', ?, ?)
      ON CONFLICT(user_id, provider) DO UPDATE SET 
        provider_user_id = excluded.provider_user_id,
        provider_email = excluded.provider_email
    `).bind(userByEmail.id, githubId, primaryVerifiedEmail).run();

    const sessionToken = await createSignedSession(userByEmail.id, sessionSecret);
    cookies.set('user_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    return { 
      status: 200, 
      data: { success: true, message: "GitHub 登录成功并已自动关联账户", user: userByEmail } 
    };
  }

  // 规则 (4): 如果不是，使用该邮箱注册一个新账号，将第三方账号 ID 绑定到此账号
  const newUserId = crypto.randomUUID();

  await db.batch([
    db.prepare(`
      INSERT INTO users (id, username, email, role, created_at)
      VALUES (?, ?, ?, 'user', CURRENT_TIMESTAMP)
    `).bind(newUserId, githubUsername, primaryVerifiedEmail),
    db.prepare(`
      INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, provider_email)
      VALUES (?, 'github', ?, ?)
    `).bind(newUserId, githubId, primaryVerifiedEmail)
  ]);

  const newUser = { id: newUserId, username: githubUsername, role: 'user' };

  const sessionToken = await createSignedSession(newUser.id, sessionSecret);
  cookies.set('user_session', sessionToken, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7
  });

  return { 
    status: 201, 
    data: { success: true, message: "GitHub 注册并登录成功", user: newUser } 
  };
}

export const GET: APIRoute = async ({ request, cookies, redirect, locals }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const action = url.searchParams.get('action') || '';
  const clientId = (env as any).GITHUB_CLIENT_ID || import.meta.env.PUBLIC_GITHUB_CLIENT_ID;
  const clientSecret = (env as any).GITHUB_CLIENT_SECRET;

  // 1. If no code provided, redirect to GitHub authorization
  if (!code) {
    if (!clientId) {
      return new Response("GitHub Client ID 未配置", { status: 500 });
    }
    const state = crypto.randomUUID();
    cookies.set('github_oauth_state', state, { path: '/', maxAge: 600, httpOnly: true, secure: true });
    if (action) {
      cookies.set('github_oauth_action', action, { path: '/', maxAge: 600, httpOnly: true, secure: true });
    }

    const redirectUri = `${url.origin}/api/auth/github`;
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=user:email&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
    return redirect(githubAuthUrl, 302);
  }

  // 2. Validate state parameter to prevent OAuth CSRF / account hijacking
  const state = url.searchParams.get('state');
  const savedState = cookies.get('github_oauth_state')?.value;
  cookies.delete('github_oauth_state', { path: '/' });

  const cookieAction = cookies.get('github_oauth_action')?.value || action;
  if (!state || !savedState || state !== savedState) {
    const errorMsg = 'OAuth 验证状态已失效或存在安全风险，请重新登录';
    const target = cookieAction === 'bind' ? '/account?error=' : '/login?error=';
    return redirect(target + encodeURIComponent(errorMsg), 302);
  }

  // 3. Exchange code for access token
  try {
    if (!clientSecret || !clientId) {
      return redirect('/login?error=' + encodeURIComponent('GitHub OAuth 未完成密钥配置'), 302);
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error || !tokenData.access_token) {
      return redirect('/login?error=' + encodeURIComponent('GitHub 授权失败: ' + (tokenData.error_description || tokenData.error)), 302);
    }

    const db = (env as any).DB;
    const sessionSecret = (env as any).SESSION_SECRET || DEFAULT_SESSION_SECRET;
    const currentSessionId = cookies.get('user_session')?.value;
    const cookieAction = cookies.get('github_oauth_action')?.value || action;

    const result = await processGitHubAuth(tokenData.access_token, currentSessionId, cookieAction, db, cookies, sessionSecret, locals.user?.id);

    if (result.status >= 400) {
      const errTarget = cookieAction === 'bind' ? '/account?error=' : '/login?error=';
      return redirect(errTarget + encodeURIComponent(result.data.error || 'GitHub 认证失败'), 302);
    }

    if (cookieAction === 'bind') {
      return redirect('/account?success=' + encodeURIComponent('GitHub 绑定成功'), 302);
    }

    return redirect('/', 302);
  } catch (err: any) {
    console.error('GitHub OAuth Callback Error:', err);
    return redirect('/login?error=' + encodeURIComponent(err.message || '内部服务错误'), 302);
  }
};

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  try {
    const { code, state, action } = await request.json();
    if (!code) {
      return new Response(JSON.stringify({ error: "缺少 GitHub 授权 Code" }), { status: 400 });
    }

    // 严格校验 State 防范 CSRF
    const savedState = cookies.get('github_oauth_state')?.value;
    cookies.delete('github_oauth_state', { path: '/' });
    if (!state || !savedState || state !== savedState) {
      return new Response(JSON.stringify({ error: "OAuth State 状态不匹配或已失效，请重新登录" }), { status: 400 });
    }

    const clientId = (env as any).GITHUB_CLIENT_ID || import.meta.env.PUBLIC_GITHUB_CLIENT_ID;
    const clientSecret = (env as any).GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: "服务器 GitHub OAuth 配置未就绪" }), { status: 500 });
    }

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code })
    });

    const tokenData = await tokenRes.json();
    if (tokenData.error || !tokenData.access_token) {
      return new Response(JSON.stringify({ error: tokenData.error_description || "换取 Token 失败" }), { status: 401 });
    }

    const db = (env as any).DB;
    const sessionSecret = (env as any).SESSION_SECRET || DEFAULT_SESSION_SECRET;
    const currentSessionId = cookies.get('user_session')?.value;

    const result = await processGitHubAuth(tokenData.access_token, currentSessionId, action, db, cookies, sessionSecret, locals.user?.id);
    return new Response(JSON.stringify(result.data), { status: result.status });
  } catch (error: any) {
    console.error("GitHub Auth Error:", error);
    return new Response(JSON.stringify({ error: error.message || "服务器内部错误" }), { status: 500 });
  }
};
