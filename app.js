(() => {
  "use strict";
  const CFG = window.CC_CONFIG || {};
  const $ = (s) => document.querySelector(s);
  const SVGNS = "http://www.w3.org/2000/svg";

  const GROUP_VAR = {
    "Arts": "--g-arts", "Culture & identity": "--g-culture", "Service": "--g-service",
    "Academic & professional": "--g-academic", "Science & tech": "--g-science", "Sports": "--g-sports",
    "Faith": "--g-faith", "Politics & advocacy": "--g-politics", "Media": "--g-media",
    "Hobbies & social": "--g-hobbies", "Offices & programs": "--g-offices",
  };
  const color = (g) => `var(${GROUP_VAR[g] || "--g-offices"})`;
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

  const state = { orgs: [], byId: new Map(), groups: [], q: "", chips: new Set(), school: "", offices: false, selected: null };
  let islands = {}, dots = new Map(), view = null, bounds = null;

  // ---------- search ----------
  function index(o) {
    o._name = norm(o.name);
    const noThe = o._name.replace(/^the /, "");
    // names a user might type exactly: "the harvard crimson" -> "harvard crimson", "crimson"
    o._alts = new Set([o._name, noThe, noThe.replace(/^(harvard )?((college|undergraduate|university) )*/, "").trim()]);
    o._acr = norm(o.acronym || "");
    o._desc = norm(o.description);
    o._tags = (o.tags || []).map(norm);
    o._cat = norm(`${o.official_category || ""} ${o.topic_group}`);
    o._route = o.join_status !== "page" && !o.directory_fallback;
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
  function visible(o) {
    if (o.org_type === "office_program" && !state.offices) return false;
    if (state.school && o.school !== state.school) return false;
    if (state.chips.size && !state.chips.has(o.topic_group)) return false;
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
    const meta = [o.school, o.official_category].filter(Boolean).map(esc).join(" · ");
    return `<li><button class="row" data-id="${esc(o.id)}" style="--c:${color(o.topic_group)}" aria-current="${state.selected === o.id}">
      <span class="name">${esc(o.name)}</span>
      ${o.description ? `<span class="desc">${esc(o.description)}</span>` : ""}
      <span class="meta"><span class="status ${esc(o.join_status)}">${esc(statusLabel(o))}</span><span>${meta}</span></span>
      ${why && why.length ? `<span class="why">Matched ${why.join(" · ")}</span>` : ""}
    </button></li>`;
  }

  let lastShown = new Set();
  function render() {
    const vis = state.orgs.filter(visible);
    const q = state.q.trim();
    let html = "", shown;
    if (q) {
      const res = search(vis, q);
      shown = new Set(res.map((r) => r.o.id));
      $("#count").textContent = res.length ? `${res.length} match “${q}”` : "";
      html = res.length ? `<ol>${res.map((r) => rowHtml(r.o, r.why)).join("")}</ol>`
        : `<p class="empty">No clubs match “${esc(q)}”. Try a broader interest such as “music”, “service” or “tech”.</p>`;
    } else {
      shown = new Set(vis.map((o) => o.id));
      $("#count").textContent = `${vis.length} organizations, grouped by interest`;
      for (const g of state.groups) {
        const members = vis.filter((o) => o.topic_group === g);
        if (!members.length) continue;
        html += `<h2 class="group-h" style="--c:${color(g)}"><span class="sw"></span>${esc(g)} <span>(${members.length})</span></h2><ol>${members.map((o) => rowHtml(o)).join("")}</ol>`;
      }
    }
    $("#results").innerHTML = html;
    lastShown = shown;
    for (const [id, el] of dots) {
      const o = state.byId.get(id);
      el.classList.toggle("hidden", !visible(o));
      el.classList.toggle("dim", !!q && !shown.has(id));
    }
    const officeIsland = world.querySelector('[data-group="Offices & programs"]');
    if (officeIsland) officeIsland.style.display = state.offices ? "" : "none";
    $("#clear").hidden = !(q || state.chips.size || state.school || state.offices);
    drawLabels();
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
    const sources = [...new Set(Object.values(o.field_sources || {}).map(safeUrl).filter(Boolean))];
    const correction = CFG.correctionsEmail
      ? `<p class="fine"><a href="mailto:${esc(CFG.correctionsEmail)}?subject=${encodeURIComponent(`Correction: ${o.name} [${o.id}]`)}&body=${encodeURIComponent("What is wrong or missing on this card?\n\n")}">Report a correction</a></p>` : "";
    return `<button type="button" class="close" aria-label="Close details">×</button>
      <p class="kicker">${esc([o.school, o.official_category].filter(Boolean).join(" · "))}</p>
      <h2 id="card-title" tabindex="-1">${esc(o.name)}</h2>
      ${o.unlisted ? `<p class="unlisted">Not in an official Harvard directory. Listed after a check of its public website and join route.</p>` : ""}
      ${o.description ? `<p>${esc(o.description)}</p>` : `<p class="fine">No public description yet.</p>`}
      <h3>${office ? "Contact" : "How to join"}</h3>${join || `<p class="fine">No public join route found yet.</p>`}
      ${others ? `<h3>Links</h3><ul class="links">${others}</ul>` : ""}
      ${o.tags?.length ? `<h3>Topics <span class="fine">(inferred)</span></h3><div class="tags">${o.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
      <h3>About this record</h3>
      <p class="fine">Interest area: ${esc(o.topic_group)}${o.official_category ? ` · Official category: ${esc(o.official_category)}` : ""}</p>
      <p class="fine">Last checked ${esc(o.checked_at || "unknown")}${o.status === "possibly_stale" ? ` · <span class="stale">possibly out of date</span>` : ""}</p>
      ${sources.length ? `<p class="fine">Sources: ${sources.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener">${i + 1}</a>`).join(", ")}</p>` : ""}
      ${correction}`;
  }

  function select(id, { fromMap = false } = {}) {
    const o = state.byId.get(id);
    if (!o) return;
    state.selected = id;
    const card = $("#card");
    card.innerHTML = cardHtml(o);
    card.hidden = false;
    card.querySelector(".close").addEventListener("click", closeCard);
    document.querySelectorAll(".row[aria-current='true']").forEach((r) => r.setAttribute("aria-current", "false"));
    const row = document.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
    if (row) { row.setAttribute("aria-current", "true"); if (fromMap) row.scrollIntoView({ block: "nearest" }); }
    for (const [k, el] of dots) el.classList.toggle("sel", k === id);
    if (!fromMap) centerOn(o);
    drawLabels();
    history.replaceState(null, "", "#" + encodeURIComponent(id));
    card.querySelector("#card-title").focus();
  }

  function closeCard() {
    const id = state.selected;
    $("#card").hidden = true;
    state.selected = null;
    for (const el of dots.values()) el.classList.remove("sel");
    drawLabels();
    history.replaceState(null, "", location.pathname + location.search);
    const row = id && document.querySelector(`.row[data-id="${CSS.escape(id)}"]`);
    (row && row.offsetParent ? row : $("#q")).focus();
  }

  // ---------- map ----------
  const svg = $("#map"), world = $("#world");
  function el(tag, attrs, parent) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  }

  function buildMap() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const gIsl = el("g", {}, world), gDots = el("g", {}, world);
    for (const g of state.groups) {
      const isl = islands[g];
      if (!isl) continue;
      const ig = el("g", { "data-group": g }, gIsl);
      el("circle", { cx: isl.x, cy: isl.y, r: isl.r, class: "island", style: `--c:${color(g)}` }, ig);
      el("text", { x: isl.x, y: isl.y - isl.r - 8, class: "island-label", style: `--c:${color(g)}` }, ig).textContent = g;
      minX = Math.min(minX, isl.x - isl.r); maxX = Math.max(maxX, isl.x + isl.r);
      minY = Math.min(minY, isl.y - isl.r - 30); maxY = Math.max(maxY, isl.y + isl.r);
    }
    for (const o of state.orgs) {
      const d = el("circle", { cx: o.x, cy: o.y, r: 4.6, class: "dot", style: `--c:${color(o.topic_group)}`, "data-id": o.id }, gDots);
      dots.set(o.id, d);
    }
    el("g", { id: "labels" }, world);
    const pad = 30;
    bounds = { x: minX - pad, y: minY - pad, w: maxX - minX + 2 * pad, h: maxY - minY + 2 * pad };
    setView({ ...bounds });
  }

  function setView(v) {
    const minW = 120, maxW = bounds.w * 1.4;
    const w = Math.min(maxW, Math.max(minW, v.w)), h = v.h * (w / v.w);
    view = { x: v.x + (v.w - w) / 2, y: v.y + (v.h - h) / 2, w, h };
    svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.w} ${view.h}`);
    scheduleLabels();
  }
  function zoom(f, cx = view.x + view.w / 2, cy = view.y + view.h / 2) {
    const w = view.w * f, h = view.h * f;
    setView({ x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f, w, h });
  }
  function toWorld(cx, cy, ctm = svg.getScreenCTM()) {
    return new DOMPoint(cx, cy).matrixTransform(ctm.inverse());
  }
  function centerOn(o) {
    if (!view || !svg.getBoundingClientRect().width) return;
    const w = Math.min(view.w, 420), h = view.h * (w / view.w);
    // on wide screens the card covers the right part of the map, so put the club left of centre
    const shift = !$("#card").hidden && innerWidth > 860 ? w * 0.22 : 0;
    setView({ x: o.x - w / 2 + shift, y: o.y - h / 2, w, h });
  }

  let labelQueued = false;
  function scheduleLabels() { if (!labelQueued) { labelQueued = true; requestAnimationFrame(() => { labelQueued = false; drawLabels(); }); } }
  function drawLabels() {
    const g = document.getElementById("labels");
    if (!g || !view) return;
    g.textContent = "";
    if (view.w < 360) {  // zoomed in: name the clubs in view
      let n = 0;
      for (const o of state.orgs) {
        const d = dots.get(o.id);
        if (n > 140 || d.classList.contains("hidden") || d.classList.contains("dim")) continue;
        if (o.x < view.x || o.x > view.x + view.w || o.y < view.y || o.y > view.y + view.h) continue;
        el("text", { x: o.x + 6, y: o.y + 2.2, class: "dot-label" }, g).textContent = o.name.length > 34 ? o.name.slice(0, 32) + "…" : o.name;
        n++;
      }
    }
    const s = state.selected && state.byId.get(state.selected);
    if (s) el("text", { x: s.x + 8, y: s.y - 7, class: "dot-label sel-label" }, g).textContent = s.name;
  }

  function wireMap() {
    let drag = null;
    svg.addEventListener("pointerdown", (e) => {
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
      if (t.classList && t.classList.contains("dot")) showTip(t, e); else hideTip();
    });
    svg.addEventListener("pointerup", () => {
      if (drag && !drag.moved && drag.target.classList?.contains("dot")) select(drag.target.dataset.id, { fromMap: true });
      drag = null; svg.classList.remove("dragging");
    });
    svg.addEventListener("pointerleave", hideTip);
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const p = toWorld(e.clientX, e.clientY);
      zoom(Math.exp(e.deltaY * 0.0015), p.x, p.y);
    }, { passive: false });
    svg.addEventListener("keydown", (e) => {
      const step = view.w * 0.12;
      const k = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
      if (k) { e.preventDefault(); setView({ ...view, x: view.x + k[0], y: view.y + k[1] }); }
      else if (e.key === "+" || e.key === "=") zoom(0.75);
      else if (e.key === "-") zoom(1.33);
      else if (e.key === "0") setView({ ...bounds });
    });
    $("#zoom-in").onclick = () => zoom(0.7);
    $("#zoom-out").onclick = () => zoom(1.4);
    $("#zoom-reset").onclick = () => setView({ ...bounds });
  }
  const tip = $("#tip");
  function showTip(dot, e) {
    const o = state.byId.get(dot.dataset.id);
    const r = $("#map-pane").getBoundingClientRect();
    tip.textContent = o.name;
    tip.hidden = false;
    tip.style.left = Math.min(e.clientX - r.left + 12, r.width - 270) + "px";
    tip.style.top = e.clientY - r.top + 12 + "px";
  }
  function hideTip() { tip.hidden = true; }

  // ---------- controls ----------
  function buildControls() {
    const chips = $("#chips");
    const drawChips = () => {
      chips.innerHTML = state.groups.filter((g) => g !== "Offices & programs" || state.offices)
        .map((g) => `<button type="button" class="chip" aria-pressed="${state.chips.has(g)}" data-g="${esc(g)}" style="--c:${color(g)}"><span class="sw"></span>${esc(g)}</button>`).join("");
    };
    drawChips();
    chips.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (!b) return;
      const g = b.dataset.g;
      state.chips.has(g) ? state.chips.delete(g) : state.chips.add(g);
      b.setAttribute("aria-pressed", state.chips.has(g));
      render();
    });
    const schools = [...new Set(state.orgs.map((o) => o.school))].sort((a, b) => (a === "Harvard College" ? -1 : b === "Harvard College" ? 1 : a.localeCompare(b)));
    $("#school").insertAdjacentHTML("beforeend", schools.map((s) => `<option>${esc(s)}</option>`).join(""));
    $("#school").addEventListener("change", (e) => { state.school = e.target.value; render(); });
    $("#offices").addEventListener("change", (e) => {
      state.offices = e.target.checked;
      if (!state.offices) state.chips.delete("Offices & programs");
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
      state.q = ""; $("#q").value = ""; state.chips.clear(); state.school = ""; $("#school").value = "";
      state.offices = false; $("#offices").checked = false; drawChips(); render(); $("#q").focus();
    });
    $("#results").addEventListener("click", (e) => { const r = e.target.closest(".row"); if (r) select(r.dataset.id); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#card").hidden) closeCard(); });
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
    islands = layout.islands;
    for (const o of state.orgs) { index(o); state.byId.set(o.id, o); }
    buildControls(); buildMap(); wireMap(); coverage(); analytics(); render();
    const fromHash = decodeURIComponent(location.hash.slice(1));
    if (state.byId.has(fromHash)) select(fromHash);
  }
  main().catch((e) => { $("#results").innerHTML = `<p class="empty">Could not load club data (${esc(e.message)}).</p>`; });
})();
