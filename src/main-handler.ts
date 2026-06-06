import type { SubmitInputResponse } from './shared/ipc';

export function handleSubmitInput(text: string): SubmitInputResponse {
  return { narrative: [`> ${text}`] };
}
