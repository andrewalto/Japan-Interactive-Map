/* ============================================================
   APP — map, sidebar, filtering. Data arrives from the store
   (Firestore-backed, or bundled V1 itinerary as a fallback).
   ============================================================ */

import { CATEGORIES, dayColor } from "./data.js";
import { onPlaces, confirmPlace, moveToDay, discardPlace, restorePlace, getDiscarded } from "./store.js";

/* ============================================================
   STATE
   ============================================================ */

let places = []; // live list from the store

const state = {
  selectedDays: new Set(),        // empty = all
  enabledCats: new Set(Object.keys(CATEGORIES)),
  searchTerm: "",
  showRoute: false,
  showLabels: false,
  showCandidatesWithDay: false,   // "also show candidates" when a day is filtered
};

const totalDays = 16;

/* ============================================================
   MAP SETUP
   ============================================================ */

const map = L.map("map", {
  zoomControl: true,
  preferCanvas: false,
  worldCopyJump: false,
}).setView([35.5, 137.5], 6);

L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  maxZoom: 19,
  subdomains: "abcd",
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

map.zoomControl.setPosition("topright");

/* ============================================================
   MARKERS
   ============================================================ */

function makeDivIcon(p) {
  const c = CATEGORIES[p.category] || CATEGORIES.cultural;
  const labelHTML = state.showLabels
    ? `<div class="pin-label">${escapeHtml(p.name)}</div>`
    : "";
  const isCandidate = p.status === "candidate";
  const statusClass = isCandidate ? "candidate" : "confirmed";
  const pulseClass = isCandidate ? " candidate-pulse" : "";
  return L.divIcon({
    className: "pin-wrap",
    html: `<div class="pin-wrap-outer${pulseClass}"><div class="pin ${statusClass}" style="--pin-color:${c.color};">${c.symbol}</div>${labelHTML}</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -20],
  });
}

let markerLayer = null;
const allMarkers = []; // {marker, point}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
  }[c]));
}

function attribHTML(p) {
  if (p.addedBy === "Itinerary V1") return "From the original itinerary";
  let s = `Added by ${escapeHtml(p.addedBy || "?")}` + (p.addedAt ? ` · ${timeAgo(p.addedAt)}` : "");
  if (p.status === "confirmed" && p.confirmedBy && p.confirmedBy !== p.addedBy) {
    s += ` · Confirmed by ${escapeHtml(p.confirmedBy)}`;
  }
  return s;
}

function popupContent(p) {
  const c = CATEGORIES[p.category] || CATEGORIES.cultural;
  const [lat, lng] = p.coords;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const isCandidate = p.status === "candidate";

  const statusRow = isCandidate
    ? `<div class="pop-status candidate"><span class="ps-mark">◌</span>Candidate — proposed by ${escapeHtml(p.addedBy || "?")}</div>`
    : `<div class="pop-status confirmed"><span class="ps-mark">✓</span>Confirmed — Day ${p.day}</div>`;

  const stat = (ico, val, unknownLabel) =>
    val
      ? `<div class="pop-stat"><span class="st-ico">${ico}</span><span class="st-txt">${escapeHtml(val)}</span></div>`
      : `<div class="pop-stat unknown"><span class="st-ico">${ico}</span><span class="st-txt">${unknownLabel}</span></div>`;

  const el = document.createElement("div");
  el.className = "pop";
  el.innerHTML = `
    ${statusRow}
    <div class="pop-head" style="background:linear-gradient(135deg, ${c.color}, ${c.color}cc);">
      <div class="pop-badges">
        ${isCandidate ? "" : `<span class="pop-badge">Day ${p.day}</span>`}
        <span class="pop-badge">${escapeHtml(c.label)}</span>
      </div>
      <h3 class="pop-title">${escapeHtml(p.name)}</h3>
      ${p.tagline ? `<div class="pop-tagline">${escapeHtml(p.tagline)}</div>` : ""}
    </div>
    <div class="pop-body">
      ${p.desc ? `<p class="pop-desc">${escapeHtml(p.desc)}</p>` : ""}
      <div class="pop-stats">
        ${stat("🕐", p.hours, "hours not yet known")}
        ${stat("💴", p.cost, "cost not yet known")}
      </div>
      ${p.tip ? `<div class="pop-tip"><span class="pt-ico">💡</span><span>${escapeHtml(p.tip)}</span></div>` : ""}
      <div class="pop-actions">
        <button class="pop-act primary" data-act="${isCandidate ? "confirm" : "move"}">
          ${isCandidate ? "Confirm" : "Move day"}
        </button>
        <button class="pop-act danger" data-act="remove">Remove</button>
      </div>
      <a class="pop-cta" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
        Open in Google Maps
      </a>
      <div class="pop-attrib">${attribHTML(p)}</div>
    </div>
  `;

  el.querySelector('[data-act="confirm"], [data-act="move"]').addEventListener("click", async (e) => {
    const day = await showDayPicker(p.name);
    if (day == null) return;
    if (e.target.dataset.act === "confirm") {
      await confirmPlace(p.id, day, getUserName());
      toast(`Confirmed to Day ${day}`);
    } else {
      await moveToDay(p.id, day);
      toast(`Moved to Day ${day}`);
    }
  });

  el.querySelector('[data-act="remove"]').addEventListener("click", async () => {
    if (!window.confirm(`Remove "${p.name}" from the map? It can be restored for 7 days.`)) return;
    await discardPlace(p.id);
    toast(`Removed — restorable for 7 days`);
  });

  return el;
}

function buildMarkers() {
  allMarkers.length = 0;
  places.forEach(p => {
    const m = L.marker(p.coords, { icon: makeDivIcon(p) });
    // content built fresh on each open so status/attribution stay current
    m.bindPopup(() => popupContent(p), { closeButton: true, autoPan: true, maxWidth: 280, minWidth: 280 });
    allMarkers.push({ marker: m, point: p });
  });
}

/* ============================================================
   FILTERING + RENDER
   ============================================================ */

function pointVisible(p) {
  if (!state.enabledCats.has(p.category)) return false;
  if (state.selectedDays.size > 0) {
    // Day view shows that day's confirmed plan; candidates (day = null)
    // join only when the "also show candidates" toggle is on.
    const inDay = state.selectedDays.has(p.day);
    const asCandidate = state.showCandidatesWithDay && p.status === "candidate";
    if (!inDay && !asCandidate) return false;
  }
  if (state.searchTerm) {
    const t = state.searchTerm.toLowerCase();
    if (!(p.name.toLowerCase().includes(t) ||
          p.tagline.toLowerCase().includes(t) ||
          p.desc.toLowerCase().includes(t))) return false;
  }
  return true;
}

let routeLayer = null;
let distanceLabelLayer = null;

function renderMarkers(fit = false) {
  if (markerLayer) { map.removeLayer(markerLayer); markerLayer = null; }

  const visible = allMarkers.filter(({point}) => pointVisible(point));

  // Refresh icons so label state is correct
  visible.forEach(({marker, point}) => marker.setIcon(makeDivIcon(point)));

  markerLayer = L.layerGroup();
  visible.forEach(v => markerLayer.addLayer(v.marker));
  map.addLayer(markerLayer);

  // Apply search hit highlighting after icons render
  if (state.searchTerm) {
    setTimeout(() => {
      const t = state.searchTerm.toLowerCase();
      visible.forEach(({marker, point}) => {
        const el = marker.getElement();
        const inner = el && el.querySelector(".pin");
        if (inner && point.name.toLowerCase().includes(t)) {
          inner.classList.add("search-hit");
        }
      });
    }, 50);
  }

  // Pin count
  document.getElementById("pinCount").textContent =
    visible.length === places.length ? `${visible.length} pins` : `${visible.length} / ${places.length}`;

  if (fit && visible.length > 0) {
    const bounds = L.latLngBounds(visible.map(v => v.point.coords));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
  }

  renderRoute();
}

/* ============================================================
   ROUTE LAYER
   ============================================================ */

function dayCentroids() {
  // Group visible points by day, compute centroid per day
  const buckets = {};
  places.forEach(p => {
    if (!pointVisible(p)) return;
    if (!buckets[p.day]) buckets[p.day] = [];
    buckets[p.day].push(p.coords);
  });
  const result = [];
  for (let d = 1; d <= totalDays; d++) {
    if (!buckets[d] || buckets[d].length === 0) continue;
    const lat = buckets[d].reduce((s, c) => s + c[0], 0) / buckets[d].length;
    const lng = buckets[d].reduce((s, c) => s + c[1], 0) / buckets[d].length;
    result.push({ day: d, latlng: [lat, lng] });
  }
  return result;
}

function haversineKm(a, b) {
  const R = 6371;
  const toRad = (x) => x * Math.PI / 180;
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);
  const h = Math.sin(dLat/2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng/2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function renderRoute() {
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  if (distanceLabelLayer) { map.removeLayer(distanceLabelLayer); distanceLabelLayer = null; }
  if (!state.showRoute) return;

  const points = dayCentroids();
  if (points.length < 2) return;

  routeLayer = L.layerGroup();
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i+1];
    const color = dayColor(b.day);
    const line = L.polyline([a.latlng, b.latlng], {
      color,
      weight: 3,
      opacity: 0.85,
      dashArray: "8,8",
      lineCap: "round",
    });
    line.addTo(routeLayer);

    // Midpoint distance label (only if >5km to avoid clutter)
    const km = haversineKm(a.latlng, b.latlng);
    if (km > 5) {
      const mid = [(a.latlng[0] + b.latlng[0]) / 2, (a.latlng[1] + b.latlng[1]) / 2];
      const label = L.marker(mid, {
        icon: L.divIcon({
          className: "route-label-wrap",
          html: `<div class="route-label">D${a.day}→D${b.day} · ${km < 10 ? km.toFixed(1) : Math.round(km)} km</div>`,
          iconSize: null,
          iconAnchor: [0, 0],
        }),
        interactive: false,
      });
      label.addTo(routeLayer);
    }
  }
  routeLayer.addTo(map);
}

/* ============================================================
   SIDEBAR UI
   ============================================================ */

function buildDayPills() {
  const wrap = document.getElementById("dayPills");
  wrap.innerHTML = "";
  for (let d = 1; d <= totalDays; d++) {
    const pill = document.createElement("button");
    pill.className = "day-pill";
    pill.style.setProperty("--day-color", dayColor(d));
    pill.textContent = d;
    pill.title = `Day ${d}`;
    pill.dataset.day = d;
    pill.addEventListener("click", () => {
      if (state.selectedDays.has(d)) state.selectedDays.delete(d);
      else state.selectedDays.add(d);
      refreshDayPills();
      renderMarkers(true);
    });
    wrap.appendChild(pill);
  }
  refreshDayPills();
}

function refreshDayPills() {
  document.querySelectorAll(".day-pill").forEach(p => {
    const d = parseInt(p.dataset.day, 10);
    p.classList.toggle("active", state.selectedDays.has(d));
    if (state.selectedDays.size > 0) p.classList.toggle("dim", !state.selectedDays.has(d));
    else p.classList.remove("dim");
  });
  // Hint
  const hint = document.getElementById("daysHint");
  if (state.selectedDays.size === 0) hint.textContent = "tap to filter";
  else hint.textContent = `${state.selectedDays.size} selected · tap again to clear`;

  // Candidates toggle is only meaningful while a day is filtered
  document.getElementById("candDayToggle")
    .classList.toggle("visible", state.selectedDays.size > 0);
}

function buildCategoryList() {
  const wrap = document.getElementById("catList");
  wrap.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const count = places.filter(p => p.category === key).length;
    if (count === 0) return; // hide unused categories like lodging
    const enabled = state.enabledCats.has(key);
    const row = document.createElement("label");
    row.className = "cat-row" + (enabled ? "" : " off");
    row.innerHTML = `
      <input type="checkbox" ${enabled ? "checked" : ""} />
      <span class="cat-dot" style="background:${cat.color};">${cat.symbol}</span>
      <span class="lbl">${cat.label}</span>
      <span class="cnt">${count}</span>
    `;
    const cb = row.querySelector("input");
    cb.addEventListener("change", () => {
      if (cb.checked) state.enabledCats.add(key);
      else state.enabledCats.delete(key);
      row.classList.toggle("off", !cb.checked);
      renderMarkers(false);
    });
    wrap.appendChild(row);
  });
}

function buildLegend() {
  const wrap = document.getElementById("legendGrid");
  wrap.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const count = places.filter(p => p.category === key).length;
    if (count === 0) return;
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="ldot" style="background:${cat.color}"></span>${cat.label}`;
    wrap.appendChild(item);
  });
}

