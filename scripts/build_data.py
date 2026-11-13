"""Merge per-source JSON into the site's data file.

usage: python3 -I scripts/build_data.py            (run from the project root)

Reads data/sources/*.json (+ data/sources/soco_pages.json once SOCO page URLs
are known, + hand-curated data/unlisted.json) and writes:
  data/orgs.json    records shown on the site
  data/layout.json  island centers (kept stable across runs)
  data/review.json  things a human should look at (never contains email addresses)
Map positions are stable: a club keeps its slot forever; new clubs take the
next free slot in their island.
"""
import datetime, json, math, pathlib, re

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, DATA = ROOT / "data" / "sources", ROOT / "data"

GROUPS = ["Arts", "Culture & identity", "Service", "Academic & professional", "Science & tech",
          "Sports", "Faith", "Politics & advocacy", "Media", "Hobbies & social", "Offices & programs"]

# --- topic groups -----------------------------------------------------------
CATEGORY_GROUP = {  # official category -> default group (None = decide by keywords)
    "Cultural and Racial Initiatives": "Culture & identity", "Creative and Performing Arts": "Arts",
    "Club Sports": "Sports", "Religious and Spiritual Life": "Faith", "Government and Politics": "Politics & advocacy",
    "Public Service": "Service", "PBHA": "Service", "Media and Publications": "Media",
    "Women's Initiatives": "Culture & identity", "Gender and Sexuality": "Culture & identity",
    "Health and Wellness": "Service", "Peer Counseling/Peer Education": "Service", "SEAS": "Science & tech",
    "Affinity student group": "Culture & identity", "Community Outreach Group": "Service",
    "Specialty Interest Group": "Academic & professional", "Departmental Groups": "Academic & professional",
    "Language Tables": "Culture & identity", "Student Government": "Politics & advocacy",
}
OFFICE_CATEGORIES = {"Office", "House Committee", "Pre-Orientation Program", "Offices", "Department",
                     "Student Center Fellows"}
BROAD_DEFAULT = {"Academic and Pre-Professional": "Academic & professional",
                 "Department Sponsored Student Organization": "Academic & professional",
                 "Hobbies and Special Interests": "Hobbies & social", "College Life": "Hobbies & social"}

KW = [  # checked in order; first hit wins
    ("Faith", r"christian|catholic|jewish|hillel|chabad|muslim|islam|hindu|buddhis|sikh|church|bible|faith|spiritual|orthodox|interfaith|gospel|ministr|latter-day|quaker"),
    ("Culture & identity", r"africa|caribbean|black\b|afro|asian|chinese|korean|japanese|taiwan|vietnam|filipin|latin|hispanic|mexic|brazil|arab\b|middle east|persian|armenia|turkish|irish|italian|greek|native|indigenous|cultur|heritage|diaspora|queer|lgbt|women|womxn|first-gen|first gen|veteran|disab|india|pakistan|south asian|international student"),
    ("Sports", r"sport|soccer|rugby|tennis|squash|ski\b|skiing|sail|climb|running|cycling|martial|karate|judo|taekwondo|fencing|frisbee|ultimate|volleyball|basketball|hockey|lacrosse|polo\b|swim|rowing|crew\b|boxing|equestrian|golf|badminton|athlet|fitness|yoga"),
    ("Arts", r"danc|ballet|a cappella|acapella|choir|chorus|sing|music|orchestra|band\b|jazz|theat|drama|film|photo|\barts?\b|paint|poetry|comedy|improv|design|fashion|opera|musical|glee|drum"),
    ("Media", r"magazine|journal\b|newspaper|crimson|radio|podcast|publication|press\b|yearbook|lampoon|television"),
    ("Science & tech", r"robot|comput|coding|software|\bdata\b|machine (learning|intelligence)|\bai\b|artificial intelligence|quantum|engineer|physics|\bmath|chemi|biolog|biotech|neuro|astronom|space|aero|energy|tech\b|technolog|hack|cyber|blockchain|crypto|statistic|science"),
    ("Service", r"service|volunteer|tutor|mentor|outreach|habitat|charit|relief|homeless|refugee|prison|literacy"),
    ("Politics & advocacy", r"politic|democrat|republican|policy|government|debate|model un|united nations|advoca|justice|rights|election|civic|liberty|socialis|conservative|progressive|activis|labor\b"),
    ("Academic & professional", r"consult|financ|invest|business|entrepreneur|startup|venture|econom|marketing|\blaw\b|legal|medic|professional|career|banking|real estate|equity|histor|philosoph|classics|literat|psycholog|research|honor society|review\b"),
    ("Hobbies & social", r"game|chess|anime|cooking|food|wine|knit|puzzle|trivia|social|outdoor|hiking|travel|magic|esports|bridge\b|poker"),
]
KW = [(g, re.compile(r"\b(?:%s)" % p, re.I)) for g, p in KW]

