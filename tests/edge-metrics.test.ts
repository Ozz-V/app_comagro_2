import {
  getDefaultMetrics,
  checkBan,
  resetCountersIfNeeded,
  checkQuotaExceeded,
  processStrike,
  UserMetrics
} from '../supabase/functions/chat/metrics';

describe('Edge Function: metrics', () => {
  it('returns default metrics', () => {
    const m = getDefaultMetrics('user123');
    expect(m.user_id).toBe('user123');
    expect(m.request_count).toBe(0);
    expect(m.strike_count).toBe(0);
    expect(m.banned_until).toBeNull();
  });

  it('checks ban expiration', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    
    // Future date
    m.banned_until = new Date(Date.now() + 10000).toISOString();
    expect(checkBan(m, new Date())).toContain('bloqueada temporalmente');

    // Past date
    m.banned_until = new Date(Date.now() - 10000).toISOString();
    expect(checkBan(m, new Date())).toBeNull();
  });

  it('resets counters after 24 hours', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    m.request_count = 10;
    m.last_request_at = new Date(Date.now() - 25 * 3600 * 1000).toISOString(); // 25 hours ago
    const newCount = resetCountersIfNeeded(m, new Date());
    expect(newCount).toBe(0);
  });

  it('resets counters after 6 hours if under max', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    m.request_count = 5; // Under max (10)
    m.last_request_at = new Date(Date.now() - 7 * 3600 * 1000).toISOString(); // 7 hours ago
    const newCount = resetCountersIfNeeded(m, new Date());
    expect(newCount).toBe(0);
  });

  it('resets strikes after 12 hours', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    m.strike_count = 1;
    m.last_request_at = new Date(Date.now() - 13 * 3600 * 1000).toISOString(); // 13 hours ago
    resetCountersIfNeeded(m, new Date());
    expect(m.strike_count).toBe(0);
  });

  it('detects quota exceeded', () => {
    expect(checkQuotaExceeded(10, 10)).toContain('Has utilizado todos tus cupos');
    expect(checkQuotaExceeded(9, 10)).toBeNull();
  });

  it('processes strike tag', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    m.strike_count = 0;
    
    const reply = "Lo siento, no puedo [STRIKE]";
    const clean = processStrike(reply, m);
    
    expect(m.strike_count).toBe(1);
    expect(clean).toBe("Lo siento, no puedo");
    expect(m.banned_until).toBeNull();
  });

  it('bans user after 2 strikes', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    m.strike_count = 1;
    
    const reply = "Bad word [STRIKE]";
    const clean = processStrike(reply, m);
    
    expect(m.strike_count).toBe(0);
    expect(clean).toContain('suspendido temporalmente');
    expect(m.banned_until).not.toBeNull();
  });
});
