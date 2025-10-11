export interface BundleResult {
  code: string | null;
  error: string | null;
}

export type OnLog = (message: string) => void;
