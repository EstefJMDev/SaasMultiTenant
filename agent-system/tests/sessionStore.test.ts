import { getOrCreateSession, pruneExpiredSessions, sessions } from '../src/services/sessionStore';
import type { AgentType } from '../src/types/index';

beforeEach(() => {
  sessions.clear();
});

describe('getOrCreateSession', () => {
  test('creates a new session when none exists', () => {
    const session = getOrCreateSession('s1', 'documents', 'test-user');

    expect(session).toBeDefined();
    expect(session.agentType).toBe('documents');
    expect(session.history).toEqual([]);
    expect(session.lastActivity).toBeInstanceOf(Date);
    expect(session.pendingConfirmationId).toBeUndefined();
  });

  test('stores the session in the map', () => {
    getOrCreateSession('s2', 'finance', 'test-user');
    expect(sessions.has('s2')).toBe(true);
  });

  test('returns the existing session on repeated calls', () => {
    const first = getOrCreateSession('s3', 'users', 'test-user');
    const second = getOrCreateSession('s3', 'analysis', 'test-user'); // different agentType should be ignored
    expect(second).toBe(first);
  });

  test('updates lastActivity on every access', () => {
    const session = getOrCreateSession('s4', 'tasks', 'test-user');
    const before = session.lastActivity.getTime();

    // Advance time slightly
    jest.useFakeTimers();
    jest.advanceTimersByTime(100);
    getOrCreateSession('s4', 'tasks', 'test-user');
    jest.useRealTimers();

    expect(session.lastActivity.getTime()).toBeGreaterThanOrEqual(before);
  });

  test('creates independent sessions for different IDs', () => {
    const a = getOrCreateSession('sA', 'documents', 'test-user');
    const b = getOrCreateSession('sB', 'finance', 'test-user');
    expect(a).not.toBe(b);
    expect(sessions.size).toBe(2);
  });

  test('accepts all valid AgentTypes', () => {
    const agentTypes: AgentType[] = [
      'documents', 'users', 'finance', 'analysis', 'projects', 'tasks', 'resources',
    ];
    agentTypes.forEach((type, i) => {
      const session = getOrCreateSession(`session-${i}`, type, 'test-user');
      expect(session.agentType).toBe(type);
    });
  });

  test('new session starts with empty history', () => {
    const session = getOrCreateSession('s-history', 'projects', 'test-user');
    expect(session.history).toHaveLength(0);
  });

  test('history persists between calls to the same session', () => {
    const session = getOrCreateSession('s-persist', 'finance', 'test-user');
    session.history.push({ role: 'user', content: 'hola' });

    const again = getOrCreateSession('s-persist', 'finance', 'test-user');
    expect(again.history).toHaveLength(1);
    expect(again.history[0].content).toBe('hola');
  });
});

describe('pruneExpiredSessions', () => {
  test('removes sessions older than the TTL', () => {
    const session = getOrCreateSession('old', 'analysis', 'test-user');
    // Backdate lastActivity beyond default 30-minute TTL
    session.lastActivity = new Date(Date.now() - 31 * 60 * 1000);

    pruneExpiredSessions();

    expect(sessions.has('old')).toBe(false);
  });

  test('keeps sessions within the TTL', () => {
    getOrCreateSession('fresh', 'documents', 'test-user');

    pruneExpiredSessions();

    expect(sessions.has('fresh')).toBe(true);
  });

  test('only removes expired sessions, leaving active ones intact', () => {
    const expired = getOrCreateSession('expired', 'users', 'test-user');
    expired.lastActivity = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
    getOrCreateSession('active', 'finance', 'test-user');

    pruneExpiredSessions();

    expect(sessions.has('expired')).toBe(false);
    expect(sessions.has('active')).toBe(true);
  });

  test('handles empty session map without errors', () => {
    expect(() => pruneExpiredSessions()).not.toThrow();
  });

  test('removes all sessions when all are expired', () => {
    ['s1', 's2', 's3'].forEach((id) => {
      const s = getOrCreateSession(id, 'tasks', 'test-user');
      s.lastActivity = new Date(Date.now() - 2 * 60 * 60 * 1000);
    });

    pruneExpiredSessions();

    expect(sessions.size).toBe(0);
  });
});

describe('sessions map', () => {
  test('is exported and starts empty (after beforeEach clear)', () => {
    expect(sessions.size).toBe(0);
  });

  test('pendingConfirmationId can be set and read', () => {
    const session = getOrCreateSession('s-confirm', 'documents', 'test-user');
    session.pendingConfirmationId = 'conf-123';

    const retrieved = sessions.get('s-confirm');
    expect(retrieved?.pendingConfirmationId).toBe('conf-123');
  });

  test('pendingConfirmationId can be cleared', () => {
    const session = getOrCreateSession('s-clear', 'finance', 'test-user');
    session.pendingConfirmationId = 'conf-456';
    session.pendingConfirmationId = undefined;

    expect(sessions.get('s-clear')?.pendingConfirmationId).toBeUndefined();
  });
});
