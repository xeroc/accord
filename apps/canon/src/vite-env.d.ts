/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVNET_RPC: string;
  readonly VITE_MAINNET_RPC: string;
  readonly VITE_EVIDENCE_DAEMON_URL: string;
  readonly VITE_ACCORD_APP_URL: string;
  readonly VITE_EXPLORER_ACCOUNT_URL: string;
  readonly VITE_FEATURED_LIST: string;
  readonly VITE_EVIDENCE_OPERATOR_ADDRESS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
