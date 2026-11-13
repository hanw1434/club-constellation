# Club Constellation: spec (decisions settled 13 Nov 2026)

Free, public discovery site for Harvard student organizations: search + ranked list + a "constellation" map, each club card ending in a real next step (join link, site, club email, or directory page). Built from the 12 Nov 2026 product handoff; this file records what the grilling session settled. Where it differs from the handoff, this file wins.

## Identity and access

- Independent student project. Footer: "Independent student project, not affiliated with Harvard." No Harvard logos or crimson shield; no "harvard" in any domain. Free and non-commercial.
- Public, no login, no accounts.
- Email Student Engagement about a sanctioned export in parallel; never block on it.

## Scope

- Pilot covers **everything publicly available**: all ~558 SOCO orgs (from the public calendar list), plus graduate schools with public listings: GSAS, HMS/HSDM, HLS, HBS. Supersedes the earlier "50 College orgs" pilot.
- The SEAS affiliated-groups page lists College groups that register through SOCO, so it only adds website links to matching SOCO orgs (no separate SEAS school).
- SOCO orgs whose public page can't be found yet stay listed, with "Find on SOCO (Harvard login)" as the fallback next step.
- Grad schools without a readable public source (HKS, HGSE, HDS, Chan, GSD) wait until a public source or school-provided list exists.
- Offices, house committees and pre-orientation programs are included as `org_type: office_program`, hidden by default behind a "Show offices & programs" toggle; their card shows "Contact" instead of "How to join".
- PBHA programs: one record each, topic group Service.
- **Unlisted orgs** (in no official directory, e.g. AISST): added only via a listing-request form, after a manual legitimacy check (public website, evidence it is run by Harvard students, a published open way to join or apply). Card says "Not in an official Harvard directory"; website replaces the directory link. AISST is pre-seeded because the owner named it, subject to the same check.
- A coverage line under the search bar always says what is covered.

## Data collection

- **Public = loads signed out.** Signed-in access (the owner's own browser) is used only to discover club page URLs from the SOCO listing. Every field shown on the site comes from a signed-out fetch. Never store or publish content visible only after sign-in.
- SOCO calendar list (`/ics_helper`, public, ~558 orgs) is the source of `official_category`.
- Importer whitelist: description, join link, website, role contact email, social links that clearly belong to the club. Never store people's names, member/officer/event counts, or contact forms. Emails kept only if they are role addresses (club domain or named after the club).
- Slow requests (≥2 s apart), robots.txt respected.

## Data model (`data/orgs.json`)

| Field | Notes |
|---|---|
| `id`, `name`, `school`, `org_type` | required |
| `official_category` | source value, shown on card |
| `topic_group` | one of the shared groups; defaults from category, overridden per club |
| `directory_url` | required unless `source: unlisted` |
| `source` | `soco`, `hls`, `seas`, `gsas`, `hms`, `hbs`, `unlisted` |
| `description`, `website_url`, `contact_email`, `join_url`, `join_instructions`, `eligibility` | optional, public sources only; omit when unknown |
| `join_status` | `join_form`, `comp_audition`, `directory_signup`, `email`, `contact` |
| `tags` | fixed vocabulary, all marked inferred |
| `field_sources`, `checked_at`, `status` | provenance; status `active` / `possibly_stale` / `removed` |
| `x`, `y` | stable map position; existing positions never move |

Topic groups: Arts, Culture & identity, Service, Academic & professional, Science & tech, Sports, Faith, Politics & advocacy, Media, Hobbies & social, Offices & programs.

## Search and ranking

- Keyword search over name, acronym, description, tags, plus a hand-written synonym list. No semantic search in v1.
- Tiers: exact name/acronym → description/tag match → synonym match. Ties alphabetical.
- Show why each club matched.
- No query: list grouped by topic group, alphabetical within; no featured/popular section.
- Interest chips are single-select: one area at a time; selecting it filters the list and flies the map into that area; selecting it again returns to all areas. Selecting an area on the map lights its chip. "My school" filter. Never rank by size, officers or selectivity.

## Map (galaxy, revised 13 Nov 2026)

- A galaxy: starfield background, a coloured nebula per interest area, clubs as stars. Areas sit on a jittered golden-angle spiral, so the layout looks scattered but stays ordered by area.
- **Sub-areas** split big areas into clickable regions (e.g. Academic → Law & justice, Medicine & health, Business & finance, Humanities…). Assigned from a club's first matching tag, with school defaults (HLS → Law, HMS → Medicine, HBS → Business); sub-areas under 4 clubs fold into "Other …". Small areas (Faith, Hobbies, Media) have none.
- **Relationships**: each club links to its 3 most similar clubs in the same area (TF-IDF over name, description and tags). Lines ("constellations") appear only after clicking into a cluster, and only those touching it (areas without clusters show theirs once entered); a selected club's links light up; its card lists "Related clubs".
- **Navigation is a drill-down**: at galaxy level, clicking an area (name, glow or any star) flies into it; inside an area, clicking a cluster (name, glow or any of its stars) zooms onto it; inside a cluster, clicking a star opens the club. A breadcrumb ("All areas › Academic › Law & justice") flies back out; hover hints say what a click will do. Club names appear when zoomed in, placed so they never overlap.
- **Star size** = how actionable and connected a club is: description, a real join route, website, and number of related clubs. Owner left the metric open; member counts were rejected because only ~190 of 1,025 orgs publish them and the spec forbids implying popularity. During a search, better matches also grow.
- Positions are stable from layout version 2 on (one-time reflow when the galaxy replaced the hex islands); new clubs settle in near their neighbours.
- The ranked list stays the accessible equivalent; the legend ("How to read the map") explains geometry, lines and size.
- Whole site uses a dark galaxy colour scheme; area colours live in `app.js` (`GROUP_COLOR`).
- Mobile: "List | Map" tabs under the search bar, List first; card opens as a full-height sheet.

## Cards

- List row status label: Join form / Comp / audition / Sign up on <directory> / Email the club / Contact.
- Club's own join instructions shown before the directory sign-up link.
- Eligibility shown when published; otherwise "Check eligibility with the club" for grad orgs.
- "Report a correction" opens a prefilled email to a dedicated project inbox.

## Stack, hosting, analytics

- One static page, plain HTML/CSS/JS, no build step, data in JSON. GitHub Pages default address.
- GoatCounter (cookie-free): page views and outbound clicks by type. Never record search text.

## Refresh

- Weekly GitHub Action re-fetches seed URLs signed out, checks links, diffs the calendar list for new/removed orgs, and opens an issue. It never edits the JSON; changes are applied by hand. Broken pages show "possibly stale" until reviewed.

## Pilot test

10–15 Harvard students incl. first-years; each finds two unfamiliar clubs and a way to join. Continue if ≥ 2/3 reach a real next step for both without help. Record map-first vs search-first.

## Assumed while the owner was away (revisit)

- With grad orgs in the pilot, the default view shows all schools; eligibility labels carry the "can I join?" signal.
- HBS cards show the eligibility every HBS club page states ("open to all matriculated HBS students and their registered partners").
- Unlisted orgs need evidence from their own site plus an independent Harvard source (AIST: Berkman Klein Center event series).
- `raw/` pages and `data/sources/*.json` are local-only (git-ignored) because they contain names and personal addresses.

## Deferred

Accounts, social graph, popularity, personalized recommendations, events, club-admin dashboards, semantic search, club self-verification.
