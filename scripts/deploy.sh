#!/usr/bin/env bash
# Выкладка панели на свой сервер по SSH.
#
# Настройки берутся из .env.deploy.local (в git не попадает):
#   DEPLOY_HOST=deploy@dice.example.ru
#   DEPLOY_PATH=/var/www/miro-dice/
#   DEPLOY_PORT=22
set -euo pipefail

ENV_FILE=".env.deploy.local"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Нет $ENV_FILE — скопируйте .env.deploy.example и заполните." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
. "$ENV_FILE"
set +a

: "${DEPLOY_HOST:?DEPLOY_HOST обязателен, например deploy@dice.example.ru}"
: "${DEPLOY_PATH:?DEPLOY_PATH обязателен, например /var/www/miro-dice/}"
DEPLOY_PORT="${DEPLOY_PORT:-22}"

for tool in rsync ssh npm; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Не найден $tool" >&2; exit 1; }
done

echo "→ сборка"
npm run build

echo "→ выкладка на $DEPLOY_HOST:$DEPLOY_PATH"
# --delete убирает с сервера файлы, которых больше нет в сборке;
# index.html и sw.js заливаем последними, чтобы старый кэш не подхватил новую версию раньше времени.
rsync -az --delete --human-readable \
  -e "ssh -p $DEPLOY_PORT" \
  dist/ "$DEPLOY_HOST:$DEPLOY_PATH"

echo "✅ готово: не забудьте проверить https-адрес в настройках приложения Miro"
