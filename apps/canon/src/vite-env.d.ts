/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVNET_RPC: string;
  readonly VITE_MAINNET_RPC: string;
  readonly VITE_EVIDENCE_DAEMON_URL_DEVNET?: string;
  readonly VITE_EVIDENCE_DAEMON_URL_MAINNET?: string;
  readonly VITE_EVIDENCE_DAEMON_URL_LOCALNET?: string;
  readonly VITE_ACCORD_APP_URL: string;
  readonly VITE_EXPLORER_ACCOUNT_URL: string;
  readonly VITE_FEATURED_LIST: string;
  readonly VITE_EVIDENCE_OPERATOR_ADDRESS_DEVNET?: string;
  readonly VITE_EVIDENCE_OPERATOR_ADDRESS_MAINNET?: string;
  readonly VITE_EVIDENCE_OPERATOR_ADDRESS_LOCALNET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
