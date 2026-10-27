// src/utils/validation.ts

export const ALLOWED_EMAIL_DOMAINS = [
  'gmail.com',
  'outlook.com',
  'yahoo.com',
  'hotmail.com',
  'icloud.com',
  'proton.me'
];

export function isAllowedEmailDomain(email: string): boolean {
  if (!email || !email.includes('@')) return false;
  const domain = email.split('@')[1]?.toLowerCase().trim();
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export function escapeHtml(str: any): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function validateUsername(username: string): { valid: boolean; error?: string } {
  const trimmed = (username || '').trim();
  if (!trimmed || trimmed.length < 2 || trimmed.length > 30) {
    return { valid: false, error: '用户名长度需在 2 到 30 个字符之间' };
  }
  // Allow letters, numbers, Chinese characters, underscores, hyphens
  if (!/^[a-zA-Z0-9_\u4e00-\u9fa5\s-]+$/.test(trimmed)) {
    return { valid: false, error: '用户名仅支持字母、数字、中文、下划线及连字符' };
  }
  return { valid: true };
}
