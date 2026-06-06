import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventLogger } from './event-logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'event-logger-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function readJsonl(filePath: string): unknown[] {
  const lines = fs.readFileSync(filePath, 'utf-8').trim().split('\n').filter(Boolean);
  return lines.map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventLogger', () => {
  it('creates the log file on construction', () => {
    const logger = new EventLogger(tmpDir, 'test-world');
    expect(fs.existsSync(logger.logFilePath)).toBe(true);
    logger.close();
  });

  it('log file lives under <logsDir>/<worldFolder>/', () => {
    const logger = new EventLogger(tmpDir, 'my-world');
    const expectedDir = path.join(tmpDir, 'my-world');
    expect(logger.logFilePath.startsWith(expectedDir)).toBe(true);
    logger.close();
  });

  it('log file is named with an ISO timestamp', () => {
    const logger = new EventLogger(tmpDir, 'w');
    const fileName = path.basename(logger.logFilePath);
    // Matches ISO 8601 patterns like 2024-01-01T12-00-00-000Z.jsonl
    expect(fileName).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    expect(fileName).toMatch(/\.jsonl$/);
    logger.close();
  });

  it('writes a gen.room event as a JSONL line', () => {
    const logger = new EventLogger(tmpDir, 'world1');
    logger.logGenRoom({ room_id: 42, coords: { x: 1, y: 0, z: 2 }, source: 'stub' });
    logger.close();

    const events = readJsonl(logger.logFilePath);
    expect(events).toHaveLength(1);
    const ev = events[0] as Record<string, unknown>;
    expect(ev['event']).toBe('gen.room');
    expect(ev['room_id']).toBe(42);
    expect(ev['coords']).toEqual({ x: 1, y: 0, z: 2 });
    expect(ev['source']).toBe('stub');
    expect(typeof ev['ts']).toBe('string');
  });

  it('writes multiple events, one per line', () => {
    const logger = new EventLogger(tmpDir, 'world2');
    logger.logGenRoom({ room_id: 1, coords: { x: 0, y: 0, z: 1 }, source: 'stub' });
    logger.logGenRoom({ room_id: 2, coords: { x: 1, y: 0, z: 1 }, source: 'stub' });
    logger.logGenRoom({ room_id: 3, coords: { x: 1, y: 0, z: 0 }, source: 'stub' });
    logger.close();

    const events = readJsonl(logger.logFilePath);
    expect(events).toHaveLength(3);
  });

  it('events include a timestamp string', () => {
    const before = new Date().toISOString();
    const logger = new EventLogger(tmpDir, 'w');
    logger.logGenRoom({ room_id: 1, coords: { x: 0, y: 0, z: 0 }, source: 'stub' });
    const after = new Date().toISOString();
    logger.close();

    const events = readJsonl(logger.logFilePath);
    const ev = events[0] as Record<string, unknown>;
    const ts = ev['ts'] as string;
    expect(ts >= before).toBe(true);
    expect(ts <= after).toBe(true);
  });

  // ── session.start ───────────────────────────────────────────────────────────

  it('logSessionStart writes a session.start event', () => {
    const logger = new EventLogger(tmpDir, 'world-start');
    logger.logSessionStart({
      worldName: 'My World',
      worldMdPath: '/path/to/WORLD.md',
      engineVersion: '1.0.0',
    });
    logger.close();

    const events = readJsonl(logger.logFilePath);
    expect(events).toHaveLength(1);
    const ev = events[0] as Record<string, unknown>;
    expect(ev['event']).toBe('session.start');
    expect(ev['worldName']).toBe('My World');
    expect(ev['worldMdPath']).toBe('/path/to/WORLD.md');
    expect(ev['engineVersion']).toBe('1.0.0');
    expect(typeof ev['ts']).toBe('string');
  });

  // ── session.end ─────────────────────────────────────────────────────────────

  it('logSessionEnd writes a session.end event', () => {
    const logger = new EventLogger(tmpDir, 'world-end');
    logger.logSessionEnd();
    logger.close();

    const events = readJsonl(logger.logFilePath);
    expect(events).toHaveLength(1);
    const ev = events[0] as Record<string, unknown>;
    expect(ev['event']).toBe('session.end');
    expect(typeof ev['ts']).toBe('string');
  });

  // ── state.mutate ────────────────────────────────────────────────────────────

  it('logStateMutate writes a state.mutate event', () => {
    const logger = new EventLogger(tmpDir, 'world-mutate');
    logger.logStateMutate({
      entity: 'player',
      id: 1,
      before: { hp: 10 },
      after: { hp: 7 },
      reason: 'combat',
    });
    logger.close();

    const events = readJsonl(logger.logFilePath);
    expect(events).toHaveLength(1);
    const ev = events[0] as Record<string, unknown>;
    expect(ev['event']).toBe('state.mutate');
    expect(ev['entity']).toBe('player');
    expect(ev['id']).toBe(1);
    expect(ev['before']).toEqual({ hp: 10 });
    expect(ev['after']).toEqual({ hp: 7 });
    expect(ev['reason']).toBe('combat');
  });

  // ── refusal ─────────────────────────────────────────────────────────────────

  it('logRefusal writes a refusal event', () => {
    const logger = new EventLogger(tmpDir, 'world-refusal');
    logger.logRefusal({ key: 'no_exit', message: "You can't go that way.", overridden: false });
    logger.close();

    const events = readJsonl(logger.logFilePath);
    expect(events).toHaveLength(1);
    const ev = events[0] as Record<string, unknown>;
    expect(ev['event']).toBe('refusal');
    expect(ev['key']).toBe('no_exit');
    expect(ev['message']).toBe("You can't go that way.");
    expect(ev['overridden']).toBe(false);
  });

  it('logRefusal records overridden=true when override was used', () => {
    const logger = new EventLogger(tmpDir, 'world-refusal-override');
    logger.logRefusal({ key: 'no_exit', message: 'The way is shut.', overridden: true });
    logger.close();

    const events = readJsonl(logger.logFilePath);
    const ev = events[0] as Record<string, unknown>;
    expect(ev['overridden']).toBe(true);
  });

  // ── gen.monster ─────────────────────────────────────────────────────────────

  it('logGenMonster writes a gen.monster event', () => {
    const logger = new EventLogger(tmpDir, 'world-gen-monster');
    logger.logGenMonster({ room_id: 5, count: 2 });
    logger.close();

    const events = readJsonl(logger.logFilePath);
    expect(events).toHaveLength(1);
    const ev = events[0] as Record<string, unknown>;
    expect(ev['event']).toBe('gen.monster');
    expect(ev['room_id']).toBe(5);
    expect(ev['count']).toBe(2);
  });

  // ── gen.item ────────────────────────────────────────────────────────────────

  it('logGenItem writes a gen.item event', () => {
    const logger = new EventLogger(tmpDir, 'world-gen-item');
    logger.logGenItem({ room_id: 7, count: 3 });
    logger.close();

    const events = readJsonl(logger.logFilePath);
    expect(events).toHaveLength(1);
    const ev = events[0] as Record<string, unknown>;
    expect(ev['event']).toBe('gen.item');
    expect(ev['room_id']).toBe(7);
    expect(ev['count']).toBe(3);
  });
});
