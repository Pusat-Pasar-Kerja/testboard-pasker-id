/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
  readonly VITE_API_BASE_URL?: string
  readonly VITE_DEMO_MODE?: string
  readonly VITE_DEFAULT_LOCALE?: string
  readonly VITE_BASE_PATH?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** The release number (apps/web/package.json), filled in by vite.config.ts. */
declare const __APP_VERSION__: string