function buildDayStripe() {
  const wrap = document.getElementById("dayStripe");
  wrap.innerHTML = "";
  for (let d = 1; d <= totalDays; d++) {
    const seg = document.createElement("div");
    seg.className = "seg";
    seg.style.background = dayColor(d);
    seg.title = `Day ${d}`;
    wrap.appendChild(seg);
  }
}

/* ============================================================
   CANDIDATES PANEL
   ============================================================ */

function timeAgo(iso) {
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return "";
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function getUserName() {
  let name = localStorage.getItem("userName");
  if (!name) {
    name = (prompt("Your name (shown to the group when you confirm or add places):") || "").trim();
    if (name) localStorage.setItem("userName", name);
  }
  return name || "Anonymous";
}

function focusPlace(id) {
  const entry = allMarkers.find(({ point }) => point.id === id);
  if (!entry) return;
  map.setView(entry.point.coords, Math.max(map.getZoom(), 13), { animate: true });
  entry.marker.openPopup();
}

function renderCandidates() {
  const wrap = document.getElementById("candList");
  const hint = document.getElementById("candHint");
  const candidates = places
    .filter((p) => p.status === "candidate")
    .sort((a, b) => (b.addedAt || "").localeCompare(a.addedAt || ""));

  hint.textContent = candidates.length
    ? `${candidates.length} to decide`
    : "";
  wrap.innerHTML = "";

  if (candidates.length === 0) {
    wrap.innerHTML = `<div class="cand-empty">Nothing waiting on a decision. Ideas anyone adds will land here for the group to confirm or discard.</div>`;
  }

  candidates.forEach((p) => {
    const c = CATEGORIES[p.category] || CATEGORIES.cultural;
    const card = document.createElement("div");
    card.className = "cand-card";
    card.innerHTML = `
      <div class="cc-top">
        <span class="cc-dot" style="background:${c.color};"></span>
        <span class="cc-name">${escapeHtml(p.name)}</span>
      </div>
      <div class="cc-by">${escapeHtml(c.label)} · by ${escapeHtml(p.addedBy || "?")} · ${timeAgo(p.addedAt)}</div>
      <div class="cc-actions">
        <button class="cc-btn confirm">Confirm</button>
        <button class="cc-btn discard">Discard</button>
      </div>
    `;
    card.addEventListener("click", (e) => {
      if (e.target.closest(".cc-btn")) return;
      focusPlace(p.id);
      if (isMobile()) closeSidebar();
    });
    card.querySelector(".confirm").addEventListener("click", async () => {
      const day = await showDayPicker(p.name);
      if (day == null) return;
      await confirmPlace(p.id, day, getUserName());
      toast(`Confirmed to Day ${day}`);
    });
    card.querySelector(".discard").addEventListener("click", async () => {
      await discardPlace(p.id);
      toast(`Discarded — restorable for 7 days`);
    });
    wrap.appendChild(card);
  });

  renderDiscarded();
}

function renderDiscarded() {
  const wrap = document.getElementById("discardedWrap");
  const discarded = getDiscarded();
  wrap.innerHTML = "";
  if (discarded.length === 0) return;
  discarded.forEach((p) => {
    const row = document.createElement("div");
    row.className = "discarded-row";
    row.innerHTML = `
      <span class="dr-name">${escapeHtml(p.name)}</span>
      <button class="cc-btn restore">Restore</button>
    `;
    row.querySelector(".restore").addEventListener("click", async () => {
      await restorePlace(p.id);
      toast(`${p.name} restored as a candidate`);
    });
    wrap.appendChild(row);
  });
}

/* ============================================================
   DAY PICKER
   ============================================================ */

let dpResolve = null;

function buildDayPicker() {
  const grid = document.getElementById("dpGrid");
  for (let d = 1; d <= totalDays; d++) {
    const btn = document.createElement("button");
    btn.className = "dp-day";
    btn.style.setProperty("--day-color", dayColor(d));
    btn.textContent = d;
    btn.addEventListener("click", () => closeDayPicker(d));
    grid.appendChild(btn);
  }
  document.getElementById("dpCancel").addEventListener("click", () => closeDayPicker(null));
  document.getElementById("dayPicker").addEventListener("click", (e) => {
    if (e.target.id === "dayPicker") closeDayPicker(null);
  });
}

function showDayPicker(placeName) {
  document.getElementById("dpSub").textContent = placeName;
  document.getElementById("dayPicker").classList.add("show");
  return new Promise((res) => (dpResolve = res));
}

function closeDayPicker(day) {
  document.getElementById("dayPicker").classList.remove("show");
  if (dpResolve) { dpResolve(day); dpResolve = null; }
}

/* ============================================================
   TOAST
   ============================================================ */

let toastTimer = null;
function toast(msg, ms = 2200) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), ms);
}