def keyword_group(text):
    for g, rx in KW:
        if rx.search(text or ""):
            return g
    return None

def topic_group(rec):
    if rec["org_type"] == "office_program":
        return "Offices & programs"
    cat = rec.get("official_category") or ""
    if cat in CATEGORY_GROUP:
        return CATEGORY_GROUP[cat]
    if cat == "Academic and Pre-Professional":  # too broad: pull science/tech clubs out
        return "Science & tech" if keyword_group(rec["name"]) == "Science & tech" else "Academic & professional"
    # keyword decides; name first, then description; fall back by category / grad default
    return (keyword_group(rec["name"]) or keyword_group((rec.get("description") or "")[:400])
            or BROAD_DEFAULT.get(cat) or "Academic & professional")

# --- tags (fixed vocabulary; all inferred) ------------------------------------
TAGS = [
    ("robotics", r"robot"), ("ai", r"\bai\b|artificial intelligence|machine (learning|intelligence)"),
    ("computer science", r"computer|computing|computation|coding|programming language|software|hackathon|developer|\bcs\b"),
    ("data science", r"\bdata\b|analytics|statistic"), ("engineering", r"engineer|maker|fabricat"),
    ("space", r"outer space|space (exploration|science|technology|industry)|aerospace|aeronaut|astronom|astrophys|rocket|satellite"), ("energy & climate", r"energy|climate|environment|sustainab|solar"),
    ("biology & medicine", r"biolog|biotech|neuro|medic|pre-med|premed|clinic|surg"),
    ("physics & math", r"physics|\bmath|quantum"), ("chemistry", r"chemi"),
    ("business", r"business|entrepreneur|startup|venture|consult|marketing"),
    ("finance", r"financ|invest|banking|capital\b|equity|trading|fintech"), ("economics", r"econom"),
    ("law", r"\blaw\b|legal|pre-law|prelaw|mock trial|litigat"), ("policy & government", r"policy|government|politic|public affairs"),
    ("debate & speech", r"debate|speech|mock trial|model un|united nations|forensic"),
    ("writing & literature", r"writ|literar|poetry|\bbooks?\b|novel|literature"),
    ("journalism & publishing", r"journal|magazine|newspaper|publication|press\b|editorial|review\b"),
    ("radio & podcasting", r"radio|podcast|broadcast"), ("film & photography", r"\bfilm|photo|cinema|video"),
    ("theater", r"theat|drama|\bplays?\b|musical|opera|playwright"), ("comedy & improv", r"comedy|improv|sketch|lampoon|humor"),
    ("a cappella & choir", r"a cappella|acapella|choir|chorus|chorale|glee|vocal|singing|singers"),
    ("music", r"music|orchestra|band\b|jazz|ensemble|symphon|piano|drum|guitar|composer"),
    ("dance", r"danc|ballet|hip hop|bhangra|salsa|k-pop|kpop"),
    ("visual arts & design", r"\barts?\b|paint|drawing|sculpt|design|fashion|architect|craft"),
    ("games", r"\bgames?\b|gaming|chess|esports|bridge\b|poker|puzzle|trivia|quiz"),
    ("outdoors", r"outdoor|hiking|climb|mountain|camping|sail"),
    ("team sports", r"soccer|rugby|basketball|volleyball|hockey|lacrosse|frisbee|ultimate|football|baseball|softball|cricket|polo\b"),
    ("racket sports", r"tennis|squash|badminton|table tennis|ping pong|pickleball"),
    ("martial arts", r"martial|karate|judo|taekwondo|kung fu|jiu|fencing|boxing|wrestling|aikido"),
    ("fitness & endurance", r"running|marathon|triathlon|cycling|fitness|yoga|lifting|swim|rowing|crew\b|\bski\b|skiing"),
    ("food & cooking", r"\bfood|cook|culinar|baking|wine|coffee"),
    ("volunteering", r"volunteer|community service|charit|nonprofit|non-profit|habitat"),
    ("tutoring & mentoring", r"tutor|mentor|teach|literacy|youth|kids|children|\bcamps?\b"),
    ("public health", r"public health|global health|health equity|mental health|wellness"),
    ("social justice", r"justice|human rights|civil rights|equity\b|advoca|activis|refugee|immigra|prison|labor\b|homeless"),
    ("international affairs", r"international|foreign|diplomac|global affairs"),
    ("faith & spirituality", KW[0][1].pattern[len(r"\b(?:"):-1]),
    ("african & caribbean", r"africa|caribbean|nigeria|ghana|ethiop|kenya|haiti|jamaica"),
    ("black community", r"black\b|afro"),
    ("asian & asian american", r"asian|chinese|korean|japanese|taiwan|vietnam|filipin|thai\b|hmong|malaysia|singapore|indonesia|cambodia|hong kong"),
    ("south asian", r"south asian|india|pakistan|bangladesh|sri lanka|nepal|desi\b|bhangra"),
    ("latin american", r"latin|hispanic|mexic|brazil|puerto ric|cuba|colombia|chile|peru\b|argentin|dominican"),
    ("middle eastern & north african", r"arab\b|middle east|persian|iran|turkish|turkey|armenia|israel|palestin|lebanes|egypt|kurd"),
    ("european", r"europe|irish|ireland|italian|greek|french|german|spanish|portug|polish|ukrain|russian|scandinav|nordic|balkan|romania"),
    ("indigenous", r"native|indigenous|first nations|pacific islander|hawai"),
    ("lgbtq+", r"queer|lgbt|\bgay\b|lesbian|transgender|gender and sexuality|pride\b"),
    ("women & gender", r"women|womxn|feminis|\bgender\b|\bgirls\b"),
    ("first-gen & low-income", r"first-gen|first gen|first-generation|low-income|fgli"),
    ("veterans & military", r"veteran|military|rotc"), ("disability", r"disab|deaf|neurodiver"),
    ("history & philosophy", r"histor|philosoph|classics|ethic"), ("psychology", r"psycholog|cognitive"),
    ("languages", r"language|linguist|translation"), ("careers", r"career|professional development|recruit|internship"),
    ("architecture & cities", r"urban|architect|real estate|\bcity\b|cities"),
    ("anime & pop culture", r"anime|manga|comic|fandom|sci-fi|science fiction"),
]
TAGS = [(t, re.compile(r"\b(?:%s)" % p, re.I)) for t, p in TAGS]

