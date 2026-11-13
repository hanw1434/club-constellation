# Club Constellation

A free, public, static site for finding Harvard student organizations by interest and seeing how to join each one. Independent student project, not affiliated with Harvard. Decisions and scope live in [`.scratch/club-constellation/spec.md`](.scratch/club-constellation/spec.md).

## Run it locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765. There is no build step: `index.html`, `styles.css`, `app.js`, `config.js` and `data/*.json` are the whole site.

## Before publishing

Fill in [`config.js`](config.js):

- `correctionsEmail`: a dedicated project inbox (it appears on every card).
- `listingFormUrl`: the form organizations outside every directory use to request a listing.
- `goatcounterCode`: a GoatCounter site code for cookie-free page views and outbound-click counts. Search text is never sent.

Deploy by pushing to GitHub and enabling Pages (Settings → Pages → deploy from branch, root). Use the default `*.github.io` address; never put "harvard" in a custom domain.

## Data pipeline

All site data comes from **signed-out** fetches of public pages, 3 seconds apart:

| Source | What it gives |
|---|---|
| SOCO calendar list (`/ics_helper`) | every College org's name and official category |
| SOCO club pages (`/<page>/home/`) | description, SOCO sign-up link, club email |
| GSAS Engage, HMS SOHO public listings | name, type, description, website |
| HLS org directory | description, website, club email |
| HBS club pages | mission, club role address, eligibility |
| SEAS affiliated-groups page | website links for matching College orgs |
| `data/unlisted.json` | hand-checked orgs outside every directory |

```bash
bash scripts/refresh.sh        # ~25 min: fetch everything, parse, rebuild data/orgs.json
```

Steps inside: `scripts/fetch.py` (polite fetcher) → `scripts/parse_sources.py` (whitelisted fields only) → `scripts/build_data.py` (topic groups, tags, join route, privacy filters, stable map slots). `data/review.json` lists what needs a human: dropped personal-looking emails (addresses are not stored), SOCO orgs without a public page, unmatched SEAS groups.

### SOCO page numbers (the one signed-in step)

SOCO's listing of club page links needs a Harvard login, so `data/sources/soco_page_ids.txt` (`club_id:page_number` pairs) is refreshed by hand: sign in to `soco.college.harvard.edu/club_signup?view=all` in your own browser and copy each club's ID and page number. Only those IDs are taken from the signed-in page; every field shown on the site is then fetched signed out, and pages that don't load publicly are dropped.

### Weekly refresh

`.github/workflows/refresh.yml` runs every Monday: it rebuilds on the runner, compares with the committed `data/orgs.json`, checks outbound links, and opens an issue. It never commits. Apply accepted changes locally and commit them yourself.

## Privacy rules

- Never commit `raw/` or `data/sources/*.json` (raw pages contain officer names and personal addresses; `.gitignore` covers both).
- Never store people's names, member/officer/event counts, or personal emails. Keep role addresses only.
- Never show or store anything visible only after sign-in.

## Adding an organization outside every directory

Requests arrive through the listing form. Add one to `data/unlisted.json` only after checking all three:

1. a public website,
2. evidence it is run by Harvard students (its own site plus an independent Harvard source),
3. a published, open way to join or apply.

Record the evidence URLs under `legitimacy`, then run `python3 -I scripts/build_data.py`.
