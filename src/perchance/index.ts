import { loadBundle } from "./load"
import { PerchanceError, rollList, type InputValues } from "./run"

export { fetchBundle, generatorUrl, loadBundle, parseGeneratorName, type LoadedBundle } from "./load"
export {
  generatorInputs,
  generatorTitle,
  listChoices,
  PerchanceError,
  rollList,
  type Bundle,
  type GeneratorInput,
  type InputValues,
  type PerchanceErrorCode,
} from "./run"

/** Бросок по таблице с perchance: код из кэша или с сервера, на выходе — текст. */
export const rollTable = async (generator: string, list = "", inputs: InputValues = {}): Promise<string> => {
  const text = rollList(await loadBundle(generator), list, undefined, inputs)
  if (!text) throw new PerchanceError("empty")
  return text
}
