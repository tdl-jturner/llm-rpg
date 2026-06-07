const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function ts(): string {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

export function logInfo(msg: string): void {
  console.log(`[${ts()}] [INFO] ${msg}`);
}

export function logWarn(msg: string): void {
  console.log(`[${ts()}] ${YELLOW}[WARN]${RESET} ${msg}`);
}

export function logError(msg: string): void {
  console.log(`[${ts()}] ${RED}[ERROR]${RESET} ${msg}`);
}
