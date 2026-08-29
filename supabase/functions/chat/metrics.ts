export interface UserMetrics {
  user_id: string;
  strike_count: number;
  banned_until: string | null;
  request_count: number;
  last_request_at: string | null;
  max_requests: number;
  ban_count: number;
}

// Límite por defecto: 20 consultas cada 6 horas.
// Se puede subir/bajar por usuario editando la columna max_requests en la tabla chat_user_metrics.
export function getDefaultMetrics(user_id: string): UserMetrics {
  return { user_id, strike_count: 0, banned_until: null, request_count: 0, last_request_at: null, max_requests: 20, ban_count: 0 };
}

export function checkBan(metrics: UserMetrics, now: Date): string | null {
  if (metrics.banned_until && new Date(metrics.banned_until) > now) {
    const hoursLeft = Math.max(1, Math.ceil((new Date(metrics.banned_until).getTime() - now.getTime()) / (1000 * 60 * 60)));
    return `Debido a incumplimientos en el uso de la herramienta, el chat ha sido restringido temporalmente. Podés volver a intentarlo en aproximadamente ${hoursLeft} hora(s).`;
  }
  return null;
}

export function resetCountersIfNeeded(metrics: UserMetrics, now: Date): number {
  let request_count = metrics.request_count || 0;
  const last_request_at = metrics.last_request_at ? new Date(metrics.last_request_at) : null;

  if (last_request_at) {
    const hoursSinceLast = (now.getTime() - last_request_at.getTime()) / (1000 * 60 * 60);
    // Cuota de mensajes: se renueva cada 6 horas fijo
    if (hoursSinceLast >= 6) request_count = 0;
    // Strikes: se resetean cada 24 horas
    if (hoursSinceLast >= 24) {
      metrics.strike_count = 0;
    }
  }
  return request_count;
}

export function checkQuotaExceeded(request_count: number, max_requests: number): string | null {
  if (request_count >= max_requests) {
    return "Has utilizado todos tus cupos de consulta por ahora. Volvé a intentarlo en 6 horas.";
  }
  return null;
}

export function processStrike(reply: string, metrics: UserMetrics): string {
  if (!reply.includes('[STRIKE]')) return reply;

  metrics.strike_count = (metrics.strike_count || 0) + 1;
  reply = reply.replace(/\[STRIKE\]/g, "").trim();

  if (metrics.strike_count >= 2) {
    metrics.ban_count = (metrics.ban_count || 0) + 1;
    // Baneo siempre de 24 horas, sin importar cuántas veces reincidió
    const banHours = 24;
    const banDate = new Date();
    banDate.setHours(banDate.getHours() + banHours);
    metrics.banned_until = banDate.toISOString();
    metrics.strike_count = 0;
    return `Debido a incumplimientos en el uso de la herramienta, el chat ha sido restringido temporalmente. Podés volver a utilizarlo en ${banHours} horas.`;
  }
  return reply;
}