def infer_tags(rec, limit=6):
    name, desc = rec["name"], (rec.get("description") or "")[:600]
    hits = [t for t, rx in TAGS if rx.search(name)]
    hits += [t for t, rx in TAGS if t not in hits and rx.search(desc)]
    return hits[:limit]

# --- contact filtering (privacy) ---------------------------------------------
STOP = {"harvard", "college", "undergraduate", "university", "the", "and", "for", "of", "club", "society",
        "association", "student", "students", "school", "group", "law", "medical", "hms", "hls"}
GENERIC_LOCAL = {"info", "contact", "board", "hello", "team", "officers", "president", "presidents", "chair",
                 "chairs", "exec", "admin", "club", "mail", "general", "inquiries", "leadership", "cochairs"}

def name_tokens(name):
    words = re.findall(r"[a-z]+", name.lower())
    initials = "".join(w[0] for w in words if w not in {"of", "the", "and", "for", "at", "in"})
    paren = re.findall(r"\(([A-Za-z]{2,10})\)", name)
    return {w for w in words if len(w) >= 4 and w not in STOP} | {initials} | {p.lower() for p in paren}

# issued to organizations, never to people: HBS club addresses, HLS org mailing lists
ROLE_DOMAINS = {"studentclubs.hbs.edu", "mail.law.harvard.edu"}

