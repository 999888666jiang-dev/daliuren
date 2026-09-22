"""Fetch public-domain-tagged source scans and review pages, recording hashes.

Usage: python scripts/fetch-sources.py [--originals] [--review]
No website extraction is treated as a verified transcription.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
from pathlib import Path
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

SESSION = requests.Session()
SESSION.mount("https://", HTTPAdapter(max_retries=Retry(total=4, backoff_factor=3, status_forcelist=[429,500,502,503,504], respect_retry_after_header=True)))

ROOT = Path(__file__).resolve().parents[1]
HEADERS = {"User-Agent": "LiurenResearchMVP/0.1 (public domain source verification)"}
FILES = {
    "wyg-0808": ("文淵閣四庫全書 0808冊.djvu", "wenyuange-siku-0808.djvu"),
    "daquan-v1": ("CADAL06054168 六壬大全·卷一.djvu", "daquan-volume-01.djvu"),
    "daquan-v7": ("CADAL06054173 六壬大全·卷七.djvu", "daquan-volume-07.djvu"),
    "daquan-v9": ("CADAL06054175 六壬大全·卷九.djvu", "daquan-volume-09.djvu"),
    "daquan-v11-v12": ("CADAL06054177 六壬大全·卷十一~卷十二.djvu", "daquan-volume-11-12.djvu"),
    "zhizhi": ("UW-000BF1868C5Y821662 御定六壬直指.pdf", "yuding-liuren-zhizhi.pdf"),
    "cuiyan": ("NCL-06574 六壬粹言.pdf", "liuren-cuiyan.pdf"),
}

def metadata(title: str, page: int | None = None) -> dict:
    cache = ROOT/"library/review"/(hashlib.sha256((title+str(page)).encode()).hexdigest()+".metadata.json")
    if cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    params = {"action":"query","format":"json","titles":"File:"+title,"prop":"imageinfo","iiprop":"url|extmetadata|size"}
    if page:
        params.update(iiurlwidth=1600, iiurlparam=f"page{page}")
    response = SESSION.get("https://commons.wikimedia.org/w/api.php", params=params, headers=HEADERS, timeout=60)
    response.raise_for_status()
    info=next(iter(response.json()["query"]["pages"].values()))["imageinfo"][0]
    cache.parent.mkdir(parents=True,exist_ok=True)
    cache.write_text(json.dumps(info,ensure_ascii=False,indent=2),encoding="utf-8")
    return info

def fetch(url: str, target: Path) -> dict:
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        temporary = target.with_suffix(target.suffix+".part")
        with SESSION.get(url, headers=HEADERS, stream=True, timeout=(30, 120)) as response:
            response.raise_for_status()
            with temporary.open("wb") as output:
                for chunk in response.iter_content(1024*1024):
                    output.write(chunk)
        temporary.replace(target)
    digest = hashlib.sha256()
    with target.open("rb") as source:
        for chunk in iter(lambda: source.read(1024*1024), b""):
            digest.update(chunk)
    return {"path":target.relative_to(ROOT).as_posix(), "bytes":target.stat().st_size, "sha256":digest.hexdigest(), "url":url}

def originals():
    manifest = []
    for key, (title, filename) in FILES.items():
        info = metadata(title)
        license_name = info.get("extmetadata",{}).get("LicenseShortName",{}).get("value", "")
        if license_name != "Public domain":
            raise RuntimeError(f"Expected explicit public domain tag for {title}; got {license_name}")
        item = fetch(info["url"].split("?")[0], ROOT/"library/originals"/filename)
        item.update(id=key, title=title, descriptionUrl=info["descriptionurl"], license=license_name,
                    rightsBasis="Wikimedia Commons file metadata PD designation; retained for provenance, not an independent legal opinion.",
                    retrievedAt=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), transcriptionStatus="untranscribed")
        manifest.append(item)
        print(f"Fetched {key}: {item['bytes']} bytes", flush=True)
    (ROOT/"library/source-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

def review(key, pages):
    title = FILES[key][0]
    import urllib.parse
    canonical=title.replace(" ","_")
    digest=hashlib.md5(canonical.encode()).hexdigest()
    escaped=urllib.parse.quote(canonical)
    template=f"https://thumb.wikimedia.org/wikipedia/commons/thumb/{digest[0]}/{digest[:2]}/{escaped}/page{{n}}-1920px-{escaped}.jpg"
    def page(n):
        return fetch(template.format(n=n), ROOT/f"library/review/{key}-p{n}.jpg")
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        rows=list(executor.map(page,pages))
    (ROOT/f"library/review/{key}-review-downloads.json").write_text(json.dumps(rows,ensure_ascii=False,indent=2),encoding="utf-8")
    print("Review thumbnails downloaded; these are not verified merely by downloading.")

if __name__ == "__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("--originals",action="store_true")
    parser.add_argument("--review",action="store_true")
    parser.add_argument("--file",default="daquan-v1",choices=FILES)
    parser.add_argument("--pages",default="11,12,13,14,15")
    args=parser.parse_args()
    if args.originals: originals()
    if args.review: review(args.file,[int(n) for n in args.pages.split(",")])
