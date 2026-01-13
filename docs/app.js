
const DATA_URL = "./data/equities.min.json";

// UI
const fieldEl = document.getElementById("field");
const qEl = document.getElementById("q");
const goEl = document.getElementById("go");
const clearEl = document.getElementById("clear");
const copyLinkEl = document.getElementById("copyLink");
const downloadCsvEl = document.getElementById("downloadCsv");
const resultsEl = document.getElementById("results");
const statusEl = document.getElementById("status");
const statsEl = document.getElementById("stats");
const recentWrapEl = document.getElementById("recentWrap");
const recentEl = document.getElementById("recent");

const norm = (s) => (s ?? "").toString().trim().toLowerCase();

let rows = [];

const idx = {
  symbol: new Map(),       // unique
  isin: new Map(),         // unique
  name: new Map(),         // many
  country: new Map(),      // many
  description: new Map()   // many
};

function addToIndex(map, key, row, unique=false) {
  if (!key) return;
  if (unique) {
    if (!map.has(key)) map.set(key, row);
    return;
  }
  const arr = map.get(key);
  if (arr) arr.push(row);
  else map.set(key, [row]);
}

function buildIndexes(data) {
  for (const k of Object.keys(idx)) idx[k].clear();
  rows = [];

  for (const r of data) {
    const row = {
      symbol: r.symbol ?? "",
      name: r.name ?? "",
      isin: r.isin ?? "",
      country: r.country ?? "",
      description: r.description ?? ""
    };

    addToIndex(idx.symbol, norm(row.symbol), row, true);
    addToIndex(idx.isin, norm(row.isin), row, true);
    addToIndex(idx.name, norm(row.name), row, false);
    addToIndex(idx.country, norm(row.country), row, false);
    addToIndex(idx.description, norm(row.description), row, false);

    rows.push(row);
  }
}

function escapeHtml(s){
  return (s ?? "").toString()
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;");
}

function isLikelyISIN(value) {
  const v = value.replace(/\s+/g, "");
  return /^[A-Za-z]{2}[A-Za-z0-9]{10}$/.test(v);
}

function splitInputs(raw) {
  return raw
    .split(/[\n,;|\t]+/g)
    .flatMap(part => part.split(/\s{2,}/g))
    .map(s => s.trim())
    .filter(Boolean);
}

function resolveAutoField(input) {
  if (isLikelyISIN(input)) return "isin";
  const q = norm(input);
  if (idx.symbol.has(q)) return "symbol";
  if (idx.name.has(q)) return "name";
  return null;
}

function rowKey(row) {
  return norm(row.isin) || norm(row.symbol) || `${norm(row.name)}|${norm(row.country)}`;
}

// --- Recent searches ---
const RECENT_KEY = "equity_lookup_recent_v1";

function loadRecent() {
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); }
  catch { return []; }
}

function saveRecent(field, inputs) {
  const recent = loadRecent();
  const entry = { field, inputs: inputs.slice(0, 25), ts: Date.now() };

  const sig = (e) => `${e.field}::${(e.inputs||[]).map(norm).join(",")}`;
  const entrySig = sig(entry);

  const filtered = recent.filter(r => sig(r) !== entrySig);
  filtered.unshift(entry);
  localStorage.setItem(RECENT_KEY, JSON.stringify(filtered.slice(0, 10)));
}

function renderRecent() {
  const recent = loadRecent();
  if (!recent.length) { recentWrapEl.style.display = "none"; return; }
  recentWrapEl.style.display = "block";

  recentEl.innerHTML = recent.map(r => {
    const label = r.field.toUpperCase();
    const preview = (r.inputs || []).slice(0, 3).join(", ") + ((r.inputs||[]).length > 3 ? "…" : "");
    return `
      <div class="chip" role="button" tabindex="0"
           data-field="${escapeHtml(r.field)}"
           data-inputs="${escapeHtml((r.inputs || []).join("\\n"))}">
        <span>${escapeHtml(label)}</span>
        <span class="mini">${escapeHtml(preview)}</span>
      </div>
    `;
  }).join("");

  recentEl.querySelectorAll(".chip").forEach(chip => {
    const activate = () => {
      fieldEl.value = chip.getAttribute("data-field");
      qEl.value = chip.getAttribute("data-inputs") || "";
      qEl.focus();
      searchExact();
    };
    chip.addEventListener("click", activate);
    chip.addEventListener("keydown", (e) => { if (e.key === "Enter") activate(); });
  });
}

