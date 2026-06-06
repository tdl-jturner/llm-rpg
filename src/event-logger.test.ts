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
});
