/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BOARD_PATH?: string;
  readonly VITE_MANAGEMENT_PATH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
