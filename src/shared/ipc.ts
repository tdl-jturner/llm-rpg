export interface SubmitInputArgs {
  text: string;
}

export interface SubmitInputResponse {
  narrative: string[];
}

export interface ElectronAPI {
  submitInput: (text: string) => Promise<SubmitInputResponse>;
}
