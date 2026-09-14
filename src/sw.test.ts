import { readFileSync } from "node:fs"
import { createContext, runInContext } from "node:vm"
import { describe, expect, it } from "vitest"

/**
 * Service worker — единственное, что держит панель живой при недоступном
 * хостинге, а проверить его в обычном тесте нельзя: нет ни caches, ни self.
 * Поэтому поднимаем минимальное окружение воркера и дёргаем его обработчики
 * руками.
 */
const ORIGIN = "https://dice.example.ru"
const SHELL_URL = `${ORIGIN}/index.html`

type Listener = (event: unknown) => void

class FakeResponse {
  constructor(
    readonly body: string,
    readonly ok = true,
  ) {}

  clone(): FakeResponse {
    return new FakeResponse(this.body, this.ok)
  }

  static error(): FakeResponse {
    return new FakeResponse("network-error", false)
  }
}

class FakeRequest {
  readonly url: string

  constructor(
    input: string | FakeRequest,
    readonly init: { mode?: string; method?: string } = {},
  ) {
    this.url = new URL(typeof input === "string" ? input : input.url, `${ORIGIN}/`).toString()
  }

  get mode(): string {
    return this.init.mode ?? "no-cors"
  }

  get method(): string {
    return this.init.method ?? "GET"
  }
}

const keyOf = (input: string | FakeRequest): string =>
  new URL(typeof input === "string" ? input : input.url, `${ORIGIN}/`).toString()

interface Harness {
  listeners: Map<string, Listener>
  store: Map<string, Map<string, FakeResponse>>
  fetchCalls: string[]
  setNetwork: (handler: (url: string) => Promise<FakeResponse>) => void
  skipWaitingCalled: () => boolean
  claimCalled: () => boolean
}

const loadServiceWorker = (): Harness => {
  const listeners = new Map<string, Listener>()
  const store = new Map<string, Map<string, FakeResponse>>()
  const fetchCalls: string[] = []
  let network = async (url: string): Promise<FakeResponse> => new FakeResponse(`network:${url}`)
  let skipWaiting = false
  let claim = false

  const cacheApi = {
    open: async (name: string) => {
      const cache = store.get(name) ?? new Map<string, FakeResponse>()
      store.set(name, cache)

      return {
        add: async (request: string | FakeRequest) => {
          const url = keyOf(request)
          cache.set(url, await network(url))
        },
        put: async (request: string | FakeRequest, response: FakeResponse) => {
          cache.set(keyOf(request), response)
        },
        match: async (request: string | FakeRequest) => cache.get(keyOf(request)),
      }
    },
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (request: string | FakeRequest) => {
      for (const cache of store.values()) {
        const hit = cache.get(keyOf(request))
        if (hit) return hit
      }
      return undefined
    },
  }

  const self = {
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: async () => {
      skipWaiting = true
    },
    clients: {
      claim: async () => {
        claim = true
      },
    },
    location: { origin: ORIGIN },
  }

  const sandbox = {
    self,
    caches: cacheApi,
    Response: FakeResponse,
    Request: FakeRequest,
    URL,
    fetch: async (request: string | FakeRequest) => {
      const url = keyOf(request)
      fetchCalls.push(url)
      return network(url)
    },
  }

  runInContext(readFileSync("public/sw.js", "utf8"), createContext(sandbox))

  return {
    listeners,
    store,
    fetchCalls,
    setNetwork: (handler) => {
      network = handler
    },
    skipWaitingCalled: () => skipWaiting,
    claimCalled: () => claim,
  }
}

const fire = async (harness: Harness, type: string, event: Record<string, unknown>): Promise<void> => {
  const listener = harness.listeners.get(type)
  expect(listener, `нет обработчика ${type}`).toBeDefined()
  listener?.(event)
}

const installed = async (): Promise<Harness> => {
  const harness = loadServiceWorker()
  const pending: Array<Promise<unknown>> = []
  await fire(harness, "install", { waitUntil: (p: Promise<unknown>) => pending.push(p) })
  await Promise.all(pending)
  return harness
}

const navigateEvent = (harness: Harness, request: FakeRequest) => {
  const answers: Array<Promise<FakeResponse>> = []
  void fire(harness, "fetch", {
    request,
    respondWith: (value: Promise<FakeResponse>) => answers.push(value),
  })
  return answers
}

describe("service worker", () => {
  it("на установке кладёт панель в кэш и не ждёт закрытия старых вкладок", async () => {
    const harness = await installed()
    const cache = [...harness.store.values()][0]

    expect(cache?.has(SHELL_URL)).toBe(true)
    expect(harness.skipWaitingCalled()).toBe(true)
  })

  it("на активации выкидывает кэши прошлых версий", async () => {
    const harness = await installed()
    harness.store.set("dice-старая", new Map())

    const pending: Array<Promise<unknown>> = []
    await fire(harness, "activate", { waitUntil: (p: Promise<unknown>) => pending.push(p) })
    await Promise.all(pending)

    expect([...harness.store.keys()]).toHaveLength(1)
    expect(harness.claimCalled()).toBe(true)
  })

  it("открывает панель из сети, когда хостинг доступен", async () => {
    const harness = await installed()
    harness.setNetwork(async () => new FakeResponse("свежая панель"))

    const [answer] = navigateEvent(harness, new FakeRequest("/?panel=1", { mode: "navigate" }))
    const response = await answer

    expect(response?.body).toBe("свежая панель")
  })

  it("открывает панель из кэша, когда хостинг недоступен", async () => {
    const harness = await installed()
    harness.setNetwork(async () => {
      throw new Error("ERR_CONNECTION_TIMED_OUT")
    })

    const [answer] = navigateEvent(harness, new FakeRequest("/?panel=1", { mode: "navigate" }))
    const response = await answer

    // Именно ради этой строки воркер и существует: заблокированный хост не должен
    // мешать игроку кинуть кубы.
    expect(response?.body).toContain("network:")
    expect(response?.ok).toBe(true)
  })

  it("свежую версию панели кладёт в кэш поверх старой", async () => {
    const harness = await installed()
    harness.setNetwork(async () => new FakeResponse("версия 2"))

    await Promise.all(navigateEvent(harness, new FakeRequest("/", { mode: "navigate" })))
    await new Promise((resolve) => setTimeout(resolve, 0))

    const cache = [...harness.store.values()][0]
    expect(cache?.get(SHELL_URL)?.body).toBe("версия 2")
  })

  it("не вмешивается в запросы не-GET", async () => {
    const harness = await installed()
    const answers = navigateEvent(harness, new FakeRequest("/", { mode: "navigate", method: "POST" }))

    expect(answers).toHaveLength(0)
  })
})
