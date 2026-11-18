"""ASDTrecker landing site: a small FastAPI service.

Serves the presentation page (RU / UZ / EN), resolves the latest Android APK
from GitHub Releases and redirects downloads to it. Works on Vercel (Python
runtime, zero config: this file exports `app`) and on any host that can run
`uvicorn app:app` (Render, Railway, Fly, Docker).
"""

from __future__ import annotations

import asyncio
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from i18n import LANGS, TEXT

ROOT = Path(__file__).parent
REPO = os.environ.get("GITHUB_REPO", "Bloodexchange/ASDTrecker")
WEB_APP_URL = os.environ.get("WEB_APP_URL", "https://asdtrecker.vercel.app")
RELEASES_URL = f"https://github.com/{REPO}/releases"
CACHE_SECONDS = int(os.environ.get("RELEASE_CACHE_SECONDS", "600"))


@dataclass
class Release:
    version: str
    apk_url: str
    sha256_url: str | None
    size_bytes: int | None
    published_at: str | None
    page_url: str
    live: bool  # False when GitHub could not be reached and no cache exists


FALLBACK = Release(
    version="1.3.1",
    apk_url=f"https://github.com/{REPO}/releases/latest",
    sha256_url=None,
    size_bytes=None,
    published_at=None,
    page_url=RELEASES_URL,
    live=False,
)

_cache: dict[str, object] = {"release": None, "at": 0.0}
_lock = asyncio.Lock()


def parse_release(data: dict) -> Release | None:
    """Pick the APK (and its .sha256) from a GitHub release payload."""
    assets = data.get("assets") or []
    apk = next((a for a in assets if str(a.get("name", "")).lower().endswith(".apk")), None)
    if not apk:
        return None
    sha = next((a for a in assets if a.get("name") == f"{apk['name']}.sha256"), None)
    return Release(
        version=str(data.get("tag_name", "")).lstrip("v") or FALLBACK.version,
        apk_url=apk["browser_download_url"],
        sha256_url=sha["browser_download_url"] if sha else None,
        size_bytes=apk.get("size"),
        published_at=data.get("published_at"),
        page_url=data.get("html_url") or RELEASES_URL,
        live=True,
    )


async def fetch_release() -> Release | None:
    headers = {"Accept": "application/vnd.github+json", "User-Agent": "asdtrecker-landing"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(timeout=8) as client:
        r = await client.get(f"https://api.github.com/repos/{REPO}/releases/latest", headers=headers)
        r.raise_for_status()
        return parse_release(r.json())


async def latest_release() -> Release:
    """Latest release, cached in memory; serves the stale copy if GitHub fails."""
    cached = _cache["release"]
    if cached and time.monotonic() - float(_cache["at"]) < CACHE_SECONDS:
        return cached  # type: ignore[return-value]
    async with _lock:
        cached = _cache["release"]
        if cached and time.monotonic() - float(_cache["at"]) < CACHE_SECONDS:
            return cached  # type: ignore[return-value]
        try:
            fresh = await fetch_release()
        except (httpx.HTTPError, ValueError, KeyError):
            fresh = None
        if fresh:
            _cache.update(release=fresh, at=time.monotonic())
            return fresh
        if cached:
            _cache["at"] = time.monotonic() - CACHE_SECONDS + 60  # retry in a minute
            return cached  # type: ignore[return-value]
        return FALLBACK


def pick_lang(request: Request) -> str:
    q = request.query_params.get("lang", "").lower()
    if q in LANGS:
        return q
    cookie = request.cookies.get("lang", "")
    if cookie in LANGS:
        return cookie
    for part in request.headers.get("accept-language", "").lower().split(","):
        code = part.split(";")[0].strip()[:2]
        if code in LANGS:
            return code
    return "ru"


def human_size(size: int | None, lang: str) -> str:
    if not size:
        return ""
    units = {"ru": ("КБ", "МБ"), "uz": ("KB", "MB"), "en": ("KB", "MB")}[lang]
    if size < 1024 * 1024:
        return f"{round(size / 1024)} {units[0]}"
    return f"{size / 1024 / 1024:.1f} {units[1]}"


app = FastAPI(title="ASDTrecker landing", docs_url=None, redoc_url=None, openapi_url=None)
templates = Jinja2Templates(directory=ROOT / "templates")
# On Vercel the CDN serves public/ directly; locally FastAPI serves the same files.
app.mount("/static", StaticFiles(directory=ROOT / "public" / "static", check_dir=False), name="static")


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; "
        "object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    )
    return response


@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    lang = pick_lang(request)
    release = await latest_release()
    published = (release.published_at or "")[:10]
    response = templates.TemplateResponse(
        request,
        "index.html",
        {
            "t": TEXT[lang],
            "lang": lang,
            "langs": LANGS,
            "release": release,
            "size": human_size(release.size_bytes, lang),
            "published": published,
            "web_url": WEB_APP_URL,
            "repo_url": f"https://github.com/{REPO}",
        },
    )
    response.headers["Cache-Control"] = "public, max-age=0, s-maxage=300, stale-while-revalidate=600"
    if request.query_params.get("lang") in LANGS:
        response.set_cookie("lang", lang, max_age=31536000, samesite="lax")
    return response


@app.get("/download")
@app.get("/download/apk")
async def download_apk():
    release = await latest_release()
    return RedirectResponse(release.apk_url, status_code=302, headers={"Cache-Control": "no-store"})


@app.get("/download/sha256")
async def download_sha256():
    release = await latest_release()
    return RedirectResponse(release.sha256_url or release.page_url, status_code=302)


@app.get("/app")
async def open_web_app():
    return RedirectResponse(WEB_APP_URL, status_code=302)


@app.get("/api/release")
async def api_release():
    release = await latest_release()
    return JSONResponse(asdict(release), headers={"Cache-Control": "public, max-age=60"})


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.get("/robots.txt")
async def robots():
    return Response("User-agent: *\nAllow: /\n", media_type="text/plain")