def is_role_address(email, name):
    local = re.sub(r"[^a-z]", "", email.split("@")[0].lower())
    if email.split("@")[-1].lower() in ROLE_DOMAINS or local in GENERIC_LOCAL:
        return True
    if local in re.findall(r"[a-z]+", name.lower()):  # e.g. ai@ for "AI Club"
        return True
    return any(len(t) >= 2 and t in local for t in name_tokens(name))

VENDOR_SOCIAL = re.compile(r"readyeducation|campusgroups", re.I)

def social_ok(url, name):
    handle = re.sub(r"[^a-z0-9]", "", url.rstrip("/").split("/")[-1].lower())
    if not handle or handle.isdigit() or VENDOR_SOCIAL.search(url):
        return False
    return any(len(t) >= 3 and t in handle for t in name_tokens(name))

# --- join route -------------------------------------------------------------
DIRECTORY_NAME = {"soco": "SOCO", "gsas": "GSAS Engage", "hms": "HMS SOHO", "hls": "the HLS directory",
                  "hbs": "the HBS club page", "seas": "SEAS"}
COMP_RX = re.compile(r"\b(comp|comps|comping|audition|auditions|tryouts?|try-outs?)\b", re.I)
FORM_RX = re.compile(r"https?://(?:forms\.gle|docs\.google\.com/forms)/[^\s\"'<>)]+")
ELIG_RX = re.compile(r"\b(open to (?:all |any )?[^.;:!?]{3,70})", re.I)

def join_fields(rec):
    desc = rec.get("description") or ""
    form = FORM_RX.search(desc)
    if form and not rec.get("join_url"):
        rec["join_url"] = form.group(0)
        rec["join_form"] = True
    if rec["org_type"] == "office_program":
        return "contact"
    if COMP_RX.search(desc) or COMP_RX.search(rec.get("join_instructions") or ""):
        return "comp_audition"
    if rec.get("join_form") or rec.get("join_url"):
        return "join_form"
    if rec.get("signup_url"):
        return "directory_signup"
    if rec.get("contact_email"):
        return "email"
    return "page"

# --- records ----------------------------------------------------------------
SCHOOL = {"soco": "Harvard College", "gsas": "GSAS", "hms": "HMS / HSDM", "hls": "HLS", "hbs": "HBS",
          "unlisted": "Harvard College"}

def load(name):
    f = SRC / f"{name}.json"
    return json.loads(f.read_text()) if f.exists() else []

def checked(name):
    f = SRC / f"{name}.json"
    return datetime.date.fromtimestamp(f.stat().st_mtime).isoformat() if f.exists() else None

def norm(name):
    w = [x for x in re.findall(r"[a-z0-9]+", name.lower()) if x not in {"harvard", "college", "undergraduate", "the", "of", "at", "club"}]
    return " ".join(w)

def base_record(src, r, review):
    rec = {"id": f"{src}-{r['source_id']}", "name": r["name"], "school": SCHOOL.get(src, src.upper()),
           "source": src, "official_category": r.get("category") or "",
           "description": (r.get("description") or "").strip() or None,
           "website_url": r.get("website_url"), "directory_url": r.get("directory_url"),
           "eligibility": r.get("eligibility"), "join_url": r.get("join_url"),
           "field_sources": {}, "checked_at": checked("ics" if src == "soco" else src), "status": "active"}
    rec["org_type"] = "office_program" if rec["official_category"] in OFFICE_CATEGORIES else "student_org"
    for f in ("description", "website_url", "directory_url"):
        if rec.get(f):
            rec["field_sources"][f] = r.get("directory_url") or r.get("page_url")
    email = r.get("contact_email")
    if email:
        if is_role_address(email, r["name"]):
            rec["contact_email"] = email
            rec["field_sources"]["contact_email"] = r.get("page_url") or r.get("directory_url")
        else:
            review.append({"id": rec["id"], "issue": "contact email dropped: looked like a personal address"})
    socials = [u for u in r.get("socials", []) if social_ok(u, r["name"])]
    if socials:
        rec["social_urls"] = socials
    return rec

