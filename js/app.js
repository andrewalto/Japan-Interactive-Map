/* ============================================================
   STATE
   ============================================================ */

const state = {
  selectedDays: new Set(),        // empty = all
  enabledCats: new Set(Object.keys(CATEGORIES)),
  searchTerm: "",
  showRoute: false,
  showLabels: false,
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
  return L.divIcon({
    className: "pin-wrap",
    html: `<div class="pin-wrap-outer"><div class="pin" style="--pin-color:${c.color};">${c.symbol}</div>${labelHTML}</div>`,
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

function popupHTML(p) {
  const c = CATEGORIES[p.category] || CATEGORIES.cultural;
  const [lat, lng] = p.coords;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  return `
    <div class="pop">
      <div class="pop-head" style="background:linear-gradient(135deg, ${c.color}, ${c.color}cc);">
        <div class="pop-badges">
          <span class="pop-badge">Day ${p.day}</span>
          <span class="pop-badge">${escapeHtml(c.label)}</span>
        </div>
        <h3 class="pop-title">${escapeHtml(p.name)}</h3>
        <div class="pop-tagline">${escapeHtml(p.tagline)}</div>
      </div>
      <div class="pop-body">
        <p class="pop-desc">${escapeHtml(p.desc)}</p>
        <div class="pop-meta">
          <div class="pop-meta-row"><span class="pop-meta-icon">🕐</span><span>${escapeHtml(p.hours)}</span></div>
          <div class="pop-meta-row"><span class="pop-meta-icon">💴</span><span>${escapeHtml(p.cost)}</span></div>
          <div class="pop-meta-row tip"><span class="pop-meta-icon">💡</span><span>${escapeHtml(p.tip)}</span></div>
        </div>
        <a class="pop-cta" href="${mapsUrl}" target="_blank" rel="noopener noreferrer">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Open in Google Maps
        </a>
      </div>
    </div>
  `;
}

function buildMarkers() {
  allMarkers.length = 0;
  trip.forEach(p => {
    const m = L.marker(p.coords, { icon: makeDivIcon(p) });
    m.bindPopup(popupHTML(p), { closeButton: true, autoPan: true, maxWidth: 280, minWidth: 280 });
    allMarkers.push({ marker: m, point: p });
  });
}

/* ============================================================
   FILTERING + RENDER
   ============================================================ */

function pointVisible(p) {
  if (!state.enabledCats.has(p.category)) return false;
  if (state.selectedDays.size > 0 && !state.selectedDays.has(p.day)) return false;
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
    visible.length === trip.length ? `${visible.length} pins` : `${visible.length} / ${trip.length}`;

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
  trip.forEach(p => {
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
}

function buildCategoryList() {
  const wrap = document.getElementById("catList");
  wrap.innerHTML = "";
  Object.entries(CATEGORIES).forEach(([key, cat]) => {
    const count = trip.filter(p => p.category === key).length;
    if (count === 0) return; // hide unused categories like lodging
    const row = document.createElement("label");
    row.className = "cat-row";
    row.innerHTML = `
      <input type="checkbox" checked />
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
    const count = trip.filter(p => p.category === key).length;
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

buildDayStripe();
buildMarkers();
buildDayPills();
buildCategoryList();
buildLegend();
restoreFromHash();

// Sync category checkboxes if restored
document.querySelectorAll("#catList .cat-row").forEach(row => {
  const lbl = row.querySelector(".lbl").textContent;
  const key = Object.entries(CATEGORIES).find(([_,c]) => c.label === lbl)?.[0];
  if (!key) return;
  const cb = row.querySelector("input");
  const enabled = state.enabledCats.has(key);
  cb.checked = enabled;
  row.classList.toggle("off", !enabled);
});
refreshDayPills();

renderMarkers(false);

// Fit to all on first load
const startBounds = L.latLngBounds(trip.map(p => p.coords));
map.fitBounds(startBounds, { padding: [40, 40] });

// Re-fit map on resize after a moment so it settles
window.addEventListener("resize", () => {
  setTimeout(() => map.invalidateSize(), 100);
});
