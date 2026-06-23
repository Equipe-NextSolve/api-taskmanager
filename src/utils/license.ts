export const GRACE_PERIOD_DAYS = 3;

/**
 * Calcula nova data de expiração após pagamento.
 *
 * Pagou DENTRO do período ativo → estende a partir do FIM do período atual
 * Pagou APÓS a expiração → estende a partir de AGORA
 *
 * Exemplo:
 *   Trial começa em 01/06 → expira em 01/07
 *   Pagamento em 15/06 → base = 01/07 → nova expiração = 01/08  ✓
 *   Pagamento em 10/07 (já expirou) → base = 10/07 → nova expiração = 09/08
 */
export function calculateNewExpiry(currentExpiresAt: Date, planDays = 30): Date {
  const now = new Date();
  const base = currentExpiresAt > now ? currentExpiresAt : now;
  return new Date(base.getTime() + planDays * 24 * 60 * 60 * 1000);
}

export function isWithinGracePeriod(expiresAt: Date): boolean {
  const now = new Date();
  const graceEnd = new Date(expiresAt.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  return now > expiresAt && now <= graceEnd;
}

export type LicenseStatus = 'ACTIVE' | 'GRACE_PERIOD' | 'EXPIRED' | 'INACTIVE';

export function getLicenseStatus(tenant: { status: boolean; expiresAt: Date }): LicenseStatus {
  if (!tenant.status) return 'INACTIVE';
  const now = new Date();
  if (tenant.expiresAt >= now) return 'ACTIVE';
  if (isWithinGracePeriod(tenant.expiresAt)) return 'GRACE_PERIOD';
  return 'EXPIRED';
}