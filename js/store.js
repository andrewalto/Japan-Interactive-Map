/* ============================================================
   PLACES STORE — Firestore-backed shared state.

   Exposes:
     ready            promise resolving once the first data is available
     onPlaces(cb)     cb(placesArray) now and on every remote change
     addPlace(data)   write a new candidate place
     confirmPlace(id, day, who)
     discardPlace(id, who)   soft delete (kept 7 days)
     restorePlace(id)
     seedV1Data()     one-time idempotent import of the V1 itinerary

   If firebase-config.js still has placeholder values, the store
   falls back to the bundled V1 itinerary (read-only) so the map
   keeps working before/without a backend.
   ============================================================ */

import { firebaseConfig, isConfigured } from "./firebase-config.js";
import { SEED_TRIP } from "./data.js";

const SOFT_DELETE_DAYS = 7;

let listeners = [];
let places = [];
let discarded = []; // soft-deleted within the last SOFT_DELETE_DAYS
export function getDiscarded() { return discarded; }

/* Shared trip settings (settings/trip doc). Defaults apply until the
   doc exists or while running without a backend. */
let settingsListeners = [];
let tripSettings = { totalDays: 16 };
export function onSettings(cb) {
  settingsListeners.push(cb);
  cb(tripSettings);
}
function emitSettings() {
  settingsListeners.forEach((cb) => cb(tripSettings));
}

let resolveReady;
export const ready = new Promise((res) => (resolveReady = res));

export function onPlaces(cb) {
  listeners.push(cb);
  cb(places);
}

function emit() {
  listeners.forEach((cb) => cb(places));
}

/* Deterministic doc id from a place name, so re-running the seed
   overwrites the same 60 docs instead of duplicating them. */
export function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function seedDocs() {
  const now = new Date().toISOString();
  return SEED_TRIP.map((p) => ({
    id: slugify(p.name),
    name: p.name,
    category: p.category,
    coords: p.coords,
    tagline: p.tagline || "",
    desc: p.desc || "",
    hours: p.hours || "",
    cost: p.cost || "",
    tip: p.tip || "",
    status: "confirmed",
    day: p.day,
    addedBy: "Itinerary V1",
    addedAt: now,
    confirmedBy: "Itinerary V1",
    deletedAt: null,
  }));
}

/* ---------- offline/local fallback (no Firebase configured) ---------- */

export let backend = "local";
let db = null;
let fs = null; // firestore module namespace

if (!isConfigured) {
  places = seedDocs();
  resolveReady();
  // emit on next tick so subscribers registered after import still fire
  queueMicrotask(emit);
} else {
  backend = "firestore";
  init();
}

async function init() {
  const appMod = await import("../vendor/firebase/firebase-app.js");
  fs = await import("../vendor/firebase/firebase-firestore.js");

  const app = appMod.initializeApp(firebaseConfig);
  // Offline persistence: cached data + queued writes survive signal loss,
  // shared across tabs.
  db = fs.initializeFirestore(app, {
    localCache: fs.persistentLocalCache({
      tabManager: fs.persistentMultipleTabManager(),
    }),
  });

  fs.onSnapshot(
    fs.collection(db, "places"),
    (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Map shows only non-deleted places; recently-discarded ones stay in
      // `discarded` for SOFT_DELETE_DAYS so a "bring that back" is possible.
      const cutoff = Date.now() - SOFT_DELETE_DAYS * 24 * 60 * 60 * 1000;
      places = all.filter((p) => !p.deletedAt);
      discarded = all.filter(
        (p) => p.deletedAt && Date.parse(p.deletedAt) > cutoff
      );
      resolveReady();
      emit();
    },
    (err) => {
      console.error("Firestore listener error:", err);
      // Keep the map usable: fall back to the bundled itinerary once.
      if (places.length === 0) {
        backend = "local";
        places = seedDocs();
        resolveReady();
        emit();
      }
    }
  );

  fs.onSnapshot(
    fs.doc(db, "settings", "trip"),
    (snap) => {
      const data = snap.data();
      if (data && Number.isInteger(data.totalDays)) {
        tripSettings = { totalDays: data.totalDays };
        emitSettings();
      }
    },
    (err) => console.error("Settings listener error:", err)
  );
}

/* ---------- writes (no-ops with a console warning in local mode) ---------- */

function requireBackend() {
  if (backend !== "firestore" || !db) {
    console.warn("Firebase not configured — write ignored.");
    return false;
  }
  return true;
}

export async function addPlace(data) {
  if (!requireBackend()) return null;
  const docData = {
    name: data.name,
    category: data.category,
    coords: data.coords,
    tagline: data.tagline || "",
    desc: data.desc || "",
    hours: data.hours || "",
    cost: data.cost || "",
    tip: data.tip || "",
    status: "candidate",
    day: null,
    addedBy: data.addedBy || "Anonymous",
    addedAt: new Date().toISOString(),
    confirmedBy: null,
    deletedAt: null,
  };
  const ref = await fs.addDoc(fs.collection(db, "places"), docData);
  return ref.id;
}

export async function confirmPlace(id, day, who) {
  if (!requireBackend()) return;
  await fs.updateDoc(fs.doc(db, "places", id), {
    status: "confirmed",
    day,
    confirmedBy: who || "Anonymous",
  });
}

export async function moveToDay(id, day) {
  if (!requireBackend()) return;
  await fs.updateDoc(fs.doc(db, "places", id), { day });
}

export async function discardPlace(id) {
  if (!requireBackend()) return;
  await fs.updateDoc(fs.doc(db, "places", id), {
    deletedAt: new Date().toISOString(),
  });
}

export async function restorePlace(id) {
  if (!requireBackend()) return;
  await fs.updateDoc(fs.doc(db, "places", id), { deletedAt: null });
}

/* Change the trip length. `strandedIds` are confirmed places on days
   beyond the new length — they're demoted back to candidates in the
   same batch so nothing is lost. */
export async function setTripLength(totalDays, strandedIds = []) {
  if (!requireBackend()) return;
  const batch = fs.writeBatch(db);
  strandedIds.forEach((id) => {
    batch.update(fs.doc(db, "places", id), {
      status: "candidate",
      day: null,
      confirmedBy: null,
    });
  });
  batch.set(fs.doc(db, "settings", "trip"), { totalDays });
  await batch.commit();
}

/* ---------- one-time V1 migration ---------- */

export async function seedV1Data() {
  if (!requireBackend()) return "Firebase not configured";
  const docs = seedDocs();
  const batch = fs.writeBatch(db);
  docs.forEach((d) => {
    const { id, ...data } = d;
    batch.set(fs.doc(db, "places", id), data);
  });
  await batch.commit();
  return `Seeded ${docs.length} places`;
}

// Convenience: visiting the site with #seed runs the migration once.
if (isConfigured && location.hash === "#seed") {
  ready.then(async () => {
    const msg = await seedV1Data();
    console.log("[seed]", msg);
    alert(msg + " — you can close this tab or remove #seed from the URL.");
    history.replaceState(null, "", location.pathname);
  });
}