/* ============================================================
   WIRING
   ============================================================ */

// Search
const searchInput = document.getElementById("searchInput");
const searchClear = document.getElementById("searchClear");
searchInput.addEventListener("input", (e) => {
  state.searchTerm = e.target.value.trim();
  searchClear.classList.toggle("show", !!state.searchTerm);
  renderMarkers(false);
});
searchClear.addEventListener("click", () => {
  searchInput.value = "";
  state.searchTerm = "";
  searchClear.classList.remove("show");
  renderMarkers(false);
});

// Route toggle
const routeToggle = document.getElementById("routeToggle");
routeToggle.addEventListener("click", () => {
  state.showRoute = !state.showRoute;
  routeToggle.classList.toggle("on", state.showRoute);
  renderRoute();
});

// "Also show candidates" toggle (day-filtered view)
const candDayToggle = document.getElementById("candDayToggle");
candDayToggle.addEventListener("click", () => {
  state.showCandidatesWithDay = !state.showCandidatesWithDay;
  candDayToggle.classList.toggle("on", state.showCandidatesWithDay);
  renderMarkers(false);
});

// Labels toggle
const labelsToggle = document.getElementById("labelsToggle");
labelsToggle.addEventListener("click", () => {
  state.showLabels = !state.showLabels;
  labelsToggle.classList.toggle("on", state.showLabels);
  renderMarkers(false);
});

