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
    expect(m.max_requests).toBe(20); // updated default
  });

  it('checks ban expiration', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    
    // Future date — user is still banned
    m.banned_until = new Date(Date.now() + 10000).toISOString();
    expect(checkBan(m, new Date())).toContain('restringido temporalmente');

    // Past date — ban has expired
    m.banned_until = new Date(Date.now() - 10000).toISOString();
    expect(checkBan(m, new Date())).toBeNull();
  });

  it('resets counters after 6 hours', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    m.request_count = 10;
    m.last_request_at = new Date(Date.now() - 7 * 3600 * 1000).toISOString(); // 7 hours ago
    const newCount = resetCountersIfNeeded(m, new Date());
    expect(newCount).toBe(0);
  });

  it('does not reset counters before 6 hours', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    m.request_count = 5;
    m.last_request_at = new Date(Date.now() - 4 * 3600 * 1000).toISOString(); // 4 hours ago
    const newCount = resetCountersIfNeeded(m, new Date());
    expect(newCount).toBe(5); // unchanged
  });

  it('resets strikes after 24 hours', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    m.strike_count = 1;
    m.last_request_at = new Date(Date.now() - 25 * 3600 * 1000).toISOString(); // 25 hours ago
    resetCountersIfNeeded(m, new Date());
    expect(m.strike_count).toBe(0);
  });

  it('does not reset strikes before 24 hours', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    m.strike_count = 1;
    m.last_request_at = new Date(Date.now() - 13 * 3600 * 1000).toISOString(); // 13 hours ago — not enough
    resetCountersIfNeeded(m, new Date());
    expect(m.strike_count).toBe(1); // unchanged
  });

  it('detects quota exceeded', () => {
    expect(checkQuotaExceeded(20, 20)).toContain('Has utilizado todos tus cupos');
    expect(checkQuotaExceeded(19, 20)).toBeNull();
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

  it('bans user after 2 strikes for 24 hours', () => {
    const m: UserMetrics = getDefaultMetrics('u1');
    m.strike_count = 1;
    
    const reply = "Bad word [STRIKE]";
    const clean = processStrike(reply, m);
    
    expect(m.strike_count).toBe(0);
    expect(clean).toContain('restringido temporalmente');
    expect(m.banned_until).not.toBeNull();
    // Verify ban is ~24 hours
    const banMs = new Date(m.banned_until!).getTime() - Date.now();
    expect(banMs).toBeGreaterThan(23 * 3600 * 1000);
    expect(banMs).toBeLessThan(25 * 3600 * 1000);
  });
});
