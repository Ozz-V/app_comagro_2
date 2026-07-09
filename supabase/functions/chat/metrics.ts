export interface UserMetrics {
  user_id: string;
  strike_count: number;
  banned_until: string | null;
  request_count: number;
  last_request_at: string | null;
  max_requests: number;
}

export function getDefaultMetrics(user_id: string): UserMetrics {
  return { user_id, strike_count: 0, banned_until: null, request_count: 0, last_request_at: null, max_requests: 10 };
}

export function checkBan(metrics: UserMetrics, now: Date): string | null {
  if (metrics.banned_until && new Date(metrics.banned_until) > now) {
    return "Debido a infracciones a las normas de uso, tu cuenta está bloqueada temporalmente. Podrás volver a intentarlo en 48 horas.";
  }
  return null;
}

export function resetCountersIfNeeded(metrics: UserMetrics, now: Date): number {
  let request_count = metrics.request_count || 0;
  const max_limit = metrics.max_requests ?? 10;
  const last_request_at = metrics.last_request_at ? new Date(metrics.last_request_at) : null;

  if (last_request_at) {
    const hoursSinceLast = (now.getTime() - last_request_at.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLast >= 24) request_count = 0;
    else if (request_count < max_limit && hoursSinceLast >= 6) request_count = 0;
    if (hoursSinceLast >= 12) {
      metrics.strike_count = 0;
    }
  }
  return request_count;
}

export function checkQuotaExceeded(request_count: number, max_requests: number): string | null {
  if (request_count >= max_requests) {
    return "Has utilizado todos tus cupos de consulta rápida por hoy. Vuelve a consultar en 24 horas.";
  }
  return null;
}

export function processStrike(reply: string, metrics: UserMetrics): string {
  if (!reply.includes('[STRIKE]')) return reply;

  metrics.strike_count = (metrics.strike_count || 0) + 1;
  reply = reply.replace(/\[STRIKE\]/g, "").trim();

  if (metrics.strike_count >= 2) {
    const banDate = new Date();
    banDate.setHours(banDate.getHours() + 12);
    metrics.banned_until = banDate.toISOString();
    return "Debido a incumplimiento de normas, tu acceso al chat ha sido suspendido temporalmente. Se volverá a activar dentro de 12 horas.";
  }
  return reply;
}
