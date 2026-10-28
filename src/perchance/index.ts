import { loadBundle } from "./load"
import { PerchanceError, rollList } from "./run"

export { fetchBundle, generatorUrl, loadBundle, parseGeneratorName, type LoadedBundle } from "./load"
export { generatorTitle, listChoices, PerchanceError, rollList, type Bundle, type PerchanceErrorCode } from "./run"

/** Бросок по таблице с perchance: код из кэша или с сервера, на выходе — текст. */
export const rollTable = async (generator: string, list = ""): Promise<string> => {
  const text = rollList(await loadBundle(generator), list)
  if (!text) throw new PerchanceError("empty")
  return text
}
