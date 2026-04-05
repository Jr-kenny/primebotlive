/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PRIMEBOT_API_URL?: string;
  readonly VITE_BASE_RPC_URL?: string;
  readonly VITE_REOWN_PROJECT_ID?: string;
  readonly VITE_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