def build():
    review, recs = [], []
    soco_pages = {p["club_id"]: p for p in load("soco_pages")}
    for r in load("ics"):
        page = soco_pages.get(r["source_id"])
        if page:
            r = {**r, **{k: v for k, v in page.items() if v}}
        rec = base_record("soco", r, review)
        if page:
            rec["directory_url"] = page["page_url"]
            rec["signup_url"] = page.get("signup_url")
            rec["checked_at"] = page.get("checked_at") or rec["checked_at"]
            for f in ("description", "website_url"):
                if rec.get(f):
                    rec["field_sources"][f] = page["page_url"]
        else:
            # until its public page is found, the fallback is SOCO's directory (Harvard login)
            rec["directory_url"] = "https://soco.college.harvard.edu/club_signup?view=all"
            rec["directory_fallback"] = True
        recs.append(rec)

    # SEAS page: enrichment only (its groups register through Harvard College)
    by_norm = {norm(r["name"]): r for r in recs}
    for s in load("seas"):
        hit = by_norm.get(norm(s["name"]))
        if hit and not hit.get("website_url"):
            hit["website_url"] = s["website_url"]
            hit["field_sources"]["website_url"] = s["directory_url"]
        elif not hit:
            review.append({"id": "seas-" + s["source_id"], "issue": f"SEAS-listed group not matched to a SOCO org: {s['name']}"})

    seen = set()
    for src in ("gsas", "hms"):
        for r in load(src):
            if (src, r["source_id"]) in seen:
                continue
            seen.add((src, r["source_id"]))
            rec = base_record(src, r, review)
            rec["signup_url"] = r["directory_url"]
            if src == "gsas" and "Offices" not in rec["official_category"] and r.get("source_tags"):
                rec["source_tags"] = r["source_tags"]
            recs.append(rec)
    for src in ("hls", "hbs"):
        for r in load(src):
            recs.append(base_record(src, r, review))
    for r in json.loads((DATA / "unlisted.json").read_text()) if (DATA / "unlisted.json").exists() else []:
        rec = base_record("unlisted", r, review)
        rec["unlisted"] = True
        rec["school"] = r.get("school") or rec["school"]
        rec["join_url"] = r.get("join_url")
        rec["eligibility"] = r.get("eligibility")
        rec["directory_url"] = None
        rec["signup_url"] = r.get("signup_url")
        rec["join_instructions"] = r.get("join_instructions")
        rec["checked_at"] = r.get("checked_at")
        rec["field_sources"] = r.get("field_sources", {})
        recs.append(rec)

    for rec in recs:
        rec["topic_group"] = topic_group(rec)
        rec["tags"] = infer_tags(rec)
        el = ELIG_RX.search(rec.get("description") or "")
        if el and not rec.get("eligibility"):
            rec["eligibility"] = el.group(1)[0].upper() + el.group(1)[1:]
        rec["join_status"] = join_fields(rec)
        rec["directory_name"] = DIRECTORY_NAME.get(rec["source"])
        rec["acronym"] = acronym(rec["name"])
        if not (rec.get("signup_url") or rec.get("contact_email") or rec.get("website_url") or rec.get("directory_url")):
            review.append({"id": rec["id"], "issue": "no next step available"})
        if rec.get("directory_fallback"):
            review.append({"id": rec["id"], "issue": "SOCO page not found yet (card falls back to SOCO directory login)"})
    layout(recs)
    for rec in recs:
        rec.pop("join_form", None)
        for k in [k for k, v in rec.items() if v in (None, "", [], {})]:
            del rec[k]
    recs.sort(key=lambda r: r["name"].lower())
    (DATA / "orgs.json").write_text(json.dumps(recs, ensure_ascii=False, separators=(",", ":")))
    (DATA / "review.json").write_text(json.dumps(review, indent=1, ensure_ascii=False))
    return recs, review

