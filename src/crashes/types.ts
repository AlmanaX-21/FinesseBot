export interface KineticServer {
  url: string;
  id: string;
  apiKey: string;
}

export interface PanelFile {
  name: string;
  is_file: boolean;
  modified_at: string;
}

export interface Crash {
  at: number;
  exitCode?: string;
  outOfMemory?: string;
}

export interface CrashLinks {
  report?: string;
  log?: string;
}