// --- URL state / share link ---
function updateUrlFromState(field, inputs) {
  const clipped = inputs.slice(0, 25);
  const params = new URLSearchParams();
  params.set("field", field);
  params.set("q", clipped.join("\n"));
  history.replaceState(null, "", `${location.pathname}?${params.toString()}`);
}

function loadStateFromUrl() {
  const params = new URLSearchParams(location.search);
  const field = params.get("field");
  const q = params.get("q");

  if (field && ["isin","symbol","name","country","description","auto"].includes(field)) fieldEl.value = field;
  else fieldEl.value = "isin";

  if (q) qEl.value = q;
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(location.href);
    statusEl.textContent = "Link copied to clipboard.";
  } catch {
    statusEl.textContent = "Could not copy link (clipboard permission).";
  }
}

// --- CSV export ---
function toCsvValue(v) {
  const s = (v ?? "").toString();
  if (/[",\n]/.test(s)) return `"${s.replaceAll('"','""')}"`;
  return s;
}

// --- Card renderers ---
function uniqueCard(g) {
  const r = g.row;
  const desc = r.description ? `<p class="desc muted">${escapeHtml(r.description)}</p>` : "";

  return `
    <article class="card">
      <div class="cardTop">
        <h2 class="title">${escapeHtml(r.name || "(No name)")}</h2>
        <span class="badge">${escapeHtml(r.country || "—")}</span>
      </div>

      <div class="grid">
        <div class="row">
          <span class="key">Ticker</span>
          <span class="val">${escapeHtml(r.symbol || "—")}</span>
          ${r.symbol ? `<button class="copyBtn" data-copy="${escapeHtml(r.symbol)}">Copy</button>` : ""}
        </div>

        <div class="row">
          <span class="key">ISIN</span>
          <span class="val">${escapeHtml(r.isin || "—")}</span>
          ${r.isin ? `<button class="copyBtn" data-copy="${escapeHtml(r.isin)}">Copy</button>` : ""}
        </div>

        <div class="row">
          <span class="key">Match</span>
          <span class="pill">Exact</span>
          <span class="pill">×${g.count}</span>
        </div>

        <div class="row">
          <span class="key">By</span>
          <span class="pill">${escapeHtml(g.field)}: ${escapeHtml(g.input)}</span>
        </div>
      </div>

      ${desc}
    </article>
  `;
}

function queryGroupCard(g) {
  const matchCount = g.matchList.length;
  const SHOW_LIMIT = 500;

  const items = g.matchList.slice(0, SHOW_LIMIT).map(r => `
    <div class="matchRow">
      <div class="matchMain">
        <div class="matchName">${escapeHtml(r.name || "")}</div>
        <div class="matchMeta muted">
          <span><strong>${escapeHtml(r.symbol || "—")}</strong></span>
          <span class="dot">·</span>
          <span>${escapeHtml(r.isin || "—")}</span>
          <span class="dot">·</span>
          <span>${escapeHtml(r.country || "—")}</span>
        </div>
      </div>
      <div class="matchBtns">
        ${r.symbol ? `<button class="copyBtn" data-copy="${escapeHtml(r.symbol)}">Copy Ticker</button>` : ""}
        ${r.isin ? `<button class="copyBtn" data-copy="${escapeHtml(r.isin)}">Copy ISIN</button>` : ""}
      </div>
    </div>
  `).join("");

  return `
    <article class="card">
      <div class="cardTop">
        <h2 class="title">${escapeHtml(g.input)}</h2>
        <span class="badge">${escapeHtml(g.field.toUpperCase())}</span>
      </div>

      <div class="grid">
        <div class="row">
          <span class="key">Match</span>
          <span class="pill">Exact</span>
          <span class="pill">Inputs ×${g.inputCount}</span>
          <span class="pill">Matches ${matchCount}</span>
        </div>
        <div class="row">
          <span class="key">By</span>
          <span class="pill">${escapeHtml(g.field)}: ${escapeHtml(g.input)}</span>
        </div>
      </div>

      <details class="details" ${matchCount <= 8 ? "open" : ""}>
        <summary>Show matches</summary>
        <div class="matchList">
          ${items}
          ${matchCount > SHOW_LIMIT ? `<p class="muted" style="margin-top:10px">Showing first ${SHOW_LIMIT} matches.</p>` : ""}
        </div>
      </details>
    </article>
  `;
}

// --- Rendering ---
function renderResults(cards, missingMap, metaText) {
  statusEl.textContent = metaText || "";
  statsEl.textContent = "";

  const missingList = Array.from(missingMap.values());
  const missingTotal = missingList.reduce((s, x) => s + x.count, 0);

  if (!cards.length && !missingList.length) {
    resultsEl.innerHTML = `
      <div class="card">
        <h2 class="title">Ready</h2>
        <p class="muted">Default is <span class="pill">ISIN</span>. Paste values and click Search.</p>
      </div>
    `;
    return;
  }

  const parts = [];
  for (const c of cards) parts.push(c.kind === "unique" ? uniqueCard(c) : queryGroupCard(c));

  if (missingList.length) {
    missingList.sort((a, b) => (b.count - a.count) || (a.value || "").localeCompare(b.value || ""));
    const missingHtml = missingList.slice(0, 200).map(x =>
      `<span class="pill warn">${escapeHtml(x.value)} ×${x.count}</span>`
    ).join(" ");

    parts.push(`
      <div class="card">
        <h2 class="title">Not found (${missingList.length} unique)</h2>
        <p class="muted">Counts reflect how many times each value appeared in your paste:</p>
        <div class="pillWrap">${missingHtml}</div>
        ${missingList.length > 200 ? `<p class="muted" style="margin-top:10px">Showing first 200 missing values.</p>` : ""}
      </div>
    `);
  }

  resultsEl.innerHTML = parts.join("");

  resultsEl.querySelectorAll(".copyBtn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const val = btn.getAttribute("data-copy");
      try {
        await navigator.clipboard.writeText(val);
        btn.classList.add("ok");
        btn.textContent = "Copied";
        setTimeout(() => {
          btn.classList.remove("ok");
          btn.textContent = "Copy";
        }, 900);
      } catch {}
    });
  });

  const foundTotal = cards.reduce((s, c) => s + (c.kind === "unique" ? c.count : c.inputCount), 0);
  statsEl.textContent = `Found ${cards.length} card(s) · Input hits ×${foundTotal} · Missing ${missingList.length} unique (×${missingTotal})`;
}

