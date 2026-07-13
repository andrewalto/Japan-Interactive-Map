# Japan Trip Interactive Map — V2 Build Spec

This is a build spec, not a visual-mockup brief. Recommended tool: a Claude conversation with artifacts / code execution enabled (or Claude Code), NOT Claude Design — this project requires real shared data persistence across devices, which is an engineering problem, not a visual one.

## 0. Context: what changed from V1

V1 (live at `andrewalto.github.io/Japan-Interactive-Map`) is a single static HTML file with a hardcoded list of ~60 locations. It has no concept of "maybe" vs "definitely," no way to add new places, and everyone who opens the site sees the same fixed data.

V2 needs to become a living planning tool the group edits together, with three new concepts:

1. **Candidate places** — things anyone in the group has found and floated, not yet decided.
2. **Confirmed places** — things assigned to a specific day, locked in.
3. **Shared state** — when someone adds or confirms something, everyone else sees it next time they open the map (not just on their own phone).

## 1. Architecture recommendation

GitHub Pages only serves static files — it cannot store data. To make additions/confirmations shared across the group, you need a small real-time backend. Recommended: **Firebase Firestore**.

Why Firebase:

* Free tier covers this use case entirely (trip-scale read/write volume is tiny).
* Real-time listeners mean everyone's map updates live without refreshing.
* No server to run or maintain — it's a hosted service you call from JS.
* Setup is ~15 minutes: create a project at firebase.google.com, enable Firestore, copy a config snippet into the HTML file.