def acronym(name):
    paren = re.findall(r"\(([A-Za-z][A-Za-z&.\-]{1,12})\)", name)
    if paren:
        return paren[-1]
    words = [w for w in re.findall(r"[A-Za-z]+", name) if w.lower() not in {"of", "the", "and", "for", "at", "in", "on"}]
    return "".join(w[0] for w in words).upper() if len(words) >= 2 else None

# --- stable layout ------------------------------------------------------------
SPACING = 14

def hex_slot(i):
    """Slot i on a hexagonal spiral -> (x, y); consecutive slots are neighbours."""
    if i == 0:
        return 0.0, 0.0
    k = 1
    while 1 + 3 * k * (k + 1) <= i:
        k += 1
    j = i - (1 + 3 * (k - 1) * k)
    dirs = [(1, 0), (1, -1), (0, -1), (-1, 0), (-1, 1), (0, 1)]
    q, r = -k, k  # start corner of ring k (axial coords); walking dirs in order traces the ring
    side, step = divmod(j, k)
    for s in range(side):
        q += dirs[s][0] * k; r += dirs[s][1] * k
    q += dirs[side][0] * step; r += dirs[side][1] * step
    return SPACING * (q + r / 2), SPACING * (r * math.sqrt(3) / 2)

def island_radius(n):
    k = 0
    while 1 + 3 * k * (k + 1) < n * 1.25 + 6:  # headroom so new clubs fit without moving others
        k += 1
    return (k + 1.5) * SPACING

def layout(recs):
    lf = DATA / "layout.json"
    prev = json.loads(lf.read_text()) if lf.exists() else {"islands": {}}
    old = {}
    of = DATA / "orgs.json"
    if of.exists():
        old = {r["id"]: r for r in json.loads(of.read_text()) if "slot" in r}
    islands = prev["islands"]
    sizes = {g: sum(1 for r in recs if r["topic_group"] == g) for g in GROUPS}
    placed = [(i["x"], i["y"], i["r"]) for i in islands.values()]
    for g in sorted(GROUPS, key=lambda g: -sizes[g]):
        if g in islands or not sizes[g]:
            continue
        rad = island_radius(sizes[g])
        t = 0.0
        while True:  # walk out along a spiral until the island fits
            x, y = 9 * t * math.cos(t), 9 * t * math.sin(t)
            if all(math.hypot(x - px, y - py) >= rad + pr + 30 for px, py, pr in placed):
                break
            t += 0.05
        islands[g] = {"x": round(x, 1), "y": round(y, 1), "r": round(rad, 1)}
        placed.append((x, y, rad))
    for g in GROUPS:
        members = [r for r in recs if r["topic_group"] == g]
        used = set()
        for r in members:  # keep existing slots
            o = old.get(r["id"])
            if o and o.get("topic_group") == g:
                r["slot"] = o["slot"]; used.add(o["slot"])
        order = sorted((r for r in members if "slot" not in r),
                       key=lambda r: ([t for t, _ in TAGS].index(r["tags"][0]) if r["tags"] else 999, r["name"].lower()))
        nxt = 0
        for r in order:
            while nxt in used:
                nxt += 1
            r["slot"] = nxt; used.add(nxt)
        for r in members:
            dx, dy = hex_slot(r["slot"])
            r["x"], r["y"] = round(islands[g]["x"] + dx, 1), round(islands[g]["y"] + dy, 1)
    lf.write_text(json.dumps({"islands": islands, "groups": GROUPS}, indent=1))

if __name__ == "__main__":
    # self-check: hex spiral slots never collide
    pts = {tuple(round(v, 3) for v in hex_slot(i)) for i in range(400)}
    assert len(pts) == 400, "hex spiral produced overlapping slots"
    assert is_role_address("acs@mail.law.harvard.edu", "American Constitution Society (ACS)")
    assert not is_role_address("jane.doe@college.harvard.edu", "Harvard Robotics Club")
    assert not social_ok("https://twitter.com/ReadyEducation", "Harvard Undergraduate Consulting Group")
    recs, review = build()
    from collections import Counter
    print(len(recs), "records;", len(review), "review items")
    print(Counter(r["topic_group"] for r in recs))
    print(Counter(r["join_status"] for r in recs))