// --- Search (grouped) ---
let lastSearchPayload = null;

function searchExact() {
  const fieldChoice = fieldEl.value;
  const inputs = splitInputs(qEl.value);

  if (!inputs.length) {
    lastSearchPayload = null;
    renderResults([], new Map(), `Loaded ${rows.length.toLocaleString()} equities. Enter a value to search.`);
    return;
  }

  const uniqueFound = new Map();
  const queryFound = new Map();
  const missingMap = new Map();

  for (let i = 0; i < inputs.length; i++) {
    const input = inputs[i];
    const q = norm(input);

    let field = fieldChoice;
    if (fieldChoice === "auto") {
      const resolved = resolveAutoField(input);
      if (!resolved) {
        const cur = missingMap.get(q);
        if (cur) cur.count++;
        else missingMap.set(q, { value: input, count: 1 });
        continue;
      }
      field = resolved;
    }

    if (field === "isin" || field === "symbol") {
      const hit = idx[field].get(q);
      if (hit) {
        const k = `${field}|${rowKey(hit)}`;
        const cur = uniqueFound.get(k);
        if (cur) cur.count++;
        else uniqueFound.set(k, { kind: "unique", row: hit, field, input, count: 1 });
      } else {
        const cur = missingMap.get(q);
        if (cur) cur.count++;
        else missingMap.set(q, { value: input, count: 1 });
      }
      continue;
    }

    const hits = idx[field].get(q) || [];
    if (hits.length) {
      const k = `${field}|${q}`;
      const cur = queryFound.get(k);
      if (cur) {
        cur.inputCount++;
        for (const h of hits) cur.matches.set(rowKey(h), h);
      } else {
        const matches = new Map();
        for (const h of hits) matches.set(rowKey(h), h);
        queryFound.set(k, { kind: "query", field, q, input, inputCount: 1, matches });
      }
    } else {
      const cur = missingMap.get(q);
      if (cur) cur.count++;
      else missingMap.set(q, { value: input, count: 1 });
    }
  }

  const uniqueList = Array.from(uniqueFound.values())
    .sort((a, b) => (b.count - a.count) || (a.row.name || "").localeCompare(b.row.name || ""));

  const queryList = Array.from(queryFound.values())
    .map(g => ({ ...g, matchList: Array.from(g.matches.values()).sort((a,b)=> (a.symbol||"").localeCompare(b.symbol||"")) }))
    .sort((a, b) => (b.inputCount - a.inputCount) || (a.input || "").localeCompare(b.input || ""));

  const cards = [...uniqueList, ...queryList];

  lastSearchPayload = { field: fieldChoice, inputs, cards, missingMap };
  renderResults(cards, missingMap, `Exact match: processed ${inputs.length} input(s).`);

  saveRecent(fieldChoice, inputs);
  renderRecent();
  updateUrlFromState(fieldChoice, inputs);
}