Alternative if you want zero backend setup: keep it fully local (each person's additions only save to their own device via `localStorage`) and instead have one person periodically export/merge a shared JSON file back into the GitHub repo. This is simpler but manual — someone has to be the "merger." Only recommend this if Firebase setup feels like overkill for a 16-day trip.

Data model (Firestore collection: `places`):

```javascript
{
  id: "auto-generated",
  name: "Ichiran Ramen Shibuya",
  category: "food",              // same category system as V1
  coords: [35.6595, 139.7005],
  tagline: "Solo-booth tonkotsu ramen chain",
  desc: "...",
  hours: "10 AM – 11 PM",
  cost: "¥1,200",
  tip: "...",
  status: "candidate",           // "candidate" | "confirmed"
  day: null,                     // 1-16, or null if not yet assigned/candidate
  addedBy: "Andrew",             // simple name string, no auth needed
  addedAt: "2026-05-14T18:22:00Z",
  confirmedBy: null,             // who locked it in, once confirmed
}
```

No user accounts needed — just a name field people type once (stored in their browser) so additions are attributed.

## 2. Feature: Candidate list → group decides → confirm to a day

Flow:

1. Anyone finds a place (a restaurant on Instagram, a shop someone mentions) and taps "+ Add Place" on the map.
2. It's saved with `status: "candidate"`, no day assigned. It appears on the map immediately with a dashed silver/gray ring (see Section 4) so it reads as "proposed, not decided."
3. There's a separate "Candidates" tab/panel (distinct from the day filter) listing every candidate as a simple card: name, category, who added it, and two buttons — "Confirm" and "Discard."
4. Tapping Confirm opens a small day-picker (1–16). Once picked, `status` flips to `"confirmed"`, `day` is set, and the marker's ring changes from silver-dashed to solid gold.
5. Discarded candidates are soft-deleted (kept for 7 days in case of "wait, bring that back") rather than hard-deleted immediately.

Why this shape: it mirrors how your group actually plans — someone floats an idea, it sits in a holding area, and only becomes "real" once you've actually talked about it. The map should never silently promote something from suggestion to plan.

## 3. Feature: cleaner popup redesign

Current V1 popup (see reference screenshot) is functional but a little flat — a single blurb-list of icon+text rows. Redesign direction:

* Tighter visual hierarchy. Category badge + day badge stay, but smaller and lighter — they're metadata, not the headline. Name should dominate.
* Group hours/cost into a compact stat row instead of stacked lines — e.g. a single row with a subtle divider between "6 AM–6 PM" and "¥400" rather than two full-width rows.
* Tip becomes a distinct callout (keep the current yellow box treatment — that part reads well) but tighten the padding and use a slightly smaller font so it doesn't dominate the card.
* Add a status row at the top of every confirmed/candidate popup: a small pill reading "✓ Confirmed — Day 9" or "◌ Candidate — proposed by Andrew" so status is legible without needing to check the ring color.
* Action buttons live in the popup, not just the sidebar. Every popup gets inline buttons: `Confirm` (if candidate) / `Move to different day` (if confirmed) / `Remove` / `Open in Google Maps`. This avoids forcing people to hunt in a side panel to act on what they're looking at.
* Keep the whole card under ~300px wide, rounded corners, soft shadow — same restrained aesthetic as V1, just less crowded.

## 4. Feature: confirmed vs. candidate visual differentiation

* Confirmed places: marker keeps its category color fill, with a solid gold ring (3px, `#d4af37`) around the outer edge.
* Candidate places: marker uses a muted/desaturated version of its category color, with a dashed silver ring (3px, `#94a3b8`, dash pattern) around the edge — visually reads as "not yet real."
* Optional: a very subtle pulse animation (opacity 0.7↔1.0 over 2s) on candidate markers only, to draw the eye to "this still needs a decision" without being obnoxious.
* Legend update: add a small two-item legend row — a gold-ring dot labeled "Confirmed" and a silver-dashed dot labeled "Candidate" — next to the existing category legend.
* Day filter behavior: when a day pill is selected, show only confirmed places for that day by default, with a small toggle "also show candidates" — keeps the main filtered view focused on what's actually locked in.

## 5. Feature: "Add a new place" flow

Trigger: a persistent `+ Add Place` button, bottom-right of the map (thumb-reachable on mobile).

Form fields (modal or slide-up sheet):

* Name (required)
* Category (dropdown, same 10 categories as V1)
* Location — two input methods:
   * Search box using OpenStreetMap Nominatim geocoding (`https://nominatim.openstreetmap.org/search?format=json&q={query}`) to auto-fill coordinates from an address or place name — free, no API key.
   * Or "drop a pin" — tap a spot on the map directly if the place isn't in Nominatim's results.
* Tagline (short, optional)
* Description (optional)
* Hours / Cost / Tip (all optional — don't block submission if unknown; V1's "honest data states" principle applies here too, show "Hours: not yet known" rather than a fabricated guess)
* Your name (remembered in browser after first entry, so it's not re-typed every time)

On submit: writes to Firestore with `status: "candidate"`, no day. Appears on everyone's map within seconds, dashed-silver, in the Candidates panel.

Validation: name and category required, everything else optional. Coordinates required (via one of the two methods above) — a place with no location can't render on a map, so gate submission on that specifically.

## 6. Additional recommendations (optional but worth considering)

* Attribution on hover/tap: "Added by Andrew, 2 days ago" / "Confirmed by Priya" — small gray text at the bottom of the popup. Cheap to build, prevents "wait who picked this" disputes.
* Day capacity flag: if a day already has 5+ confirmed places, show a small warning icon next to that day's pill in the filter row ("this day is getting full") — doesn't block adding more, just nudges awareness.
* Conflict nudge: if two candidates are confirmed to the same day within the same 2-hour rough time-of-day category (e.g. two dinner spots both confirmed for Day 9 evening), show a soft warning banner rather than silently allowing both — group can decide which one wins.
* Offline resilience: cache the last-loaded map tiles and place data in the browser so the map still functions with no signal; only add/confirm actions require connectivity, and those can queue locally and sync once back online (Firestore's offline persistence handles this mostly automatically if enabled).
* Simple activity feed: a collapsed "recent changes" strip — "Priya added Yakiniku M · 3h ago," "Andrew confirmed Fushimi Inari to Day 10 · 1d ago" — gives the group a lightweight way to catch up on what's changed since they last looked, without digging through the candidates panel.

## 7. Explicitly out of scope

* User accounts / login — a typed name is sufficient, no auth needed for a trip this size.
* Push notifications when something is confirmed — nice-to-have, skip for v2.
* Editing existing V1 seed data through the UI — that data can stay hardcoded as the "confirmed" baseline; the new system only needs to handle additions going forward.

## 8. Deliverable

Updated single HTML file (or HTML + a small Firebase config file), same self-contained style as V1, deployed to the same GitHub Pages repo. Existing V1 dataset should be imported as pre-confirmed entries (status: "confirmed", with existing day assignments) so nothing from the current itinerary is lost in the migration.
