# ASDTrecker · сайт-презентация

Отдельный сайт, который представляет ASDTrecker, отдаёт свежий APK и ведёт в веб-версию https://asdtrecker.vercel.app. Дизайн тот же, что у приложения: тёмный Liquid Glass, стеклянные карточки и анимированный фон из осколков.

- **Бэкенд:** Python 3.12, FastAPI, Jinja2 (рендер страницы на сервере, три языка RU / UZ / EN).
- **Фронтенд:** обычные HTML, CSS и немного JS для фона и появления блоков. Без сборки.
- Код приложения (`web/`, `server/`, `api/`, `android/`) не меняется.

## Что делает сервер

| Адрес | Что отдаёт |
|---|---|
| `/` | Страница. Язык из `?lang=ru|uz|en`, cookie или `Accept-Language` |
| `/download` | Редирект 302 на APK из последнего GitHub Release |
| `/download/sha256` | Редирект на файл контрольной суммы |
| `/app` | Редирект в веб-версию |
| `/api/release` | Данные последнего релиза в JSON |
| `/healthz` | Проверка живости для хостинга |

Последний релиз берётся из GitHub API и кешируется в памяти на 10 минут. Если GitHub недоступен, отдаётся прошлый ответ, а без него ссылка ведёт на страницу релизов. Поэтому новый APK появляется на сайте сам: достаточно опубликовать Release с файлом `.apk`.

## Локальный запуск

```bash
cd landing
python -m venv .venv && . .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
uvicorn app:app --reload --port 8010
python -m pytest -q
```

## Переменные окружения (необязательные)

| Имя | По умолчанию |
|---|---|
| `GITHUB_REPO` | `Bloodexchange/ASDTrecker` |
| `WEB_APP_URL` | `https://asdtrecker.vercel.app` |
| `RELEASE_CACHE_SECONDS` | `600` |
| `GITHUB_TOKEN` | не нужен; только чтобы поднять лимит GitHub API |

## Размещение 24/7

**Vercel (рекомендуется, бесплатно, не засыпает).** New Project → тот же репозиторий → Root Directory: `landing`. Vercel сам найдёт FastAPI в `app.py`, а `public/` отдаст через CDN. Это будет отдельный проект, существующий `asdtrecker` не затрагивается.

**Render.** New → Blueprint → репозиторий (файл `render.yaml`). На бесплатном тарифе сервис засыпает после 15 минут без запросов и просыпается ~30–50 секунд; для настоящих 24/7 нужен платный план.

**Docker (Fly.io, Railway, свой сервер).** `docker build -t asdtrecker-landing landing && docker run -p 8000:8000 asdtrecker-landing`.

## Скриншоты

`public/static/img/*.webp` сняты с демо-режима приложения (вымышленные данные) через Playwright на 1440×900 и 390×844.
