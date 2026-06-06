// ---------------------------------------------------------------------------
// EventLogger
//
// Writes game events as newline-delimited JSON (JSONL) to a session log file.
// Files are written to <logsDir>/<worldFolder>/<ISO-timestamp>.jsonl
// Each event is flushed immediately (synchronous write) for crash-safety.
// ---------------------------------------------------------------------------

import fs from 'fs';
import path from 'path';
import type { Coords } from './grid-topology';

export interface GenRoomEvent {
  room_id: number;
  coords: Coords;
  source: 'stub' | 'llm' | 'linked';
}

export class EventLogger {
  readonly logFilePath: string;
  private readonly fd: number;

  constructor(logsDir: string, worldFolder: string) {
    const worldLogDir = path.join(logsDir, worldFolder);
    fs.mkdirSync(worldLogDir, { recursive: true });

    // File name: ISO 8601 with colons replaced by hyphens (filesystem-safe)
    const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    this.logFilePath = path.join(worldLogDir, `${timestamp}.jsonl`);

    // Open for appending (creates the file)
    this.fd = fs.openSync(this.logFilePath, 'a');
  }

  logGenRoom(event: GenRoomEvent): void {
    const record = {
      event: 'gen.room',
      ts: new Date().toISOString(),
      room_id: event.room_id,
      coords: event.coords,
      source: event.source,
    };
    this.write(record);
  }

  logLlmCall(event: { model: string; prompt: string; response: string; ok: boolean }): void {
    const record = {
      event: 'llm.call',
      ts: new Date().toISOString(),
      model: event.model,
      prompt: event.prompt,
      response: event.response,
      ok: event.ok,
    };
    this.write(record);
  }

  logError(event: { message: string; detail?: string }): void {
    const record = {
      event: 'error',
      ts: new Date().toISOString(),
      message: event.message,
      ...(event.detail !== undefined ? { detail: event.detail } : {}),
    };
    this.write(record);
  }

  close(): void {
    try {
      fs.closeSync(this.fd);
    } catch {
      // Already closed or never opened — ignore
    }
  }

  private write(record: unknown): void {
    const line = JSON.stringify(record) + '\n';
    fs.writeSync(this.fd, line);
  }
}
