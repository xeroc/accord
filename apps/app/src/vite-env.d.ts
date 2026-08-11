/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVNET_RPC: string;
  readonly VITE_MAINNET_RPC: string;
  readonly VITE_EVIDENCE_DAEMON_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
