import { readGlobal, writeGlobal } from "../board/scope"
import { PerchanceError, type Bundle, type Sources } from "./run"

/**
 * Код генераторов берём у perchance одним запросом: сервер сам подтягивает
 * все импорты и отдаёт только текст списков — без HTML-панели и стилей.
 * У этого адреса открыт CORS, так что идём прямо из панели.
 */
const API = "https://perchance.org/api/getGeneratorsAndDependencies?generatorNames="
const PAGE = "https://perchance.org/"

/** Код генератора один для всех досок, поэтому кэш общий, а не по доскам. */
const CACHE_PREFIX = "dice.perchance.v1."
/** Свежее этого не перекачиваем: автор правит генератор редко, а бросают часто. */
const FRESH_MS = 60 * 60 * 1000
const TIMEOUT_MS = 10_000

const NAME_RE = /^[\w-]{1,100}$/

export interface LoadedBundle extends Bundle {
  fetchedAt: number
}

export const generatorUrl = (name: string): string => PAGE + encodeURIComponent(name)

/**
 * Имя генератора из того, что вставил игрок: ссылка perchance.org/имя,
 * ссылка встраивания с поддоменом или просто имя.
 */
export const parseGeneratorName = (input: string): string | null => {
  const text = input.trim()
  const link = /^(?:https?:\/\/)?(?:[\w-]+\.)?perchance\.org\/([^/?#\s]+)/i.exec(text)
  let name = text
  if (link) {
    try {
      name = decodeURIComponent(link[1]!)
    } catch {
      return null
    }
  }
  return NAME_RE.test(name) ? name : null
}

interface ApiResponse {
  success?: boolean
  generators?: Record<string, { code?: unknown }>
}

export const fetchBundle = async (name: string, fetchImpl: typeof fetch = fetch): Promise<LoadedBundle> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)

  let data: ApiResponse
  try {
    const response = await fetchImpl(API + encodeURIComponent(name), { signal: controller.signal })
    if (!response.ok) throw new PerchanceError("network", String(response.status))
    data = (await response.json()) as ApiResponse
  } catch (failure) {
    if (failure instanceof PerchanceError) throw failure
    throw new PerchanceError("network", failure instanceof Error ? failure.message : "")
  } finally {
    clearTimeout(timer)
  }

  const sources: Sources = {}
  for (const [key, value] of Object.entries(data.generators ?? {})) {
    if (typeof value?.code === "string") sources[key] = value.code
  }
  if (sources[name] === undefined) throw new PerchanceError("notFound", name)

  return { name, sources, fetchedAt: Date.now() }
}

const isBundle = (value: unknown): value is LoadedBundle => {
  const bundle = value as LoadedBundle | null
  return (
    typeof bundle?.name === "string" &&
    typeof bundle.fetchedAt === "number" &&
    typeof bundle.sources === "object" &&
    bundle.sources !== null &&
    typeof bundle.sources[bundle.name] === "string"
  )
}

/** В памяти держим тот же объект: по нему кэшируется разбор, перечитывать код на каждый бросок незачем. */
const memory = new Map<string, LoadedBundle>()

const readCached = (name: string): LoadedBundle | null => {
  const inMemory = memory.get(name)
  if (inMemory) return inMemory

  const stored = readGlobal<unknown>(CACHE_PREFIX + name, null)
  if (!isBundle(stored) || stored.name !== name) return null
  memory.set(name, stored)
  return stored
}

/**
 * Генератор для броска: из кэша, если он свежий, иначе с сервера. Сеть
 * отвалилась — бросаем по старой копии: таблица за час не испортилась.
 */
export const loadBundle = async (name: string, options: { force?: boolean } = {}): Promise<LoadedBundle> => {
  const cached = readCached(name)
  if (cached && !options.force && Date.now() - cached.fetchedAt < FRESH_MS) return cached

  try {
    const fresh = await fetchBundle(name)
    memory.set(name, fresh)
    // Большой генератор может не влезть в localStorage — тогда живём из памяти.
    writeGlobal(CACHE_PREFIX + name, fresh)
    return fresh
  } catch (failure) {
    if (cached && !(failure instanceof PerchanceError && failure.code === "notFound")) return cached
    throw failure
  }
}
