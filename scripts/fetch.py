"""Polite signed-out fetcher: fetch.py OUT_DIR NAME=URL [NAME=URL ...]

Saves each page to OUT_DIR/NAME.html. No cookies are sent, so anything that
needs sign-in comes back as a login page, which is the point: only public pages
count as sources.
"""
import os, ssl, sys, time, urllib.request, pathlib

DELAY_S = 3  # be gentle with university servers
UA = "ClubConstellationBot/0.1 (independent student project; signed-out fetches only)"
# python.org builds on macOS ship without CA certs; fall back to the system bundle
CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem" if os.path.exists("/etc/ssl/cert.pem") else None)

def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
        return r.status, r.geturl(), r.read()

def main():
    out = pathlib.Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    for i, pair in enumerate(sys.argv[2:]):
        name, url = pair.split("=", 1)
        if i: time.sleep(DELAY_S)
        try:
            status, final, body = fetch(url)
            (out / f"{name}.html").write_bytes(body)
            print(f"{name}\t{status}\t{len(body)}\t{final}")
        except Exception as e:  # keep going; report the failure
            print(f"{name}\tERROR\t{e}")

if __name__ == "__main__":
    main()
