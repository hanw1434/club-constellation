"""Parse public directory pages into per-source JSON.

usage: python3 -I scripts/parse_sources.py RAW_DIR OUT_DIR

Reads RAW_DIR/{ics,gsas,hms,hls,seas,hbs}.html (any missing file is skipped) and
writes OUT_DIR/<source>.json. Only whitelisted fields are extracted: name,
category, description, website, contact email, directory link. People's names,
counts and contact forms are never read.
"""
import html, json, pathlib, re, sys

def clean(s):
    s = re.sub(r"(?s)<[^>]+>", " ", s or "")
    return re.sub(r"\s+", " ", html.unescape(s)).strip()

def ics(s):
    # SOCO calendar helper: name + official category + calendar id
    out = []
    for m in re.finditer(r'<td style="width:350px">(.*?)<br><span class="grey-element">(.*?)</span></td>(.*?)</tr>', s, re.S):
        cid = re.search(r"ical_club_(\d+)", m.group(3))
        out.append({"source": "soco", "source_id": cid.group(1) if cid else None,
                    "name": clean(m.group(1)), "category": clean(m.group(2))})
    return out

def campusgroups(s, source, base):
    # Public club_signup?view=all listing (GSAS Engage, HMS SOHO)
    out = []
    for block in re.split(r'<li class="list-group-item"', s)[1:]:
        cid = re.search(r'id="cb_club_(\d+)"|id="club_(\d+)"', block)
        name = re.search(r'<h2 class="media-heading header-cg--h4">\s*<a[^>]*>(.*?)</a>', block, re.S)
        if not (cid and name):
            continue
        cid = cid.group(1) or cid.group(2)
        typ = re.search(r'<p class="h5 media-heading grey-element">(.*?)</p>', block, re.S)
        web = re.search(r'aria-label="Website"[^>]*href="([^"]+)"', block)
        mission = re.search(r'id="club_%s"[^>]*>\s*<strong>Mission</strong><br>(.*?)</p>' % cid, block, re.S)
        typ = clean(typ.group(1)) if typ else ""
        kind, _, tags = typ.partition(" - ")
        out.append({"source": source, "source_id": cid, "name": clean(name.group(1)).lstrip("*").strip(),
                    "category": kind.strip(), "source_tags": [t.strip() for t in tags.split(",") if t.strip()],
                    "description": clean(mission.group(1)) if mission else None,
                    "website_url": web.group(1) if web else None,
                    "directory_url": base})
    return out

def hls(s):
    out = []
    for m in re.finditer(r'<span class="ups-block__accordion-item-title">(.*?)</span>\s*</summary>\s*<div class="ups-block__accordion-contents">(.*?)</div>\s*</details>', s, re.S):
        body = m.group(2)
        paras = re.findall(r"(?s)<p>(.*?)</p>", body)
        desc = " ".join(clean(p) for p in paras if not re.search(r"<strong>\s*(Website|Email)", p))
        web = re.search(r"Website</strong>\s*:?\s*<a href=\"([^\"]+)\"", body)
        mail = re.search(r'mailto:([^"?]+)', body)
        name = clean(m.group(1))
        out.append({"source": "hls", "source_id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
                    "name": name, "category": "", "description": desc or None,
                    "website_url": web.group(1) if web else None,
                    "contact_email": mail.group(1).strip() if mail else None,
                    "directory_url": "https://hls.harvard.edu/student-life/student-orgs/student-organization-directory/"})
    return out

def seas(s):
    out = []
    for m in re.finditer(r'class="accordion-title">(.*?)</a>(.*?)(?=class="accordion-title"|$)', s, re.S):
        group = clean(m.group(1))
        for a in re.finditer(r'<p><a href="([^"]+)"[^>]*>(.*?)</a></p>', m.group(2), re.S):
            name = clean(a.group(2))
            out.append({"source": "seas", "source_id": re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-"),
                        "name": name, "category": group, "website_url": a.group(1),
                        "directory_url": "https://seas.harvard.edu/office-student-organizations/find-seas-affiliated-student-organization"})
    return out

def hbs(s):
    out, seen = [], set()
    for m in re.finditer(r'<a href="(/mba/student-life/activities-government-and-clubs/student-clubs/([a-z0-9-]+))"[^>]*class="hbs-cta-link[^"]*hbs-cta-list-item__link" aria-label="([^"]+)"', s):
        slug = m.group(2)
        if slug in seen or slug == "club-handbook":
            continue
        seen.add(slug)
        rec = {"source": "hbs", "source_id": slug, "name": clean(m.group(3)), "category": "",
               "directory_url": "https://www.hbs.edu" + m.group(1)}
        page = RAW / "hbs" / f"{slug}.html"
        if page.exists():
            rec.update(hbs_page(page.read_text(encoding="utf-8", errors="replace")))
        out.append(rec)
    return out

HBS_ELIGIBILITY = "Open to all matriculated HBS students and their registered partners"

