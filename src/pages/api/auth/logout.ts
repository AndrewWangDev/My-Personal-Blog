import type { APIRoute } from 'astro';

export const ALL: APIRoute = async ({ cookies, redirect, request }) => {
  cookies.delete('user_session', { path: '/' });
  cookies.delete('passkey_reg_ch', { path: '/' });
  cookies.delete('passkey_auth_ch', { path: '/' });
  cookies.delete('oauth_state_google', { path: '/' });
  cookies.delete('oauth_state_github', { path: '/' });

  if (request.method === 'GET') {
    return redirect('/login');
  }

  return new Response(JSON.stringify({ 
    success: true, 
    message: '已成功退出登录' 
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