// Fit / reset
document.getElementById("fitBtn").addEventListener("click", () => {
  const visible = allMarkers.filter(({point}) => pointVisible(point));
  if (visible.length === 0) {
    map.setView([35.5, 137.5], 6);
    return;
  }
  const bounds = L.latLngBounds(visible.map(v => v.point.coords));
  map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 });
});

// "Jump to day"
document.getElementById("todayBtn").addEventListener("click", () => {
  const ans = prompt(`Which day are you on? (1–${totalDays})`);
  if (ans === null) return;
  const d = parseInt(ans, 10);
  if (!Number.isFinite(d) || d < 1 || d > totalDays) {
    toast(`Enter a number 1–${totalDays}`);
    return;
  }
  state.selectedDays = new Set([d]);
  refreshDayPills();
  renderMarkers(true);
  toast(`Showing Day ${d}`);
});

// Share
document.getElementById("shareBtn").addEventListener("click", async () => {
  const params = new URLSearchParams();
  if (state.selectedDays.size) params.set("days", [...state.selectedDays].join(","));
  if (state.enabledCats.size !== Object.keys(CATEGORIES).length)
    params.set("cats", [...state.enabledCats].join(","));
  if (state.searchTerm) params.set("q", state.searchTerm);
  if (state.showRoute) params.set("route", "1");
  const url = `${location.origin}${location.pathname}#${params.toString()}`;

  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied to clipboard");
  } catch {
    // Fallback: replace hash
    location.hash = params.toString();
    toast("Link in address bar");
  }
});

