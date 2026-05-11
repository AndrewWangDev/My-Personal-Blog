// src/utils/credentials.ts
// Utility to evaluate user credentials and enforce security invariants

export interface CredentialSummary {
  hasPassword: boolean;
  oauthProviders: string[];
  passkeyCount: number;
  totalCredentials: number;
  canUnbindOrDelete: boolean;
}

export async function getUserCredentialSummary(db: any, userId: string): Promise<CredentialSummary> {
  if (!db || !userId) {
    return {
      hasPassword: false,
      oauthProviders: [],
      passkeyCount: 0,
      totalCredentials: 0,
      canUnbindOrDelete: false
    };
  }

  // 1. Check password
  const user = await db.prepare('SELECT password_hash FROM users WHERE id = ?').bind(userId).first();
  const hasPassword = Boolean(user && user.password_hash);

  // 2. Check linked OAuth accounts
  const { results: oauthRows } = await db.prepare(
    'SELECT provider FROM user_oauth_accounts WHERE user_id = ?'
  ).bind(userId).all();
  const oauthProviders = (oauthRows || []).map((r: any) => r.provider);

  // 3. Check passkeys
  const passkeyRow = await db.prepare(
    'SELECT COUNT(*) as count FROM user_passkeys WHERE user_id = ?'
  ).bind(userId).first();
  const passkeyCount = Number(passkeyRow?.count || 0);

  // Total count of independent login methods
  const totalCredentials = (hasPassword ? 1 : 0) + oauthProviders.length + passkeyCount;
  const canUnbindOrDelete = totalCredentials > 1;

  return {
    hasPassword,
    oauthProviders,
    passkeyCount,
    totalCredentials,
    canUnbindOrDelete
  };
}

/**
 * Checks if a third-party account is already bound to ANOTHER user.
 * Returns true if conflict exists.
 */
export async function isOAuthBoundToAnotherUser(
  db: any,
  provider: string,
  providerUserId: string,
  currentUserId?: string
): Promise<{ conflict: boolean; ownerUserId?: string }> {
  const existing = await db.prepare(
    'SELECT user_id FROM user_oauth_accounts WHERE provider = ? AND provider_user_id = ?'
  ).bind(provider, String(providerUserId)).first();

  if (existing) {
    if (!currentUserId || existing.user_id !== currentUserId) {
      return { conflict: true, ownerUserId: existing.user_id };
    }
  }

  return { conflict: false };
}
