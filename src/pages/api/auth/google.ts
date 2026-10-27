import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";
import { isOAuthBoundToAnotherUser } from '../../../utils/credentials';
import { createSignedSession, verifySignedSession, getSessionSecret } from '../../../utils/session';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  try {
    const { credential, access_token, action } = await request.json();

    if (!credential && !access_token) {
      return new Response(JSON.stringify({ error: "缺少 Google 凭据" }), { status: 400 });
    }

    const googleClientId = import.meta.env.PUBLIC_GOOGLE_CLIENT_ID || (env as any).PUBLIC_GOOGLE_CLIENT_ID;
    if (!googleClientId) {
      return new Response(JSON.stringify({ error: "服务器 Google OAuth 配置未就绪" }), { status: 500 });
    }

    let email = '';
    let name = '';
    let googleId = '';
    let email_verified: any = false;

    if (credential) {
      // 1a. 向 Google 验证 ID Token
      const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`);
      const googleUser = await verifyRes.json();

      if (googleUser.error || googleUser.aud !== googleClientId) {
        return new Response(JSON.stringify({ error: "Google 身份验证失败或受众不匹配" }), { status: 401 });
      }

      email = googleUser.email;
      name = googleUser.name;
      googleId = googleUser.sub;
      email_verified = googleUser.email_verified;
    } else if (access_token) {
      // 1b. 向 Google 验证 Access Token (通过 Google OAuth2 Token Client 获得)
      const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${access_token}`);
      const tokenInfo = await tokenInfoRes.json();

      if (tokenInfo.error || (tokenInfo.aud !== googleClientId && tokenInfo.azp !== googleClientId)) {
        return new Response(JSON.stringify({ error: "Google 身份验证失败: " + (tokenInfo.error_description || tokenInfo.error || "Token 无效") }), { status: 401 });
      }

      email = tokenInfo.email || '';
      googleId = tokenInfo.sub || '';
      email_verified = tokenInfo.email_verified;

      // 尝试获取用户基本信息（昵称等）
      try {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { 'Authorization': `Bearer ${access_token}` }
        });
        if (userInfoRes.ok) {
          const userInfo = await userInfoRes.json();
          if (!email && userInfo.email) email = userInfo.email;
          if (!googleId && userInfo.sub) googleId = userInfo.sub;
          if (email_verified === undefined && userInfo.email_verified !== undefined) {
            email_verified = userInfo.email_verified;
          }
          name = userInfo.name || userInfo.given_name || '';
        }
      } catch (e) {
        // 非致命错误，忽略
      }
    }

    const isVerified = email_verified === true || email_verified === "true";

    // 规则 (1): 如果第三方账号邮箱没有被验证/没有邮箱，那么拦截，不允许绑定、也不允许通过它登录/注册
    if (!email || !isVerified) {
      return new Response(JSON.stringify({ 
        error: "Google 账号未提供已验证的有效电子邮箱，已被系统拦截，无法绑定或登录" 
      }), { status: 403 });
    }

    const db = (env as any).DB;
    if (!db) {
      return new Response(JSON.stringify({ error: "数据库连接不可用" }), { status: 500 });
    }

    const sessionSecret = getSessionSecret(env);
    const currentSessionId = cookies.get('user_session')?.value;
    let currentUserId = locals.user?.id;
    if (!currentUserId && currentSessionId) {
      currentUserId = await verifySignedSession(currentSessionId, sessionSecret);
    }

    // A. 如果是已登录用户在个人中心发起【绑定 Google】操作
    if (action === 'bind' && currentUserId) {
      // 检查当前会话用户是否存在
      const currentUser = await db.prepare('SELECT id FROM users WHERE id = ?').bind(currentUserId).first();
      if (!currentUser) {
        return new Response(JSON.stringify({ error: "登录已失效，请重新登录" }), { status: 401 });
      }

      // 检查该第三方 Google ID 是否已被其他账号绑定（不允许覆盖绑定）
      const conflictCheck = await isOAuthBoundToAnotherUser(db, 'google', googleId, currentUser.id);
      if (conflictCheck.conflict) {
        return new Response(JSON.stringify({ 
          error: "该 Google 账号已被其他用户绑定，不允许覆盖绑定" 
        }), { status: 409 });
      }

      // 写入绑定记录
      await db.prepare(`
        INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, provider_email)
        VALUES (?, 'google', ?, ?)
        ON CONFLICT(user_id, provider) DO UPDATE SET 
          provider_user_id = excluded.provider_user_id,
          provider_email = excluded.provider_email
      `).bind(currentUser.id, googleId, email).run();

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Google 账号绑定成功" 
      }), { status: 200 });
    }

    // B. 第三方登录 / 注册流程（未登录或普通 OAuth 授权）
    
    // 规则 (2): 检查用户 ID 是否关联到某一个账号？若已经关联，使用关联账号登录
    const linkedAccount = await db.prepare(
      'SELECT user_id FROM user_oauth_accounts WHERE provider = ? AND provider_user_id = ?'
    ).bind('google', googleId).first();

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

        return new Response(JSON.stringify({ 
          success: true, 
          message: "Google 登录成功", 
          user 
        }), { status: 200 });
      }
    }

    // 规则 (3): 如果没有关联，检查用户邮箱是否为某一个账号的邮箱？若是，使用此账号登录；并将第三方账号ID绑定到此账号
    const userByEmail = await db.prepare('SELECT id, username, role FROM users WHERE email = ?').bind(email).first();

    if (userByEmail) {
      // 检查该 Google ID 是否已经被别人绑定（防御性校验）
      const conflictCheck = await isOAuthBoundToAnotherUser(db, 'google', googleId, userByEmail.id);
      if (conflictCheck.conflict) {
        return new Response(JSON.stringify({ 
          error: "该 Google 账号已被其他用户关联，无法合并登录" 
        }), { status: 409 });
      }

      // 将 Google ID 绑定到此已有账号
      await db.prepare(`
        INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, provider_email)
        VALUES (?, 'google', ?, ?)
        ON CONFLICT(user_id, provider) DO UPDATE SET 
          provider_user_id = excluded.provider_user_id,
          provider_email = excluded.provider_email
      `).bind(userByEmail.id, googleId, email).run();

      const sessionToken = await createSignedSession(userByEmail.id, sessionSecret);
      cookies.set('user_session', sessionToken, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7
      });

      return new Response(JSON.stringify({ 
        success: true, 
        message: "Google 登录成功并已自动关联账户", 
        user: userByEmail 
      }), { status: 200 });
    }

    // 规则 (4): 如果不是，使用该邮箱注册一个新账号，将第三方账号 ID 绑定到此账号
    const newUserId = crypto.randomUUID();
    const newUsername = name || email.split('@')[0];

    await db.batch([
      db.prepare(`
        INSERT INTO users (id, username, email, role, created_at)
        VALUES (?, ?, ?, 'user', CURRENT_TIMESTAMP)
      `).bind(newUserId, newUsername, email),
      db.prepare(`
        INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, provider_email)
        VALUES (?, 'google', ?, ?)
      `).bind(newUserId, googleId, email)
    ]);

    const newUser = { id: newUserId, username: newUsername, role: 'user' };

    const sessionToken = await createSignedSession(newUser.id, sessionSecret);
    cookies.set('user_session', sessionToken, {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7
    });

    return new Response(JSON.stringify({ 
      success: true, 
      message: "注册并登录成功", 
      user: newUser 
    }), { status: 201 });

  } catch (error: any) {
    console.error("Google Auth Error:", error);
    return new Response(JSON.stringify({ error: error.message || "服务器内部错误" }), { status: 500 });
  }
};