def hbs_page(s):
    # Club page: keep the mission text and the club's role address only.
    # Officer names and personal addresses on the page are deliberately skipped.
    main = re.search(r"(?s)<main.*?</main>", s)
    main = re.sub(r"(?s)<script.*?</script>|<style.*?</style>|<svg.*?</svg>", "", main.group(0) if main else "")
    out = {"eligibility": HBS_ELIGIBILITY}
    head, _, tail = main.partition("Club Email Address")
    desc = clean(head.split("registered partners.")[-1]).lstrip("- ") if "registered partners." in head else ""
    if desc:
        out["description"] = desc
    mail = re.search(r'mailto:([^"?]+)', tail)
    if mail and mail.group(1).endswith("@studentclubs.hbs.edu"):
        out["contact_email"] = mail.group(1)
    return out

TEMPLATE_TEXT = re.compile(r"define your (member benefits|mission)|under group settings|Become part of our vibrant community", re.I)
SOCIAL_KEYS = ("facebook", "instagram", "twitter", "linkedin", "youtube", "tiktok")

def soco_page(s, club_id, page_url, checked_at):
    """Public SOCO club page -> whitelisted fields, or None if it isn't a real public club page.
    Officers, member/event counts and the contact form are deliberately not read."""
    mission = (re.search(r'class="lead section-cont__content-group-mission">(.*?)</p>', s, re.S)
               or re.search(r'About Us\s*</h2>\s*<p class="lead[^"]*">(.*?)</p>', s, re.S))
    if "/webapp/auth/login" in s[:3000] or not mission and "section-cont__content" not in s:
        return None
    desc_html = mission.group(1) if mission else ""
    desc = clean(desc_html)
    if TEMPLATE_TEXT.search(desc):
        desc = ""
    out = {"club_id": club_id, "page_url": page_url, "checked_at": checked_at, "description": desc or None}
    num = page_url.rstrip("/").split("/")[-2]
    if re.search(r'href="(?:/%s/)?club_signup"' % re.escape(num), s):
        out["signup_url"] = f"https://soco.college.harvard.edu/{num}/club_signup"
    contact = re.search(r'(?s)aria-label="Contact and social links">(.*?)</ul>', s)
    block = contact.group(1) if contact else ""
    mail = re.search(r'mailto:([^"?]+)', block)
    if mail:
        out["contact_email"] = mail.group(1).strip()
    socials = []
    for key in SOCIAL_KEYS:  # only links whose list item is displayed
        m = re.search(r'<li class="section-cont__content-contact_%s_display" style="">\s*<a href="([^"]+)"' % key, s)
        if m and m.group(1).startswith("http"):
            socials.append(m.group(1))
    out["socials"] = socials
    # club's own site, if the description links to one (not SOCO itself)
    site = re.search(r'href="(https?://(?!soco\.college\.harvard\.edu)[^"]+)"', desc_html)
    if site and not re.search(r"forms\.gle|docs\.google\.com/forms", site.group(1)):
        out["website_url"] = site.group(1)
    form = re.search(r'href="(https?://(?:forms\.gle|docs\.google\.com/forms)/[^"]+)"', desc_html)
    if form:
        out["join_url"] = form.group(1)
    return out

def soco_pages(raw, out):
    pairs = out / "soco_page_ids.txt"
    if not pairs.exists():
        return
    recs, dropped = [], 0
    for pair in pairs.read_text().split():
        club_id, num = pair.split(":")
        f = raw / "soco" / f"{club_id}.html"
        if not f.exists():
            continue
        checked = __import__("datetime").date.fromtimestamp(f.stat().st_mtime).isoformat()
        rec = soco_page(f.read_text(encoding="utf-8", errors="replace"), club_id,
                        f"https://soco.college.harvard.edu/{num}/home/", checked)
        if rec:
            recs.append(rec)
        else:
            dropped += 1
    (out / "soco_pages.json").write_text(json.dumps(recs, indent=1, ensure_ascii=False))
    print(f"soco_pages: {len(recs)} public, {dropped} not public or not a club page")

PARSERS = {
    "ics": ics,
    "gsas": lambda s: campusgroups(s, "gsas", "https://engage.gsas.harvard.edu/club_signup?view=all"),
    "hms": lambda s: campusgroups(s, "hms", "https://soho.hms.harvard.edu/club_signup?view=all"),
    "hls": hls, "seas": seas, "hbs": hbs,
}

RAW = pathlib.Path("raw")

def main():
    global RAW
    raw, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
    RAW = raw
    out.mkdir(parents=True, exist_ok=True)
    for name, parse in PARSERS.items():
        f = raw / f"{name}.html"
        if not f.exists():
            continue
        recs = parse(f.read_text(encoding="utf-8", errors="replace"))
        (out / f"{name}.json").write_text(json.dumps(recs, indent=1, ensure_ascii=False))
        print(f"{name}: {len(recs)}")
    soco_pages(raw, out)

if __name__ == "__main__":
    main()
