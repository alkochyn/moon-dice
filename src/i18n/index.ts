import { createContext } from "preact"
import { useContext } from "preact/hooks"

import { DEFAULT_LANG, STRINGS, type Strings } from "./strings"

export { DEFAULT_LANG, LANGS, STRINGS, describeDiceError, isLang } from "./strings"
export type { Lang, Strings } from "./strings"

/** Словарь текущего языка; App кладёт его сюда, компоненты берут через useT. */
export const LangContext = createContext<Strings>(STRINGS[DEFAULT_LANG])

export const useT = (): Strings => useContext(LangContext)
