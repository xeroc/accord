/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEVNET_RPC: string;
  readonly VITE_MAINNET_RPC: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