// --- Download CSV ---
function downloadCsv() {
  if (!lastSearchPayload || !lastSearchPayload.cards?.length) {
    statusEl.textContent = "Nothing to download yet (no results).";
    return;
  }

  const header = ["card_kind","match_field","match_input","input_count","symbol","isin","name","country","description"];
  const lines = [header.join(",")];

  for (const c of lastSearchPayload.cards) {
    if (c.kind === "unique") {
      const r = c.row;
      lines.push([
        "unique", c.field, c.input, c.count,
        r.symbol, r.isin, r.name, r.country, r.description
      ].map(toCsvValue).join(","));
    } else {
      for (const r of c.matchList) {
        lines.push([
          "query", c.field, c.input, c.inputCount,
          r.symbol, r.isin, r.name, r.country, r.description
        ].map(toCsvValue).join(","));
      }
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `equity_lookup_${Date.now()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
  statusEl.textContent = "CSV downloaded.";
}

// --- Clear ---
function clearAll() {
  qEl.value = "";
  resultsEl.innerHTML = "";
  lastSearchPayload = null;
  statusEl.textContent = `Loaded ${rows.length.toLocaleString()} equities.`;
  statsEl.textContent = "";
  history.replaceState(null, "", location.pathname);
  qEl.focus();
}

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.key === "/" && document.activeElement !== qEl) { e.preventDefault(); qEl.focus(); }
  if (e.key === "Escape") clearAll();
  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) searchExact();
});

goEl.addEventListener("click", searchExact);
clearEl.addEventListener("click", clearAll);
copyLinkEl.addEventListener("click", copyLink);
downloadCsvEl.addEventListener("click", downloadCsv);

fieldEl.addEventListener("change", () => {
  const f = fieldEl.value;
  const placeholders = {
    isin: "Paste one or many ISINs (newline or comma separated)…",
    symbol: "Paste one or many tickers/symbols (newline or comma separated)…",
    name: "Paste exact company names (newline separated).",
    country: "Paste exact country names (newline separated).",
    description: "Paste exact description text (newline separated).",
    auto: "Paste ISINs, tickers, or exact company names — Auto tries ISIN → Ticker → Name."
  };
  qEl.placeholder = placeholders[f] || "Paste values…";
  qEl.focus();
});

// Init
async function init() {
  statusEl.textContent = "Loading dataset…";
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load ${DATA_URL}: ${res.status}`);

  const data = await res.json();
  buildIndexes(data);

  fieldEl.value = "isin"; // default
  loadStateFromUrl();
  renderRecent();

  statusEl.textContent = `Loaded ${rows.length.toLocaleString()} equities.`;
  resultsEl.innerHTML = `
    <div class="card">
      <h2 class="title">Ready</h2>
      <p class="muted">Default is <span class="pill">ISIN</span>. Paste values and click Search.</p>
      <p class="muted">Shortcut: <span class="pill">Ctrl+Enter</span> to search, <span class="pill">Esc</span> to clear.</p>
    </div>
  `;

  if (qEl.value.trim()) searchExact();
  else qEl.focus();
}

init().catch(err => {
  console.error(err);
  statusEl.textContent = "Error loading data (check console).";
  resultsEl.innerHTML = `
    <div class="card">
      <h2 class="title">Could not load dataset</h2>
      <p class="muted">
        Ensure <code>docs/data/equities.min.json</code> exists and GitHub Pages is publishing from <code>/docs</code>.
      </p>
    </div>
  `;
});
