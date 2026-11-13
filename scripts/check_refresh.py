"""Compare the committed data with a fresh rebuild and check outbound links.

usage: python3 -I scripts/check_refresh.py OLD_orgs.json NEW_orgs.json > report.md

Prints a Markdown report for a human to act on. It never edits data: the
committed data/orgs.json only changes when someone reviews and commits.
"""
import json, os, ssl, sys, time, urllib.request

FIELDS = ("description", "contact_email", "website_url", "join_url", "signup_url", "directory_url")
UA = "ClubConstellationBot/0.1 (independent student project; link check)"
CTX = ssl.create_default_context(cafile="/etc/ssl/cert.pem" if os.path.exists("/etc/ssl/cert.pem") else None)

def link_ok(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA}, method="GET")
        with urllib.request.urlopen(req, timeout=20, context=CTX) as r:
            return r.status < 400, str(r.status)
    except Exception as e:
        code = getattr(e, "code", None)
        return False, str(code or type(e).__name__)

def main():
    old = {r["id"]: r for r in json.load(open(sys.argv[1]))}
    new = {r["id"]: r for r in json.load(open(sys.argv[2]))}
    added = sorted(set(new) - set(old))
    removed = sorted(set(old) - set(new))
    changed = []
    for i in sorted(set(old) & set(new)):
        diff = [f for f in FIELDS if old[i].get(f) != new[i].get(f)]
        if diff:
            changed.append((i, diff))
    broken = []
    urls = sorted({u for r in new.values() for u in (r.get("website_url"), r.get("join_url")) if u and u.startswith("http")})
    for u in urls:
        ok, why = link_ok(u)
        if not ok:
            broken.append((u, why, [r["id"] for r in new.values() if u in (r.get("website_url"), r.get("join_url"))]))
        time.sleep(1)
    out = [f"# Weekly data refresh\n", f"{len(new)} records rebuilt; {len(urls)} outbound links checked.\n",
           "Nothing here was applied automatically. Review, then commit the data you accept.\n"]
    def section(title, rows):
        out.append(f"\n## {title} ({len(rows)})\n")
        out.extend(f"- {r}\n" for r in rows[:300])
        if not rows:
            out.append("- none\n")
    section("New organizations", [f"`{i}` {new[i]['name']}" for i in added])
    section("No longer found (mark `possibly_stale` or remove after review)", [f"`{i}` {old[i]['name']}" for i in removed])
    section("Changed fields", [f"`{i}` {new[i]['name']}: {', '.join(d)}" for i, d in changed])
    section("Broken links", [f"{u} ({why}) used by {', '.join(ids)}" for u, why, ids in broken])
    sys.stdout.write("".join(out))

if __name__ == "__main__":
    main()
