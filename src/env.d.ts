/// <reference types="vite/client" />
/// <reference types="@mirohq/websdk-types" />

interface ImportMetaEnv {
  /** Адрес приёмника статистики (Apps Script). Пусто — статистика выключена. */
  readonly VITE_STATS_URL?: string
}

declare const __APP_VERSION__: string
declare const __BUILD_TIME__: string
