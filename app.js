(() => {
  "use strict";
  const CFG = window.CC_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const SVGNS = "http://www.w3.org/2000/svg";
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // One colour per interest area: the galaxy palette (also used by chips and list rows)
  const GROUP_COLOR = {
    "Arts": "#ff9e7a", "Culture & identity": "#ff7ac0", "Service": "#6ee7a8",
    "Academic & professional": "#7fa7ff", "Science & tech": "#4fe3f0", "Sports": "#ffd166",
    "Faith": "#b9a2ff", "Politics & advocacy": "#ff7070", "Media": "#c8f58a",
    "Hobbies & social": "#f3a8ff", "Offices & programs": "#9aa7b8",
  };
  const color = (g) => GROUP_COLOR[g] || "#9aa7b8";
  const NOT_COVERED = "HKS, HGSE, HDS, Harvard Chan and GSD";

  // Everyday words -> tags (or "group:<topic group>"). Hand-written; extend as pilot queries come in.
  const SYN = {
    "coding": ["computer science"], "programming": ["computer science"], "cs": ["computer science"],
    "software": ["computer science"], "hacking": ["computer science"], "ml": ["ai"], "machine learning": ["ai"],
    "artificial intelligence": ["ai"], "robots": ["robotics"], "robot": ["robotics"], "data": ["data science"],
    "statistics": ["data science"], "hardware": ["engineering"], "building": ["engineering"],
    "singing": ["a cappella and choir"], "sing": ["a cappella and choir"], "acapella": ["a cappella and choir"],
    "choir": ["a cappella and choir"], "band": ["music"], "orchestra": ["music"], "instrument": ["music"],
    "theatre": ["theater"], "acting": ["theater"], "drama": ["theater"], "improv": ["comedy and improv"],
    "comedy": ["comedy and improv"], "writing": ["writing and literature"], "poetry": ["writing and literature"],
    "newspaper": ["journalism and publishing"], "journalism": ["journalism and publishing"],
    "magazine": ["journalism and publishing"], "photography": ["film and photography"], "movies": ["film and photography"],
    "volunteering": ["volunteering", "group:Service"], "volunteer": ["volunteering", "group:Service"],
    "community service": ["volunteering", "group:Service"], "service": ["volunteering", "group:Service"],
    "tutoring": ["tutoring and mentoring"], "teaching": ["tutoring and mentoring"], "kids": ["tutoring and mentoring"],
    "startup": ["business"], "startups": ["business"], "entrepreneurship": ["business"], "consulting": ["business"],
    "investing": ["finance"], "stocks": ["finance"], "econ": ["economics"], "politics": ["policy and government", "group:Politics & advocacy"],
    "government": ["policy and government"], "debate": ["debate and speech"], "model un": ["debate and speech"],
    "mun": ["debate and speech"], "pre law": ["law"], "prelaw": ["law"], "premed": ["biology and medicine"],
    "pre med": ["biology and medicine"], "medicine": ["biology and medicine"], "health": ["public health", "biology and medicine"],
    "mental health": ["public health"], "climate": ["energy and climate"], "environment": ["energy and climate"],
    "sustainability": ["energy and climate"], "rockets": ["space"], "astronomy": ["space"], "math": ["physics and math"],
    "chess": ["games"], "gaming": ["games"], "board games": ["games"], "hiking": ["outdoors"], "climbing": ["outdoors"],
    "soccer": ["team sports"], "frisbee": ["team sports"], "tennis": ["racket sports"], "running": ["fitness and endurance"],
    "yoga": ["fitness and endurance"], "boxing": ["martial arts"], "cooking": ["food and cooking"], "baking": ["food and cooking"],
    "religion": ["faith and spirituality", "group:Faith"], "faith": ["faith and spirituality", "group:Faith"],
    "lgbt": ["lgbtq+"], "lgbtq": ["lgbtq+"], "queer": ["lgbtq+"], "gay": ["lgbtq+"], "feminism": ["women and gender"],
    "first gen": ["first gen and low income"], "fgli": ["first gen and low income"], "veterans": ["veterans and military"],
    "art": ["visual arts and design", "group:Arts"], "drawing": ["visual arts and design"], "painting": ["visual arts and design"],
    "fashion": ["visual arts and design"], "manga": ["anime and pop culture"], "dancing": ["dance"], "kpop": ["dance"],
    "philosophy": ["history and philosophy"], "jobs": ["careers"], "internships": ["careers"], "latino": ["latin american"],
    "latinx": ["latin american"], "hispanic": ["latin american"], "black": ["black community"], "african": ["african and caribbean"],
    "indian": ["south asian"], "arab": ["middle eastern and north african"], "sports": ["group:Sports"],
    "culture": ["group:Culture & identity"], "arts": ["group:Arts"], "media": ["group:Media"], "tech": ["group:Science & tech"],
  };
  const MULTI_KEYS = Object.keys(SYN).filter((k) => k.includes(" ")).sort((a, b) => b.length - a.length);
  const STOP = new Set("a an and or the i im i'm me my like love enjoy want interested in into of for to with about club clubs group groups harvard org orgs organization organizations something stuff things".split(" "));

  const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ").replace(/[^a-z0-9+]+/g, " ").trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const safeUrl = (u) => (typeof u === "string" && /^(https?:\/\/|mailto:)/i.test(u.trim()) ? u.trim() : null);
  const hasWord = (field, term) => term.length >= 4 ? (" " + field).includes(" " + term) : (" " + field + " ").includes(" " + term + " ");

  // area: the one selected interest area (chip bar + list filter + map focus); null = all areas
  const state = { orgs: [], byId: new Map(), groups: [], q: "", area: null, school: "", offices: false,
    selected: null, focus: null, tiers: new Map() };
  let L = null, view = null, bounds = null;

  // ---------- search ----------
  function index(o) {
    o._name = norm(o.name);
    const noThe = o._name.replace(/^the /, "");
    // names a user might type exactly: "the harvard crimson" -> "harvard crimson", "crimson"
    o._alts = new Set([o._name, noThe, noThe.replace(/^(harvard )?((college|undergraduate|university) )*/, "").trim()]);
    o._acr = norm(o.acronym || "");
    o._desc = norm(o.description);
    o._tags = (o.tags || []).map(norm);
    o._cat = norm(`${o.official_category || ""} ${o.topic_group} ${o.theme || ""}`);
    o._route = o.join_status !== "page" && !o.directory_fallback;
    // Star size (screen px at the reference zoom): how much you can act on, plus how connected the club is.
    // Deliberately not member counts or selectivity.
    const act = (o.description ? 1 : 0) + (o._route ? 1.2 : 0) + (o.website_url ? 0.4 : 0);
    o._r = 2.1 + act * 0.85 + Math.min((o.links || []).length, 8) * 0.3;
  }

  function parseQuery(q) {
    let n = " " + norm(q) + " ";
    const terms = [];
    for (const k of MULTI_KEYS) if (n.includes(" " + k + " ")) { terms.push(k); n = n.replace(" " + k + " ", " "); }
    for (const w of n.trim().split(" ")) if (w && !STOP.has(w)) terms.push(w);
    return { full: norm(q), terms };
  }

  function snippet(text, term) {
    const low = (text || "").toLowerCase();
    let i = low.indexOf(term);  // whole phrase first, else its first word
    if (i < 0) { term = term.split(" ")[0]; i = low.indexOf(term); }
    if (i < 0) return null;
    const s = Math.max(0, i - 38), e = Math.min(text.length, i + term.length + 38);
    return `${s ? "…" : ""}${esc(text.slice(s, i))}<mark>${esc(text.slice(i, i + term.length))}</mark>${esc(text.slice(i + term.length, e))}${e < text.length ? "…" : ""}`;
  }

  function matchTerm(o, t) {
    if (hasWord(o._name, t)) return { tier: 2, why: "name" };
    const tag = o._tags.find((x) => hasWord(x, t));
    if (tag) return { tier: 3, why: `topic: ${esc(tag)}` };
    if (hasWord(o._cat, t)) return { tier: 3, why: `category: ${esc(o.official_category || o.topic_group)}` };
    if (hasWord(o._desc, t)) return { tier: 3, why: `description: “${snippet(o.description, t) || esc(t)}”` };
    for (const target of SYN[t] || []) {
      if (target.startsWith("group:") ? o.topic_group === target.slice(6) : o._tags.includes(target))
        return { tier: 4, why: `related: ${esc(t)} → ${esc(target.replace("group:", ""))}` };
    }
    return null;
  }

  function search(list, q) {
    const { full, terms } = parseQuery(q);
    const out = [];
    for (const o of list) {
      let tier = 9, hits = 0; const why = [];
      if (full && (o._alts.has(full) || (o._acr.length >= 2 && full === o._acr))) {
        tier = 1; why.push(full === o._acr ? "acronym" : "exact name");
      }
      for (const t of terms) {
        const m = matchTerm(o, t);
        if (m) { hits++; tier = Math.min(tier, m.tier); if (why.length < 2 && !why.includes(m.why)) why.push(m.why); }
      }
      if (tier < 9) out.push({ o, tier, hits, why });
    }
    // relevance first; then working join route; ties alphabetical (never size or selectivity)
    out.sort((a, b) => a.tier - b.tier || b.hits - a.hits || b.o._route - a.o._route || a.o._name.localeCompare(b.o._name));
    return out;
  }

  // ---------- filtering + list ----------
  const groupShown = (g) => g !== "Offices & programs" || state.offices;
  // the list narrows to the selected area; the map keeps other areas visible (dimmed) for context
  const listVisible = (o) => visible(o) && (!state.area || o.topic_group === state.area);
  function visible(o) {
    if (!groupShown(o.topic_group)) return false;
    if (o.org_type === "office_program" && !state.offices) return false;
    if (state.school && o.school !== state.school) return false;
    return true;
  }

  // The one best next step; the list row label and the card's main button both come from here.
  function primaryAction(o) {
    const office = o.org_type === "office_program";
    if (o.join_url) return [o.join_url, "Open the join form", "join", "Join form"];
    if (o.signup_url && !office) return [o.signup_url, `Sign up on ${o.directory_name} (Harvard login)`, "join", `Sign up on ${o.directory_name}`];
    if (o.contact_email) return ["mailto:" + o.contact_email, office ? "Email this office" : "Email the club", "email", office ? "Contact" : "Email the club"];
    if (o.website_url) return [o.website_url, office ? "Visit the website" : "Visit the club's website", "website", office ? "Contact" : "Visit website"];
    if (o.directory_url) return [o.directory_url, o.directory_fallback ? "Find this club on SOCO (Harvard login)" : `See it on ${o.directory_name}`, "directory",
      o.directory_fallback ? "Find on SOCO" : "See club page"];
    return null;
  }

  function statusLabel(o) {
    if (o.join_status === "comp_audition") return "Comp / audition";
    const p = primaryAction(o);
    return p ? p[3] : "See details";
  }

  function rowHtml(o, why) {
    const meta = [o.school, o.theme || o.official_category].filter(Boolean).map(esc).join(" · ");
    return `<li><button class="row" data-id="${esc(o.id)}" style="--c:${color(o.topic_group)}" aria-current="${state.selected === o.id}">
      <span class="name">${esc(o.name)}</span>
      ${o.description ? `<span class="desc">${esc(o.description)}</span>` : ""}
      <span class="meta"><span class="status ${esc(o.join_status)}">${esc(statusLabel(o))}</span><span>${meta}</span></span>
      ${why && why.length ? `<span class="why">Matched ${why.join(" · ")}</span>` : ""}
    </button></li>`;
  }

  function render() {
    const q = state.q.trim();
    // The list mirrors the map: while a cluster view is open, the list shows that cluster in the
    // same reading order. A search still covers the whole area (and dims the cluster's other stars).
    const scope = !q && !detail.hidden ? clusterOf(state.focus) : null;
    const vis = state.orgs.filter((o) => listVisible(o) && (!scope || (o.topic_group === scope.g && (!scope.t || o.theme === scope.t))));
    let html = "", shown, res = null;
    if (q) {
      res = search(vis, q);
      shown = new Set(res.map((r) => r.o.id));
      state.tiers = new Map(res.map((r) => [r.o.id, r.tier]));
    } else {
      shown = new Set(vis.map((o) => o.id));
      state.tiers = new Map();
    }
    layoutDetail();  // place the cluster view first, so the list can follow its on-screen order
    if (q) {
      $("#count").textContent = res.length ? `${res.length} match “${q}”` : "";
      html = res.length ? `<ol>${res.map((r) => rowHtml(r.o, r.why)).join("")}</ol>`
        : `<p class="empty">No clubs match “${esc(q)}”. Try a broader interest such as “music”, “service” or “tech”.</p>`;
    } else if (scope) {
      const at = new Map(detailOrder.map((id, i) => [id, i]));
      const rows = [...vis].sort((a, b) => (at.get(a.id) ?? 1e9) - (at.get(b.id) ?? 1e9));
      const name = scope.t || scope.g;
      $("#count").innerHTML = `${rows.length} clubs in ${esc(name)}, in the order shown on the map · `
        + `<button type="button" class="link-btn" id="widen">Show all ${scope.t ? esc(scope.g) : "areas"}</button>`;
      html = `<h2 class="group-h" style="--c:${color(scope.g)}"><span class="sw"></span>${esc(name)} <span>(${rows.length})</span></h2><ol>${rows.map((o) => rowHtml(o)).join("")}</ol>`;
    } else {
      $("#count").textContent = state.area ? `${vis.length} organizations in ${state.area}` : `${vis.length} organizations, grouped by interest`;
      for (const g of state.groups) {
        const members = vis.filter((o) => o.topic_group === g);
        if (!members.length) continue;
        html += `<h2 class="group-h" style="--c:${color(g)}"><span class="sw"></span>${esc(g)} <span>(${members.length})</span></h2><ol>${members.map((o) => rowHtml(o)).join("")}</ol>`;
      }
    }
    $("#results").innerHTML = html;
    for (const [id, el] of stars) {
      el.classList.toggle("hidden", !visible(state.byId.get(id)));
      el.classList.toggle("dim", !!q && !shown.has(id));
    }
    for (const [g, ge] of Object.entries(groupEls)) {
      const on = groupShown(g);
      ge.nebula.style.display = ge.label.style.display = on ? "" : "none";
      if (ge.lines) for (const ln of ge.lines.children) ln.classList.toggle("dim", !!q && !(shown.has(ln.dataset.a) && shown.has(ln.dataset.b)));
    }
    $("#clear").hidden = !(q || state.area || state.school || state.offices);
    onViewChange();
  }

  // ---------- card ----------
  function link(url, text, type) {
    const u = safeUrl(url);
    return u ? `<a href="${esc(u)}" target="_blank" rel="noopener" data-out="${type}">${esc(text)}</a>` : "";
  }

  function cardHtml(o) {
    const office = o.org_type === "office_program";
    const primary = primaryAction(o);
    const p = primary && safeUrl(primary[0]);
    const join = [
      o.join_instructions ? `<p>${esc(o.join_instructions)}</p>` : "",
      o.join_status === "comp_audition" ? `<p>This club recruits through a comp, audition or tryout; its description and links have the timing.</p>` : "",
      p ? `<a class="primary" href="${esc(p)}" target="_blank" rel="noopener" data-out="${primary[2]}">${esc(primary[1])}</a>` : "",
      o.eligibility ? `<p class="fine">Who can join: ${esc(o.eligibility)}</p>`
        : (!office && o.school !== "Harvard College" ? `<p class="fine">Check eligibility with the club.</p>` : ""),
    ].join("");
    const others = [
      o.website_url && primary?.[2] !== "website" ? `<li>${link(o.website_url, "Website", "website")}</li>` : "",
      o.contact_email && primary?.[2] !== "email" ? `<li>${link("mailto:" + o.contact_email, o.contact_email, "email")}</li>` : "",
      ...(o.social_urls || []).map((u) => `<li>${link(u, (u.match(/\/\/(?:www\.)?([^/.]+)/) || [, "Social"])[1], "social")}</li>`),
      o.directory_url && primary?.[2] !== "directory" ? `<li>${link(o.directory_url, o.directory_fallback ? "SOCO directory (Harvard login)" : `Official listing: ${o.directory_name}`, "directory")}</li>` : "",
    ].join("");
    const related = (o.links || []).map((id) => state.byId.get(id)).filter(Boolean).slice(0, 6);
    const sources = [...new Set(Object.values(o.field_sources || {}).map(safeUrl).filter(Boolean))];
    const correction = CFG.correctionsEmail
      ? `<p class="fine"><a href="mailto:${esc(CFG.correctionsEmail)}?subject=${encodeURIComponent(`Correction: ${o.name} [${o.id}]`)}&body=${encodeURIComponent("What is wrong or missing on this card?\n\n")}">Report a correction</a></p>` : "";
    return `<button type="button" class="close" aria-label="Close details">×</button>
      <p class="kicker" style="--c:${color(o.topic_group)}"><span class="sw"></span>${esc([o.topic_group, o.theme].filter(Boolean).join(" › "))}</p>
      <h2 id="card-title" tabindex="-1">${esc(o.name)}</h2>
      <p class="fine">${esc([o.school, o.official_category].filter(Boolean).join(" · "))}</p>
      ${o.unlisted ? `<p class="unlisted">Not in an official Harvard directory. Listed after a check of its public website and join route.</p>` : ""}
      ${o.description ? `<p>${esc(o.description)}</p>` : `<p class="fine">No public description yet.</p>`}
      <h3>${office ? "Contact" : "How to join"}</h3>${join || `<p class="fine">No public join route found yet.</p>`}
      ${others ? `<h3>Links</h3><ul class="links">${others}</ul>` : ""}
      ${related.length ? `<h3>Related clubs</h3><ul class="related">${related.map((r) => `<li><button type="button" class="link-btn" data-rel="${esc(r.id)}" style="--c:${color(r.topic_group)}"><span class="sw"></span>${esc(r.name)}</button></li>`).join("")}</ul>` : ""}
      ${o.tags?.length ? `<h3>Topics <span class="fine">(inferred)</span></h3><div class="tags">${o.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      <h3>About this record</h3>
      <p class="fine">Last checked ${esc(o.checked_at || "unknown")}${o.status === "possibly_stale" ? ` · <span class="stale">possibly out of date</span>` : ""}</p>
      ${sources.length ? `<p class="fine">Sources: ${sources.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(", ")}</p>` : ""}
      ${correction}`;
  }

  function select(id, { fromMap = false } = {}) {
    const o = state.byId.get(id);
    if (!o) return;
    state.selected = id;
    // With the map on screen, the map moves to the club's cluster (and the list follows it).
    // Without it (phone list tab) only the popup opens: map focus, area and list stay as they were.
    const mapShown = $("#map-pane").offsetWidth > 0;
    if (mapShown) {
      state.focus = { group: o.topic_group, theme: o.theme || null };
      if (state.area !== o.topic_group) { state.area = o.topic_group; drawChips(); }  // its area's chip lights up
    }
    const card = $("#card");
    card.innerHTML = cardHtml(o);
    card.hidden = false;
    card.querySelector(".close").addEventListener("click", closeCard);
    applyFocus();
    const c = mapShown && clusterOf(state.focus);
    if (c) {  // show the club inside its cluster view (this also narrows the list to that cluster)
      if (!fromMap) animateTo(clusterBox(c));
      showDetail();
    } else if (mapShown) { if (!fromMap) centerOn(o); else onViewChange(); }
    document.querySelectorAll(".row[aria-current='true']").forEach((r) => r.setAttribute("aria-current", "false"));
    const row = document.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
    if (row) { row.setAttribute("aria-current", "true"); row.scrollIntoView({ block: "nearest" }); }
    // with a cluster view open, the popup docks over the list so the whole cluster stays visible
    card.classList.toggle("dock-left", !detail.hidden);
    history.replaceState(null, "", "#" + encodeURIComponent(id));
    card.querySelector("#card-title").focus();
  }

  function closeCard() {
    const id = state.selected;
    $("#card").hidden = true;
    state.selected = null;
    applyFocus();
    onViewChange();
    layoutDetail();  // stars slide back into the space the popup used
    history.replaceState(null, "", location.pathname + location.search);
    const node = id && !detail.hidden && dbody.querySelector(`.node[data-id="${CSS.escape(id)}"]`);
    const row = id && document.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
    (node || (row && row.offsetParent ? row : $("#q"))).focus();
  }

  // ---------- galaxy map ----------
  const svg = $("#map"), world = $("#world"), sky = $("#sky");
  const stars = new Map(), groupEls = {};
  let layers = {};
  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  function seeded(seed) {  // small deterministic RNG so the sky and nebulae look the same on every visit
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  }

  function buildMap() {
    const defs = el("defs", {}, svg);
    svg.insertBefore(defs, world);
    const halo = el("radialGradient", { id: "halo" }, defs);
    el("stop", { offset: "0", "stop-color": "#fff", "stop-opacity": ".55" }, halo);
    el("stop", { offset: "1", "stop-color": "#fff", "stop-opacity": "0" }, halo);
    layers = Object.fromEntries(["nebulae", "lines", "selLines", "stars", "themes", "groups", "names", "sel"].map((k) => [k, el("g", { class: k }, world)]));
    state.groups.forEach((g, i) => {
      const c = color(g);
      const star = el("radialGradient", { id: `star-${i}` }, defs);
      el("stop", { offset: "0", "stop-color": "#ffffff" }, star);
      el("stop", { offset: ".35", "stop-color": c }, star);
      el("stop", { offset: "1", "stop-color": c, "stop-opacity": ".35" }, star);
      const neb = el("radialGradient", { id: `neb-${i}` }, defs);
      el("stop", { offset: "0", "stop-color": c, "stop-opacity": ".30" }, neb);
      el("stop", { offset: ".55", "stop-color": c, "stop-opacity": ".10" }, neb);
      el("stop", { offset: "1", "stop-color": c, "stop-opacity": "0" }, neb);
      const isl = L.islands[g];
      if (!isl) return;
      // nebula: a few overlapping soft clouds per area, plus a faint one per sub-area
      const ng = el("g", {}, layers.nebulae), rnd = seeded(i * 7919 + 17);
      for (let k = 0; k < 3; k++) {
        const rx = isl.r * (1.05 + rnd() * 0.45), ry = isl.r * (0.7 + rnd() * 0.4);
        const dx = (rnd() - 0.5) * isl.r * 0.5, dy = (rnd() - 0.5) * isl.r * 0.5;
        el("ellipse", { cx: isl.x + dx, cy: isl.y + dy, rx, ry, fill: `url(#neb-${i})`, "data-neb": "", "data-group": g,
          transform: `rotate(${Math.round(rnd() * 180)} ${isl.x + dx} ${isl.y + dy})` }, ng);
      }
      const themes = (L.themes || {})[g] || {};
      // each cluster's own glow is clickable too
      for (const [t, th] of Object.entries(themes)) el("circle", { cx: th.x, cy: th.y, r: th.r * 1.15, fill: `url(#neb-${i})`, class: "tneb",
        "data-neb": "", "data-group": g, "data-theme": t }, ng);
      // area label: a real button (keyboard and screen readers) that flies to the area
      const lg = el("g", { class: "glabel", role: "button", tabindex: "0", "data-group": g, style: `--c:${c}`,
        "aria-label": `${g}: ${isl.n} clubs. Zoom in` }, layers.groups);
      const lt = el("text", { "text-anchor": "middle" }, lg);
      lt.textContent = g + " ";
      el("tspan", { class: "cnt" }, lt).textContent = isl.n;
      // sub-area labels, shown when the area is in focus
      const tg = el("g", { "data-group": g, style: "display:none" }, layers.themes);
      for (const [t, th] of Object.entries(themes)) {
        const b = el("g", { class: "tlabel", role: "button", tabindex: "-1", "data-group": g, "data-theme": t, style: `--c:${c}`,
          "aria-label": `${t}: ${th.n} clubs. Zoom in` }, tg);
        el("text", { "text-anchor": "middle" }, b).textContent = `${t} · ${th.n}`;
      }
      groupEls[g] = { nebula: ng, label: lg, labelText: lt, themes: tg, lines: null, i };
    });
    for (const o of state.orgs) {
      const i = state.groups.indexOf(o.topic_group);
      stars.set(o.id, el("circle", { cx: o.x, cy: o.y, r: 3, class: "star", fill: `url(#star-${i})`, "data-id": o.id }, layers.stars));
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const isl of Object.values(L.islands)) {
      minX = Math.min(minX, isl.x - isl.r); maxX = Math.max(maxX, isl.x + isl.r);
      minY = Math.min(minY, isl.y - isl.r - 60); maxY = Math.max(maxY, isl.y + isl.r);
    }
    const padX = 160, padY = 50;  // wide side margins: area labels extend past their clusters
    bounds = { x: minX - padX, y: minY - padY, w: maxX - minX + 2 * padX, h: maxY - minY + 2 * padY };
    setView({ ...bounds });
  }

  function ensureLines(g) {
    const ge = groupEls[g];
    if (ge.lines) return;
    ge.lines = el("g", { "data-group": g, style: `--c:${color(g)}` }, layers.lines);
    for (const o of state.orgs) {
      if (o.topic_group !== g) continue;
      for (const b of o.links || []) {
        const p = state.byId.get(b);
        if (!p || o.id >= b) continue;
        const ln = el("line", { x1: o.x, y1: o.y, x2: p.x, y2: p.y, "data-a": o.id, "data-b": b }, ge.lines);
        if (state.q) ln.classList.toggle("dim", !(state.tiers.has(o.id) && state.tiers.has(b)));
      }
    }
    styleLines();
  }

  const pxW = () => svg.clientWidth || 800, pxH = () => svg.clientHeight || 600;
  const unitsPerPx = () => view.w / pxW();
  function setView(v) {
    const ar = pxH() / pxW();
    const cx = v.x + v.w / 2, cy = v.y + v.h / 2;
    let w = Math.max(v.w, v.h / ar);  // fit the requested box inside the visible area
    w = Math.min(bounds.w * 1.4, Math.max(40, w));
    const h = w * ar;
    view = { x: cx - w / 2, y: cy - h / 2, w, h };
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    onViewChange();
  }
  let anim = 0, animFallback = 0;
  function animateTo(target, ms = 650, done) {
    cancelAnimationFrame(anim);
    clearTimeout(animFallback);
    if (REDUCED || document.hidden) { setView(target); if (done) done(); return; }
    // if animation frames are throttled (background tab), still arrive and finish
    animFallback = setTimeout(() => { cancelAnimationFrame(anim); setView(target); if (done) done(); }, ms + 300);
    const from = { ...view }, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (now) => {
      const t = Math.min(1, (now - t0) / ms), e = ease(t);
      // zoom geometrically so flying in feels even
      const w = from.w * Math.pow(target.w / from.w, e), h = from.h * Math.pow(target.h / from.h, e);
      const cx = from.x + from.w / 2 + (target.x + target.w / 2 - from.x - from.w / 2) * e;
      const cy = from.y + from.h / 2 + (target.y + target.h / 2 - from.y - from.h / 2) * e;
      setView({ x: cx - w / 2, y: cy - h / 2, w, h });
      if (t < 1) anim = requestAnimationFrame(step);
      else { clearTimeout(animFallback); if (done) done(); }
    };
    anim = requestAnimationFrame(step);
  }
  const box = (c, pad) => ({ x: c.x - c.r * pad, y: c.y - c.r * pad, w: 2 * c.r * pad, h: 2 * c.r * pad });
  function zoom(f, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    setView({ x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f, w: view.w * f, h: view.h * f });
  }
  function toWorld(cx, cy, ctm = svg.getScreenCTM()) {
    return new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
  }
  function centerOn(o) {
    const w = Math.min(view.w, 520), h = w * (pxH() / pxW());
    // on wide screens the card covers the right part of the map, so put the club left of centre
    const shift = !$("#card").hidden && innerWidth > 860 ? w * 0.22 : 0;
    animateTo({ x: o.x - w / 2 + shift, y: o.y - h / 2, w, h });
  }

  // One selected area at a time: the chip bar, the list filter and the map all follow it
  function setArea(g) {
    if (state.area === g) return;
    state.area = g;
    drawChips();
    render();
    $("#results-pane").scrollTop = 0;
  }
  function focusGroup(g) {
    setArea(g);
    state.focus = { group: g, theme: null };
    applyFocus();
    // an area without clusters is itself a cluster: open its full-pane view after the fly-in
    animateTo(box(L.islands[g], 1.2), 650, showDetail);
  }
  function focusTheme(g, t) {
    setArea(g);
    state.focus = { group: g, theme: t };
    applyFocus();
    animateTo(box(L.themes[g][t], 1.15), 650, showDetail);
  }
  function showGalaxy() {
    setArea(null);
    state.focus = null;
    applyFocus();
    animateTo({ ...bounds });
  }
  function upOneLevel() {
    const f = state.focus;
    if (f && f.theme) focusGroup(f.group); else showGalaxy();
  }

  // ---------- cluster view: the cluster fills the pane, every club named at a readable size ----------
  const detail = $("#detail"), dbody = $("#detail-body"), dlines = $("#detail-lines");
  let detailKey = null, detailOrder = [];  // detailOrder: club ids in on-screen reading order (the list follows it)
  function clusterOf(f) {
    if (!f || !L) return null;
    if (f.theme) return { g: f.group, t: f.theme };
    return hasThemes(f.group) ? null : { g: f.group, t: null };
  }
  const clusterBox = (c) => box(c.t ? L.themes[c.g][c.t] : L.islands[c.g], 1.15);
  function showDetail() {
    const c = clusterOf(state.focus);
    if (!c) return hideDetail();
    const key = c.g + "|" + (c.t || "");
    const fresh = key !== detailKey;
    detailKey = key;
    detail.hidden = false;
    detail.style.setProperty("--c", color(c.g));
    svg.classList.add("behind");
    scheduleNames();  // clears the map's own name labels behind the view
    $("#detail-title").textContent = c.t || c.g;
    if (fresh) { dbody.querySelectorAll(".node").forEach((n) => n.remove()); detail.scrollTop = 0; }
    render();  // lays out the cluster view and narrows the list to the same clubs
    const sel = state.selected && dbody.querySelector(`.node[data-id="${CSS.escape(state.selected)}"]`);
    if (sel) sel.scrollIntoView({ block: "nearest" });
    else if (fresh) $("#detail-title").focus({ preventScroll: true });
  }
  function hideDetail() {
    if (detail.hidden) return;
    detailKey = null;
    detail.hidden = true;
    svg.classList.remove("behind");
    $("#card").classList.remove("dock-left");
    scheduleNames();
    render();  // the list widens back to the area / all areas
  }
  function layoutDetail() {
    const c = clusterOf(state.focus);
    if (!c || detail.hidden) return;
    const members = state.orgs.filter((o) => o.topic_group === c.g && (!c.t || o.theme === c.t) && visible(o));
    $("#detail-sub").textContent = `${c.t ? c.g + " · " : ""}${members.length} clubs · lines join clubs with similar descriptions`;
    const W = detail.clientWidth || 700, H = detail.clientHeight || 500;
    // keep stars clear of the zoom buttons (the popup docks over the list, not over the cluster)
    const usable = Math.max(240, W - (innerWidth > 860 ? 48 : 8));
    const m = 16, top = 8, avail = Math.max(160, H - $(".detail-head").offsetHeight - 70);
    const existing = new Map([...dbody.querySelectorAll(".node")].map((n) => [n.dataset.id, n]));
    const keep = new Set(members.map((o) => o.id));
    for (const [id, n] of existing) if (!keep.has(id)) n.remove();
    const nodes = members.map((o) => {
      let n = existing.get(o.id);
      if (!n) {
        n = document.createElement("button");
        n.type = "button"; n.className = "node fresh"; n.dataset.id = o.id;
        const d = Math.round(Math.max(8, o._r * 2.6));  // dot size follows star size
        n.innerHTML = `<span class="dot" style="width:${d}px;height:${d}px"></span><span class="nm">${esc(o.name)}</span>`;
        n.style.setProperty("--c", color(o.topic_group));
        dbody.appendChild(n);
      }
      n.classList.toggle("dim", !!state.q && !state.tiers.has(o.id));
      n.classList.toggle("sel", o.id === state.selected);
      n.setAttribute("aria-current", o.id === state.selected ? "true" : "false");
      return { o, n, w: n.offsetWidth, h: n.offsetHeight, d: n.firstChild.offsetWidth };
    });
    if (!nodes.length) { dlines.innerHTML = ""; dbody.style.height = "0px"; return; }
    // keep the cluster's real shape, scaled to the pane, then push names apart until none overlap
    const xs = members.map((o) => o.x), ys = members.map((o) => o.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const bw = Math.max(...xs) - minX || 1, bh = Math.max(...ys) - minY || 1;
    const avgW = nodes.reduce((a, p) => a + p.w, 0) / nodes.length;
    // small clusters fill the pane; big ones get the height their names need (then scroll)
    const need = nodes.reduce((a, p) => a + (p.w + 8) * (p.h + 8), 0) * 1.5 / Math.max(200, usable - 2 * m);
    const s = Math.min((usable - 2 * m - avgW) / bw, Math.max(avail, need) / bh, 8);
    for (const p of nodes) {
      p.tx = nodes.length === 1 ? (usable - p.w) / 2 : m + (p.o.x - minX) * s;
      p.ty = top + (p.o.y - minY) * s;
    }
    if (nodes.length > 24) packRows(nodes, usable, m, top);
    else placeNearest(nodes, usable, m, top);
    finishDetail(nodes, usable, m);
  }

  // Big clusters: balanced columns. Clubs go in constellation order (top to bottom) to the shortest
  // column near their left-right position, with a small stable offset so it still reads as a sky.
  // O(n * columns), names never overlap.
  function packRows(nodes, usable, m, top) {
    const inner = usable - 2 * m, gap = 14;
    const colW = Math.max(...nodes.map((p) => p.w));
    const cols = Math.max(1, Math.floor((inner + gap) / (colW + gap)));
    const spread = cols > 1 ? (inner - cols * colW) / (cols - 1) : 0;
    const heights = new Array(cols).fill(top);
    const seed = (p) => parseInt(p.o.id.replace(/\D/g, "").slice(-4) || "0", 10);
    for (const p of [...nodes].sort((a, b) => a.ty - b.ty || a.tx - b.tx)) {
      const want = Math.min(cols - 1, Math.max(0, Math.floor(((p.tx - m) / Math.max(1, inner)) * cols)));
      let best = 0, score = Infinity;
      for (let c = 0; c < cols; c++) {
        const s = heights[c] + Math.abs(c - want) * 28;  // stay near its side of the constellation
        if (s < score) { score = s; best = c; }
      }
      p.x = m + best * (colW + spread) + (seed(p) % 5) * Math.min(8, (colW - p.w) / 4);
      p.y = heights[best] + (seed(p) % 4) * 3;
      heights[best] = p.y + p.h + 12;
    }
  }

  // Small clusters: each club takes the free spot nearest its place in the constellation,
  // so the shape is kept and names can never overlap
  function placeNearest(nodes, usable, m, top) {
    const pad = 8, placed = [];
    const free = (x, y, p) => !placed.some((q) => x < q.x + q.w + pad && q.x < x + p.w + pad && y < q.y + q.h + pad && q.y < y + p.h + pad);
    for (const p of [...nodes].sort((a, b) => a.ty - b.ty || a.tx - b.tx)) {
      const xmax = Math.max(m, usable - m - p.w);
      const clampX = (x) => Math.max(m, Math.min(x, xmax)), clampY = (y) => Math.max(top, y);
      let spot = null;
      for (let r = 0; !spot; r += 6 + r * 0.04) {
        const steps = r === 0 ? 1 : Math.min(48, Math.max(8, Math.round(r / 4)));
        for (let k = 0; k < steps && !spot; k++) {
          const a = (k / steps) * 2 * Math.PI;
          const x = clampX(p.tx + r * Math.cos(a)), y = clampY(p.ty + r * Math.sin(a) * 0.7);
          if (free(x, y, p)) spot = [x, y];
        }
      }
      p.x = spot[0]; p.y = spot[1];
      placed.push(p);
    }
  }

  // Position the nodes, size the scroll area and draw links between related clubs in the cluster
  function finishDetail(nodes, usable, m) {
    for (const p of nodes) { p.x = Math.round(p.x); p.y = Math.round(p.y); }
    // reading order: top to bottom in 28px bands, left to right within a band
    detailOrder = [...nodes].sort((a, b) => Math.floor(a.y / 28) - Math.floor(b.y / 28) || a.x - b.x).map((p) => p.o.id);
    let maxY = 0;
    for (const p of nodes) {
      p.n.style.transform = `translate(${p.x}px, ${p.y}px)`;
      maxY = Math.max(maxY, p.y + p.h);
      if (p.n.classList.contains("fresh")) setTimeout(() => p.n.classList.remove("fresh"), 60);
    }
    const height = Math.round(maxY + m + 44);  // room above the legend
    dbody.style.height = height + "px";
    const pos = new Map(nodes.map((p) => [p.o.id, { x: p.x + p.d / 2, y: p.y + p.h / 2 }]));
    dlines.setAttribute("width", usable);
    dlines.setAttribute("height", height);
    let html = "";
    for (const p of nodes) {
      for (const b of p.o.links || []) {
        const q = pos.get(b);
        if (!q || p.o.id >= b) continue;
        const a = pos.get(p.o.id);
        const hot = state.selected === p.o.id || state.selected === b;
        const dim = !!state.q && !(state.tiers.has(p.o.id) && state.tiers.has(b));
        html += `<line x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${q.y.toFixed(1)}" class="${hot ? "hot" : ""}${dim ? " dim" : ""}"/>`;
      }
    }
    dlines.innerHTML = html;
  }
  const hasThemes = (g) => !!(L.themes && L.themes[g] && Object.keys(L.themes[g]).length);
  // what a click on this star or glow does at the current zoom level: area -> cluster -> club
  function clickAction(o, g, t) {
    const f = state.focus;
    if (!f || f.group !== g) return { kind: "area", g };
    if (hasThemes(g) && t && f.theme !== t) return { kind: "theme", g, t };
    return o ? { kind: "club", o } : null;
  }

  function applyFocus() {
    const f = state.focus;
    if (!clusterOf(f)) hideDetail();
    const near = new Set();
    const sel = state.selected && state.byId.get(state.selected);
    if (sel) { near.add(sel.id); (sel.links || []).forEach((b) => near.add(b)); }
    for (const [id, s] of stars) {
      const o = state.byId.get(id);
      const far = !!f && (o.topic_group !== f.group || (!!f.theme && o.theme !== f.theme));
      s.classList.toggle("far", far && !near.has(id));
      s.classList.toggle("sel", id === state.selected);
    }
    for (const [g, ge] of Object.entries(groupEls)) {
      ge.label.classList.toggle("far", !!f && f.group !== g);
      ge.label.classList.toggle("here", !!f && f.group === g);  // the breadcrumb already names it
    }
    for (const t of layers.themes.querySelectorAll(".tlabel")) t.classList.toggle("on", !!f && f.theme === t.dataset.theme && f.group === t.dataset.group);
    styleLines();
    crumbs();
    onViewChange();  // links and cluster names follow the new focus right away, not only once the view moves
  }

  function crumbs() {
    const f = state.focus;
    const parts = [`<button type="button" data-crumb="galaxy"${f ? "" : ' aria-current="location"'}>All areas</button>`];
    if (f) parts.push(`<button type="button" data-crumb="group" style="--c:${color(f.group)}"${f.theme ? "" : ' aria-current="location"'}>${esc(f.group)}</button>`);
    if (f && f.theme) parts.push(`<button type="button" data-crumb="theme" aria-current="location">${esc(f.theme)}</button>`);
    $("#crumbs").innerHTML = parts.join('<span class="sep" aria-hidden="true">›</span>');
  }

  // Everything that depends on zoom: star sizes, label sizes, which areas show lines and sub-areas
  function onViewChange() {
    if (!view) return;
    const k = unitsPerPx();
    // stars grow as you zoom in, but more slowly than the map, so the galaxy view stays a sky of points
    const s = Math.min(2.6, Math.max(0.5, 0.5 * Math.pow(bounds.w / view.w, 0.45)));
    for (const [id, c] of stars) {
      const t = state.tiers.get(id);
      const boost = t ? [1, 1.8, 1.45, 1.2, 1.08][t] : 1;
      c.setAttribute("r", (state.byId.get(id)._r * s * boost * k).toFixed(2));
    }
    const deep = view.w < bounds.w * 0.4;
    const gfs = (pxW() < 520 ? 12 : 15) * k;
    for (const [g, ge] of Object.entries(groupEls)) {
      const isl = L.islands[g];
      // keep area names inside the view on narrow screens (rough text width estimate)
      const half = (g.length + 4) * gfs * 0.3;
      ge.labelText.setAttribute("x", Math.min(Math.max(isl.x, view.x + half + 4 * k), view.x + view.w - half - 4 * k));
      ge.labelText.setAttribute("y", isl.y - isl.r - 6 * k);
      ge.labelText.setAttribute("font-size", gfs.toFixed(2));
      const inView = isl.x + isl.r > view.x && isl.x - isl.r < view.x + view.w && isl.y + isl.r > view.y && isl.y - isl.r < view.y + view.h;
      // cluster names appear once the area fills enough of the view to read them;
      // links appear only after you click into a cluster (or into an area that has no clusters)
      const close = view.w < isl.r * 7;
      const f = state.focus;
      const active = groupShown(g) && close && ((f && f.group === g) || (deep && inView));
      const linksOn = groupShown(g) && close && !!f && f.group === g && (!!f.theme || !hasThemes(g));
      if (linksOn) ensureLines(g);
      if (ge.lines) ge.lines.style.display = linksOn ? "" : "none";
      ge.themes.style.display = active ? "" : "none";
      for (const b of ge.themes.children) {
        const th = L.themes[g][b.dataset.theme], t = b.firstChild;
        t.setAttribute("x", th.x);
        t.setAttribute("y", th.y - th.r * 0.55);
        t.setAttribute("font-size", (12 * k).toFixed(2));
        b.setAttribute("tabindex", active ? "0" : "-1");
      }
    }
    drawSelection(k, s);
    scheduleNames();
    drawSky();
  }

  function drawSelection(k, s) {
    layers.sel.textContent = "";
    layers.selLines.textContent = "";
    const o = state.selected && state.byId.get(state.selected);
    if (!o) return;
    const r = o._r * s * k;
    for (const b of o.links || []) {
      const p = state.byId.get(b);
      if (p) el("line", { x1: o.x, y1: o.y, x2: p.x, y2: p.y, class: "sel-line" }, layers.selLines);
    }
    el("circle", { cx: o.x, cy: o.y, r: r * 5, fill: "url(#halo)", class: "sel-halo" }, layers.sel);
    el("circle", { cx: o.x, cy: o.y, r: r + 4 * k, class: "sel-ring" }, layers.sel);
    el("text", { x: o.x + r + 7 * k, y: o.y - r - 3 * k, "font-size": (13 * k).toFixed(2), class: "name sel-name" }, layers.sel).textContent = o.name;
  }

  let namesTimer = 0;
  function scheduleNames() { clearTimeout(namesTimer); namesTimer = setTimeout(drawNames, 40); }
  function drawNames() {
    layers.names.textContent = "";
    const k = unitsPerPx();
    // only name stars once they are far enough apart to read, and not behind the cluster view
    if (k > 0.85 || !detail.hidden) return;
    const inView = state.orgs.filter((o) => {
      const c = stars.get(o.id);
      return o.id !== state.selected && !c.classList.contains("hidden") && !c.classList.contains("dim") && !c.classList.contains("far")
        && o.x > view.x && o.x < view.x + view.w && o.y > view.y && o.y < view.y + view.h;
    }).sort((a, b) => b._r - a._r);
    // greedy placement: bigger stars get their name first; a name that would overlap another is skipped
    // (hover still shows it), so labels never pile up
    const placed = [], fs = 10.5 * k;
    for (const o of inView) {
      if (placed.length >= 80) break;
      const r = Number(stars.get(o.id).getAttribute("r"));
      const text = o.name.length > 32 ? o.name.slice(0, 30) + "…" : o.name;
      const bx = { x: o.x + r + 3 * k, y: o.y - fs * 0.6, w: text.length * fs * 0.56, h: fs * 1.25 };
      if (placed.some((p) => bx.x < p.x + p.w && p.x < bx.x + bx.w && bx.y < p.y + p.h && p.y < bx.y + bx.h)) continue;
      placed.push(bx);
      el("text", { x: bx.x, y: o.y + fs * 0.35, "font-size": fs.toFixed(2), class: "name" }, layers.names).textContent = text;
    }
  }

  // with a sub-area in focus, lines that don't touch it fade back
  function styleLines() {
    const f = state.focus;
    for (const ge of Object.values(groupEls)) {
      if (!ge.lines) continue;
      for (const ln of ge.lines.children) {
        const a = state.byId.get(ln.dataset.a), b = state.byId.get(ln.dataset.b);
        // inside a cluster, show only the links that touch it
        ln.classList.toggle("off", !!(f && f.theme) && a.theme !== f.theme && b.theme !== f.theme);
      }
    }
  }

  // background starfield on a canvas, drifting slightly as you pan (parallax depth)
  const skyStars = (() => {
    const rnd = seeded(42), tints = ["#ffffff", "#ffffff", "#cfdcff", "#ffe8c2", "#d9c9ff"];
    return Array.from({ length: 650 }, () => ({ x: rnd(), y: rnd(), r: rnd() ** 3 * 1.3 + 0.3, a: 0.2 + rnd() * 0.7,
      d: 0.15 + rnd() * 0.85, c: tints[Math.floor(rnd() * tints.length)] }));
  })();
  function drawSky() {
    const w = sky.clientWidth, h = sky.clientHeight;
    if (!w || !h || !view) return;
    const dpr = window.devicePixelRatio || 1;
    if (sky.width !== Math.round(w * dpr) || sky.height !== Math.round(h * dpr)) { sky.width = Math.round(w * dpr); sky.height = Math.round(h * dpr); }
    const c = sky.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    const ox = (view.x + view.w / 2 - bounds.x) / bounds.w, oy = (view.y + view.h / 2 - bounds.y) / bounds.h;
    for (const s of skyStars) {
      const x = (((s.x - ox * 0.25 * s.d) % 1) + 1) % 1 * w, y = (((s.y - oy * 0.25 * s.d) % 1) + 1) % 1 * h;
      c.globalAlpha = s.a; c.fillStyle = s.c;
      c.beginPath(); c.arc(x, y, s.r, 0, 6.2832); c.fill();
    }
  }

  function wireMap() {
    let drag = null;
    svg.addEventListener("pointerdown", (e) => {
      cancelAnimationFrame(anim); clearTimeout(animFallback);
      drag = { x: e.clientX, y: e.clientY, view: { ...view }, ctm: svg.getScreenCTM(), moved: false, target: e.target };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (drag) {
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) { drag.moved = true; svg.classList.add("dragging"); hideTip(); }
        if (drag.moved) {
          const a = toWorld(drag.x, drag.y, drag.ctm), b = toWorld(e.clientX, e.clientY, drag.ctm);
          setView({ ...drag.view, x: drag.view.x + a.x - b.x, y: drag.view.y + a.y - b.y });
        }
        return;
      }
      const t = e.target;
      showTip(t, e);
    });
    svg.addEventListener("pointerup", () => {
      if (drag && !drag.moved) activate(drag.target);
      drag = null; svg.classList.remove("dragging");
    });
    svg.addEventListener("pointerleave", hideTip);
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      cancelAnimationFrame(anim); clearTimeout(animFallback);
      const p = toWorld(e.clientX, e.clientY);
      zoom(Math.exp(e.deltaY * 0.0015), p.x, p.y);
    }, { passive: false });
    svg.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        if (activate(e.target)) e.preventDefault();
        return;
      }
      const step = view.w * 0.12;
      const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (k) { e.preventDefault(); setView({ ...view, x: view.x + k[0], y: view.y + k[1] }); }
      else if (e.key === "+" || e.key === "=") zoom(0.75);
      else if (e.key === "-") zoom(1.33);
      else if (e.key === "0") showGalaxy();
    });
    $("#zoom-in").onclick = () => zoom(0.7);
    $("#zoom-out").onclick = () => (detail.hidden ? zoom(1.4) : upOneLevel());
    // clicking a club's dot or name in the cluster view opens its popup
    dbody.addEventListener("click", (e) => { const n = e.target.closest(".node"); if (n) select(n.dataset.id, { fromMap: true }); });
    $("#zoom-reset").onclick = showGalaxy;
    $("#crumbs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-crumb]");
      if (!b) return;
      const f = state.focus;
      if (b.dataset.crumb === "galaxy") showGalaxy();
      else if (b.dataset.crumb === "group") focusGroup(f.group);
      else if (b.dataset.crumb === "theme") focusTheme(f.group, f.theme);
    });
    // a resize can reflow the cluster view (and its reading order), or hide the map (phone list tab)
    new ResizeObserver(() => { if (view) setView({ ...view }); if (!detail.hidden) render(); }).observe($("#map-pane"));
  }
  // A star or glow under the pointer -> what clicking it would do right now
  function targetAction(target) {
    if (!target.closest) return null;
    const star = target.closest(".star"), neb = target.closest("[data-neb]");
    if (star) { const o = state.byId.get(star.dataset.id); return clickAction(o, o.topic_group, o.theme); }
    if (neb) return clickAction(null, neb.dataset.group, neb.dataset.theme || null);
    return null;
  }
  function activate(target) {
    if (!target.closest) return false;
    const t = target.closest(".tlabel");
    if (t) { focusTheme(t.dataset.group, t.dataset.theme); return true; }
    const g = target.closest(".glabel");
    if (g) { focusGroup(g.dataset.group); return true; }
    const a = targetAction(target);
    if (!a) return false;
    if (a.kind === "area") focusGroup(a.g);
    else if (a.kind === "theme") focusTheme(a.g, a.t);
    else select(a.o.id, { fromMap: true });
    return true;
  }
  const tip = $("#tip");
  function showTip(target, e) {
    const a = targetAction(target);
    if (!a) return hideTip();
    const r = $("#map-pane").getBoundingClientRect();
    if (a.kind === "area") tip.innerHTML = `<strong>${esc(a.g)}</strong><span>${L.islands[a.g].n} clubs · click to zoom in</span>`;
    else if (a.kind === "theme") tip.innerHTML = `<strong>${esc(a.t)}</strong><span>${L.themes[a.g][a.t].n} clubs · click to zoom in</span>`;
    else tip.innerHTML = `<strong>${esc(a.o.name)}</strong><span>${esc(statusLabel(a.o))} · click for details</span>`;
    tip.hidden = false;
    tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 280) + "px";
    tip.style.top = e.clientY - r.top + 14 + "px";
  }
  function hideTip() { tip.hidden = true; }

  // ---------- controls ----------
  function drawChips() {
    $("#chips").innerHTML = state.groups.filter((g) => g !== "Offices & programs" || state.offices)
      .map((g) => `<button type="button" class="chip" aria-pressed="${state.area === g}" data-g="${esc(g)}" style="--c:${color(g)}"><span class="sw"></span>${esc(g)}</button>`).join("");
  }
  function buildControls() {
    drawChips();
    // a chip does what clicking its area on the map does; one at a time, click again for all areas
    $("#chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const g = b.dataset.g;
      if (state.area === g) showGalaxy(); else focusGroup(g);
      const again = document.querySelector(`.chip[data-g="${CSS.escape(g)}"]`);
      if (again) again.focus();  // chips are redrawn; keep keyboard focus on the one pressed
    });
    const schools = [...new Set(state.orgs.map((o) => o.school))].sort((a, b) => (a === "Harvard College" ? -1 : b === "Harvard College" ? 1 : a.localeCompare(b)));
    $("#school").insertAdjacentHTML("beforeend", schools.map((s) => `<option>${esc(s)}</option>`).join(""));
    $("#school").addEventListener("change", (e) => { state.school = e.target.value; render(); });
    $("#offices").addEventListener("change", (e) => {
      state.offices = e.target.checked;
      if (!state.offices && state.area === "Offices & programs") showGalaxy();
      drawChips(); render();
    });
    let t;
    $("#q").addEventListener("input", (e) => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value; render(); $("#results-pane").scrollTop = 0; }, 70); });
    $("#q").addEventListener("keydown", (e) => {  // Enter jumps straight to the first result
      if (e.key !== "Enter") return;
      e.preventDefault(); clearTimeout(t); state.q = e.target.value; render();
      const first = document.querySelector("#results .row");
      if (first) first.focus();
    });
    $("#clear").addEventListener("click", () => {
      state.q = ""; $("#q").value = ""; state.school = ""; $("#school").value = "";
      state.offices = false; $("#offices").checked = false;
      if (state.area) showGalaxy();
      drawChips(); render(); $("#q").focus();
    });
    $("#results").addEventListener("click", (e) => { const r = e.target.closest(".row"); if (r) select(r.dataset.id); });
    $("#count").addEventListener("click", (e) => { if (e.target.id === "widen") upOneLevel(); });
    $("#card").addEventListener("click", (e) => { const r = e.target.closest("[data-rel]"); if (r) select(r.dataset.rel); });
    // Esc closes the popup first, then steps out of the cluster view
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!$("#card").hidden) closeCard();
      else if (!detail.hidden) upOneLevel();
    });
    const setTab = (v) => {
      document.querySelector(".layout").dataset.view = v;
      $("#tab-list").setAttribute("aria-selected", v === "list");
      $("#tab-map").setAttribute("aria-selected", v === "map");
      if (v === "map" && view) setView({ ...view });
    };
    $("#tab-list").onclick = () => setTab("list");
    $("#tab-map").onclick = () => setTab("map");
    setTab("list");
    // qualified outbound clicks, counted by type only; search text is never sent
    document.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-out]");
      if (a && window.goatcounter && window.goatcounter.count) window.goatcounter.count({ path: "out-" + a.dataset.out, title: a.dataset.out, event: true });
    });
  }

  function coverage() {
    const by = {};
    for (const o of state.orgs) by[o.school] = (by[o.school] || 0) + 1;
    const parts = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`);
    $("#coverage").textContent = `Pilot coverage: ${state.orgs.length} organizations (${parts.join(" · ")}). Not yet covered: ${NOT_COVERED}.`;
    if (CFG.listingFormUrl && safeUrl(CFG.listingFormUrl)) {
      $("#listing-request").innerHTML = `Run a Harvard student organization that isn't in any official directory? <a href="${esc(CFG.listingFormUrl)}" target="_blank" rel="noopener">Request a listing</a>. Each request is checked for a public website, Harvard student leadership and an open way to join.`;
    }
  }

  function analytics() {
    if (!CFG.goatcounterCode || !/^[a-z0-9-]+$/i.test(CFG.goatcounterCode)) return;
    const s = document.createElement("script");
    s.async = true; s.src = "https://gc.zgo.at/count.js";
    s.dataset.goatcounter = `https://${CFG.goatcounterCode}.goatcounter.com/count`;
    document.head.appendChild(s);
  }

  async function main() {
    const [orgs, layout] = await Promise.all([fetch("data/orgs.json").then((r) => r.json()), fetch("data/layout.json").then((r) => r.json())]);
    state.orgs = orgs.filter((o) => o.status !== "removed");
    state.groups = layout.groups;
    L = layout;
    for (const o of state.orgs) { index(o); state.byId.set(o.id, o); }
    buildControls(); buildMap(); wireMap(); coverage(); analytics(); applyFocus(); render();
    const fromHash = decodeURIComponent(location.hash.slice(1));
    if (state.byId.has(fromHash)) select(fromHash);
  }
  main().catch((e) => { $("#results").innerHTML = `<p class="empty">Could not load club data (${esc(e.message)}).</p>`; });
})();
