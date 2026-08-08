/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLOUDBASE_ENV_ID: string
  readonly VITE_CLOUDBASE_REGION: string
  readonly VITE_CLOUDBASE_PUBLISH_KEY: string
  readonly VITE_OAUTH_RELAY_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
