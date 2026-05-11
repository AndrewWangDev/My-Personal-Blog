import type { APIRoute } from 'astro';
import { env } from "cloudflare:workers";
import { getUserCredentialSummary } from '../../../../utils/credentials';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const db = (env as any).DB;
    if (!db) {
      return new Response(JSON.stringify({ error: "DB unavailable" }), { status: 500 });
    }

    const summary = await getUserCredentialSummary(db, locals.user.id);

    // Get detailed OAuth account records
    const { results: oauthAccounts } = await db.prepare(
      'SELECT provider, provider_email, created_at FROM user_oauth_accounts WHERE user_id = ?'
    ).bind(locals.user.id).all();

    return new Response(JSON.stringify({
      success: true,
      summary,
      accounts: oauthAccounts || []
    }), { status: 200 });

  } catch (err: any) {
    console.error("Fetch OAuth status error:", err);
    return new Response(JSON.stringify({ error: "Failed to fetch status" }), { status: 500 });
  }
};
