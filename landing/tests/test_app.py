import sys
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app as landing  # noqa: E402

PAYLOAD = {
    "tag_name": "v9.9.9",
    "html_url": "https://github.com/Bloodexchange/ASDTrecker/releases/tag/v9.9.9",
    "published_at": "2026-11-18T14:50:41Z",
    "assets": [
        {"name": "ASDTrecker-9.9.9.apk", "size": 116479, "browser_download_url": "https://example.test/a.apk"},
        {"name": "ASDTrecker-9.9.9.apk.sha256", "size": 87, "browser_download_url": "https://example.test/a.apk.sha256"},
    ],
}


@pytest.fixture
def client(monkeypatch):
    landing._cache.update(release=None, at=0.0)

    async def fake_fetch():
        return landing.parse_release(PAYLOAD)

    monkeypatch.setattr(landing, "fetch_release", fake_fetch)
    return TestClient(landing.app)


def test_page_shows_latest_version_and_links(client):
    r = client.get("/?lang=ru")
    assert r.status_code == 200
    assert "Деньги под контролем." in r.text
    assert "v9.9.9 · 114 КБ" in r.text
    assert 'href="https://asdtrecker.vercel.app"' in r.text
    assert r.cookies.get("lang") == "ru"


@pytest.mark.parametrize("lang,phrase", [("uz", "Pul nazorat ostida."), ("en", "Money under control.")])
def test_languages(client, lang, phrase):
    r = client.get(f"/?lang={lang}")
    assert phrase in r.text and f'<html lang="{lang}">' in r.text


def test_accept_language(client):
    r = client.get("/", headers={"Accept-Language": "en-US,en;q=0.9"})
    assert "Money under control." in r.text


def test_download_redirects_to_apk(client):
    r = client.get("/download", follow_redirects=False)
    assert r.status_code == 302 and r.headers["location"] == "https://example.test/a.apk"
    r = client.get("/download/sha256", follow_redirects=False)
    assert r.headers["location"] == "https://example.test/a.apk.sha256"


def test_api_and_health(client):
    assert client.get("/api/release").json()["version"] == "9.9.9"
    assert client.get("/healthz").json() == {"ok": True}
    assert client.get("/static/site.css").status_code == 200


def test_github_down_uses_fallback(monkeypatch):
    landing._cache.update(release=None, at=0.0)

    async def broken():
        raise httpx.ConnectError("down")

    monkeypatch.setattr(landing, "fetch_release", broken)
    c = TestClient(landing.app)
    r = c.get("/download", follow_redirects=False)
    assert r.headers["location"].endswith("/releases/latest")
    assert "releases" in c.get("/?lang=en").text


def test_parse_release_without_apk():
    assert landing.parse_release({"tag_name": "v1", "assets": []}) is None