// Sidebar collapse / expand
const sidebar = document.getElementById("sidebar");
const backdrop = document.getElementById("backdrop");
const menuBtn = document.getElementById("menuBtn");
const isMobile = () => window.matchMedia("(max-width: 760px)").matches;

function openSidebar() {
  if (isMobile()) {
    sidebar.classList.add("open");
    backdrop.classList.add("show");
  } else {
    sidebar.classList.remove("collapsed");
  }
  menuBtn.classList.remove("show");
  setTimeout(() => map.invalidateSize(), 320);
}

function closeSidebar() {
  if (isMobile()) {
    sidebar.classList.remove("open");
    backdrop.classList.remove("show");
  } else {
    sidebar.classList.add("collapsed");
  }
  menuBtn.classList.add("show");
  setTimeout(() => map.invalidateSize(), 320);
}

menuBtn.addEventListener("click", openSidebar);
document.getElementById("collapseBtn").addEventListener("click", closeSidebar);
backdrop.addEventListener("click", closeSidebar);

// Start with sidebar visible on desktop, hidden on mobile (button shown)
if (isMobile()) menuBtn.classList.add("show");

/* ============================================================
   URL HASH (restore shared state)
   ============================================================ */

function restoreFromHash() {
  if (!location.hash) return;
  const params = new URLSearchParams(location.hash.slice(1));
  if (params.has("days")) {
    state.selectedDays = new Set(
      params.get("days").split(",").map(s => parseInt(s, 10)).filter(Number.isFinite)
    );
  }
  if (params.has("cats")) {
    state.enabledCats = new Set(params.get("cats").split(",").filter(Boolean));
  }
  if (params.has("q")) {
    state.searchTerm = params.get("q");
    searchInput.value = state.searchTerm;
    searchClear.classList.add("show");
  }
  if (params.get("route") === "1") {
    state.showRoute = true;
    routeToggle.classList.add("on");
  }
}

/* ============================================================
   INIT
   ============================================================ */

// Static UI (doesn't depend on place data)
buildDayStripe();
buildDayPills();
buildDayPicker();
restoreFromHash();
refreshDayPills();

// Data-dependent UI: rebuilt on every store update (first load,
// someone adds/confirms a place, offline sync catches up, …)
let firstData = true;
onPlaces((list) => {
  places = list;
  buildMarkers();
  buildCategoryList();
  buildLegend();
  renderCandidates();
  renderMarkers(false);

  if (firstData && places.length > 0) {
    firstData = false;
    const startBounds = L.latLngBounds(places.map(p => p.coords));
    map.fitBounds(startBounds, { padding: [40, 40] });
  }
});

// Re-fit map on resize after a moment so it settles
window.addEventListener("resize", () => {
  setTimeout(() => map.invalidateSize(), 100);
});
