/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEEPSEEK_MODEL?: string;
  readonly VITE_DEEPSEEK_FAST_MODEL?: string;
  readonly VITE_DEEPSEEK_GENERATE_MODEL?: string;
  readonly VITE_ENABLE_AUTO_AI?: string;
  readonly VITE_AI_DAILY_REQUEST_LIMIT?: string;
  readonly VITE_AI_ORCHESTRATE_MODULES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __DEEPSEEK_CONFIGURED__: boolean;
