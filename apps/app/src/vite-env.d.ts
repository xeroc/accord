/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVNET_RPC: string;
  readonly VITE_MAINNET_RPC: string;
  readonly VITE_EVIDENCE_OPERATOR_DEVNET?: string;
  readonly VITE_EVIDENCE_OPERATOR_MAINNET?: string;
  readonly VITE_EVIDENCE_OPERATOR_LOCALNET?: string;
  readonly VITE_EVIDENCE_DAEMON_URL_DEVNET?: string;
  readonly VITE_EVIDENCE_DAEMON_URL_MAINNET?: string;
  readonly VITE_EVIDENCE_DAEMON_URL_LOCALNET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
