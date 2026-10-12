# Module 08 — Household Map UI

Status: **Built**. Served at `GET /map` (and `/map/vendor/leaflet/*` for its self-hosted map
library). This is the first (and so far only) browser UI in this repo — everything before it was
API-only.

## What this is — and the constraint that shaped it

The request was specifically for this to live *in this app*, not as a separate frontend project.
Given the existing stack has no build pipeline, bundler, or frontend framework at all, adding one
just for a single map page would have been a disproportionate amount of new infrastructure for
what's needed. Instead:

- `public/map/{index.html,style.css,app.js}` is a plain, unbuilt static page — no React, no
  bundler, no TypeScript compilation. `app.js` is hand-written vanilla JS.
- It's served directly by the existing Express app (`app.use('/map', express.static(...))` in
  `src/app.ts`), not a separate server or process.
- It is a **client of the JSON API that already exists** — every action (login, list households,
  create, update, delete) goes through the same `/api/v1/...` endpoints and the same
  Bearer-token auth every other consumer (curl, Postman, a future real frontend) uses. No new
  backend endpoints were added for this feature; Households already had everything needed
  (`centerLat`/`centerLng`, full CRUD) since Module 02/03.
- Leaflet (the map library) is installed as a normal npm dependency and served from
  `node_modules/leaflet/dist` — not loaded from a CDN. This means the page has zero external
  script dependency and needed no Content-Security-Policy `script-src` exception. The only
  external calls the page makes are for map tile *images*, which is why `img-src` (not
  `script-src`) is the one CSP directive widened in `src/app.ts`.

### Tile provider: not OpenStreetMap's own servers — three were tried before this worked

Map tiles come from **Esri's free ArcGIS Online `World_Street_Map` service**
(`server.arcgisonline.com`), not `tile.openstreetmap.org`. Three options were tried, in order,
before landing here — worth recording since "just point Leaflet at OpenStreetMap" is the obvious
first instinct and it's the wrong one for anything beyond a single manual page load:

1. **`tile.openstreetmap.org` directly** — OSM's own tile servers are volunteer-run and their
   usage policy (osm.wiki/Tile_usage_policy) explicitly excludes third-party app/embedded use;
   repeated automated testing against this page during development got the testing machine's IP
   403-blocked (`Access blocked... App is not following the tile usage policy`). This is the
   *expected* outcome of using them this way, not a fluke.
2. **CARTO's anonymous basemap tiles** (`basemaps.cartocdn.com`) — used to work key-free for
   light/demo use; now serves visibly watermarked "API KEY REQUIRED" tiles without one.
3. **Wikimedia's public OSM tile service** (`maps.wikimedia.org`) — intended for external
   embedding, but returned `403` in testing here too.

Esri's basemap tile servers, by contrast, returned real tiles with `Access-Control-Allow-Origin:
*` with no key and no blocking across repeated checks. Required attribution is just "Tiles ©
Esri" (`public/map/app.js`). Note the URL segment order is **`{z}/{y}/{x}`**, not the `{z}/{x}/{y}`
every OSM-derived tile scheme uses — easy to get backwards.

If Esri ever changes their terms the same way CARTO did, the fix is a paid/free-tier-with-signup
provider (MapTiler, Stadia Maps, Mapbox all have a generous free tier meant for real apps) rather
than hunting for a fourth anonymous option — every "free, no key, no signup" raster tile host
converges on requiring one eventually, precisely because of this exact usage pattern.

If this ever needs to grow into something more complex (multiple pages, shared components, real
state management), that's the point to introduce an actual frontend build — not before.

## What it does

- Log in (email/password against `POST /auth/login`), same as any API client. The access token
  lives in `sessionStorage`, not `localStorage` — cleared when the tab closes, not persisted
  indefinitely. There is deliberately no refresh-token rotation implemented here: on a 401 the
  page just drops the session and returns to the login screen. Fine for an internal tool used in
  short sessions; a silent-refresh interceptor is the natural upgrade if re-logging-in every 15
  minutes becomes annoying.
- Renders every household with coordinates (`centerLat`/`centerLng` set) as a pin, fetched from
  `GET /households` (paged through automatically — the page has no knowledge of the 200-row page
  cap, it just keeps requesting pages until it has them all).
- **Satellite/Streets base layer toggle** (top-right layer control, Leaflet's built-in
  `L.control.layers`) — Satellite (Esri `World_Imagery`) is the default, since seeing actual
  rooftops is the point when placing a pin on a specific house; Streets (`World_Street_Map`) is
  there for road names/general orientation. Both come from the same Esri host, so no extra CSP
  entry was needed beyond the one already added for the base map.
- **"+ Add household" → click the map** drops a draggable temporary pin and opens a form
  (address, landmark, ward, tole). Saving `POST`s to `/households` with that pin's exact
  lat/lng.
- **Click an existing pin** opens the same panel pre-filled with that household's data for
  editing (`PATCH`) or deleting (`DELETE`). The Ward field is shown but disabled in edit mode —
  the API's `updateHouseholdSchema` doesn't accept `wardId` at all (moving a household to a
  different ward isn't supported), so the UI reflects that rather than silently no-op'ing it.
- Dragging any pin (new or existing) before saving updates the coordinates that get submitted.
- A ward filter narrows which households are fetched/plotted and is also the default ward for a
  new pin's form.
- Every geo-scoping/permission rule from the API applies unchanged — a `WARD_MANAGER` using this
  page only ever sees and can only place pins in their own assigned ward, same as if they were
  calling the API directly. Nothing about being a browser page grants different access.

## A real bug this caught, worth knowing about

Toggling the login/app screens uses the HTML `hidden` attribute (`el.hidden = true/false`), which
browsers implement via a default `[hidden] { display: none }` user-agent stylesheet rule — but
`#login-screen`/`#app-screen` also each declare their own `display: flex` in `style.css`. An
**author** stylesheet's normal-priority rule always beats a **user-agent** stylesheet's
normal-priority rule in the CSS cascade, *regardless of selector specificity* — so those
`display: flex` declarations silently defeated `hidden` entirely; both screens rendered stacked in
the document at all times; the login screen (first in the HTML) was just the only one in the
initial viewport, so it looked like everything worked until you scrolled. Fixed with an explicit
`[hidden] { display: none !important; }` rule. This was caught by actually driving the page in a
real (headless) browser during development, not by reading the code — worth remembering next time
something here "looks right" in the markup.

## What was intentionally NOT built here

- **Marker clustering.** Fine for the household counts a single campaign ward/tole has today;
  would matter once plotting thousands of pins at once became the normal case.
- **Drawing/editing a Tole's boundary polygon on the map.** The API already supports storing and
  querying a boundary (Module 03), but this page only ever deals with household points, not
  polygons — drawing tools are a distinct, larger UI feature.
- **Offline support / service worker.** This assumes a live connection to both the API and the
  Esri tile service.
- **Refresh-token rotation, i.e., staying logged in past the access token's lifetime.** Covered
  above.
- **Any other resource type on the map.** Voters, canvassing tasks, etc. aren't shown here —
  scoped deliberately to "pin a household and fill its data," what was actually asked for.
