// Single-admin gate, shared by the dashboard's Trade/Journal phases and the /admin panel.
// Kept in one place so the admin email is never duplicated as an inline string literal.
export const ADMIN_EMAIL = 'jishnu@ziovy.com'

export function isAdminEmail(email: string | null | undefined): boolean {
  return email === ADMIN_EMAIL
}
