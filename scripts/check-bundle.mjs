// Страж железобетонности: после сборки проверяем, что панель не тянет ничего
// со сторонних хостов и остаётся маленькой. Любой внешний URL, кроме miro.com,
// роняет сборку — именно такая ссылка на unpkg.com ломала старый кубомет в РФ.
import { readFileSync, statSync } from "node:fs"
import { gzipSync } from "node:zlib"

const BUNDLE = "dist/index.html"
/*
 * Два лимита с разным смыслом.
 *
 * Настоящая цена загрузки — размер в gzip: именно столько едет по сети, и
 * именно он важен игроку на плохом канале. Лимит на несжатый размер держим
 * заведомо свободным: он ловит катастрофу вроде случайно вшитой картинки, а
 * не осмысленный рост текста. Около 141 КБ из всего бандла — это 85
 * встроенных значков игроков.
 *
 * Лимиты подняты со 100/260 КБ, когда добавился облик «Терминал»: он стоит
 * около 7 КБ в gzip, а без него бандл уже упирался в 99 КБ. Следующий шаг,
 * если упрёмся снова, — ужать значки через svgo, а не поднимать дальше.
 */
const MAX_BYTES = 280 * 1024
const MAX_GZIP_BYTES = 110 * 1024
const ALLOWED_HOSTS = ["miro.com"]
// Не сетевые адреса, а XML-пространства имён из Preact: за ними никто не ходит.
const NAMESPACE_PREFIXES = ["http://www.w3.org/"]

const html = readFileSync(BUNDLE, "utf8")
const urls = html.match(/https?:\/\/[^"'\x60\s)<>]+/g) ?? []

const foreign = [...new Set(urls)].filter((url) => {
  if (NAMESPACE_PREFIXES.some((prefix) => url.startsWith(prefix))) return false
  try {
    const { hostname } = new URL(url)
    return !ALLOWED_HOSTS.some((host) => hostname === host || hostname.endsWith(`.${host}`))
  } catch {
    return true
  }
})

const size = statSync(BUNDLE).size
const problems = []

if (foreign.length) {
  problems.push(`Внешние ссылки в бандле (разрешён только ${ALLOWED_HOSTS.join(", ")}):\n  ` + foreign.join("\n  "))
}
const gzipped = gzipSync(html).length

if (size > MAX_BYTES) {
  problems.push(`Размер ${BUNDLE} = ${(size / 1024).toFixed(1)} КБ, лимит ${MAX_BYTES / 1024} КБ`)
}
if (gzipped > MAX_GZIP_BYTES) {
  problems.push(`В gzip ${(gzipped / 1024).toFixed(1)} КБ, лимит ${MAX_GZIP_BYTES / 1024} КБ — это и есть цена загрузки`)
}

if (problems.length) {
  console.error("\n[check-bundle] ПРОВАЛ\n" + problems.join("\n"))
  process.exit(1)
}

console.log(
  `[check-bundle] ок: ${(size / 1024).toFixed(1)} КБ, в gzip ${(gzipped / 1024).toFixed(1)} КБ, внешних запросов нет`,
)
