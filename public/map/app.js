// Household Map — a plain client of the existing JSON API (no build step, no
// framework). Auth is the same Bearer-token flow every other API consumer
// uses; this page just happens to run in a browser instead of curl/Postman.
// See docs/modules/08-household-map-ui.md for what this does and doesn't do.

const API_BASE = '/api/v1';
const SESSION_KEY = 'electionPlatformMapSession';

// Leaflet's default marker icon images ship in the same dist folder we're
// already serving self-hosted — point it there instead of Leaflet's default
// CDN-relative guess.
L.Icon.Default.imagePath = '/map/vendor/leaflet/images/';

const state = {
  accessToken: null,
  user: null,
  map: null,
  markersByHouseholdId: new Map(),
  wards: [],
  tolesByWardId: new Map(),
  addMode: false,
  tempMarker: null, // marker being placed/edited in the panel, before/while saving
  editingHouseholdId: null, // null when creating a new household
  familyHouseholdId: null, // household the family modal is currently open for
  familyHousehold: null, // full household object (needed for its wardId, to scope link-search)
  familyResidents: [], // voters currently linked to familyHouseholdId (householdId match)
};

const els = {
  loginScreen: document.getElementById('login-screen'),
  loginForm: document.getElementById('login-form'),
  loginEmail: document.getElementById('login-email'),
  loginPassword: document.getElementById('login-password'),
  loginError: document.getElementById('login-error'),
  appScreen: document.getElementById('app-screen'),
  wardFilter: document.getElementById('ward-filter'),
  addModeBtn: document.getElementById('add-mode-btn'),
  addModeBanner: document.getElementById('add-mode-banner'),
  whoami: document.getElementById('whoami'),
  logoutBtn: document.getElementById('logout-btn'),
  panel: document.getElementById('household-panel'),
  panelTitle: document.getElementById('panel-title'),
  panelClose: document.getElementById('panel-close'),
  form: document.getElementById('household-form'),
  fieldAddress: document.getElementById('field-address'),
  fieldLandmark: document.getElementById('field-landmark'),
  fieldWard: document.getElementById('field-ward'),
  fieldTole: document.getElementById('field-tole'),
  fieldCoords: document.getElementById('field-coords'),
  formError: document.getElementById('form-error'),
  saveBtn: document.getElementById('save-btn'),
  deleteBtn: document.getElementById('delete-btn'),
  manageFamilyBtn: document.getElementById('manage-family-btn'),
  familyModalBackdrop: document.getElementById('family-modal-backdrop'),
  familyModalAddress: document.getElementById('family-modal-address'),
  familyModalClose: document.getElementById('family-modal-close'),
  familyOwnerSelect: document.getElementById('family-owner-select'),
  familyMemberCount: document.getElementById('family-member-count'),
  familyResidentsList: document.getElementById('family-residents-list'),
  familyLinkSearchInput: document.getElementById('family-link-search-input'),
  familyLinkSearchResults: document.getElementById('family-link-search-results'),
  relationshipFrom: document.getElementById('relationship-from'),
  relationshipType: document.getElementById('relationship-type'),
  relationshipTo: document.getElementById('relationship-to'),
  relationshipAddBtn: document.getElementById('relationship-add-btn'),
  relationshipError: document.getElementById('relationship-error'),
  familyTreeContainer: document.getElementById('family-tree-container'),
};

// --- Session -----------------------------------------------------------

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(accessToken, user) {
  state.accessToken = accessToken;
  state.user = user;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ accessToken, user }));
  } catch {
    // sessionStorage unavailable (private mode, etc) — session just won't
    // survive a reload; not fatal for using the page right now.
  }
}

function clearSession() {
  state.accessToken = null;
  state.user = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

// --- API -----------------------------------------------------------

// Access tokens are short-lived (15min default) and this page does not
// implement refresh-token rotation — on a 401 it just sends the user back to
// the login screen. Fine for an internal tool used in short sessions; a
// silent-refresh interceptor is the natural upgrade if that becomes annoying.
async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${state.accessToken}`,
      ...options.headers,
    },
  });

  if (res.status === 401) {
    clearSession();
    showLogin('Your session expired — please sign in again.');
    throw new Error('Session expired');
  }

  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.success === false) {
    const message = body?.error?.message || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

async function fetchAllPages(path, params = {}) {
  const items = [];
  let page = 1;
  const pageSize = 200;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const qs = new URLSearchParams({ ...params, page: String(page), pageSize: String(pageSize) });
    const body = await api(`${path}?${qs.toString()}`);
    items.push(...body.data);
    if (!body.pagination || page >= body.pagination.totalPages) break;
    page += 1;
  }
  return items;
}

// --- Login -----------------------------------------------------------

function showLogin(message) {
  els.appScreen.hidden = true;
  els.loginScreen.hidden = false;
  if (message) {
    els.loginError.textContent = message;
    els.loginError.hidden = false;
  } else {
    els.loginError.hidden = true;
  }
}

function showApp() {
  els.loginScreen.hidden = true;
  els.appScreen.hidden = false;
  els.whoami.textContent = `${state.user.name} (${state.user.role})`;
}

els.loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.loginError.hidden = true;
  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: els.loginEmail.value, password: els.loginPassword.value }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.success) {
      throw new Error(body?.error?.message || 'Login failed');
    }
    saveSession(body.data.accessToken, body.data.user);
    await initApp();
  } catch (err) {
    els.loginError.textContent = err.message;
    els.loginError.hidden = false;
  }
});

els.logoutBtn.addEventListener('click', () => {
  clearSession();
  showLogin();
});

// --- Map setup -----------------------------------------------------------

function initMap() {
  // Default view: Kathmandu — overridden by fitBounds() once any households
  // with coordinates are loaded.
  state.map = L.map('map').setView([27.7172, 85.324], 13);

  // Tiles come from Esri's free ArcGIS Online basemap services, not
  // tile.openstreetmap.org directly — OSM's own volunteer-run tile servers
  // explicitly disallow this kind of app/embedded traffic
  // (osm.wiki/Tile_usage_policy) and will 403-block an IP that trips it,
  // which repeated automated testing against this page did during
  // development. Two other free options were tried and ruled out: CARTO's
  // anonymous basemap tiles now require an API key (watermarked tiles
  // otherwise), and Wikimedia's public OSM tile service 403s without one
  // too. Esri's servers are free, need no key, and are explicitly meant for
  // this kind of anonymous embedded use — note the tile URL's segment order
  // is z/y/x, not the usual z/x/y.
  //
  // Two base layers, switchable via the layer control below: Satellite
  // (World_Imagery — actual rooftops/buildings visible, useful for placing a
  // pin accurately on a real house) and Streets (World_Street_Map — road
  // names and labels, useful for general orientation). Satellite is the
  // default per what this page is actually for.
  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics', maxZoom: 19 },
  );
  const streetLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri', maxZoom: 19 },
  );

  satelliteLayer.addTo(state.map);
  L.control.layers({ Satellite: satelliteLayer, Streets: streetLayer }).addTo(state.map);

  state.map.on('click', (e) => {
    if (!state.addMode) return;
    exitAddMode();
    openPanelForNewHousehold(e.latlng);
  });
}

function exitAddMode() {
  state.addMode = false;
  els.addModeBanner.hidden = true;
  els.addModeBtn.textContent = '+ Add household';
  document.getElementById('map').style.cursor = '';
}

els.addModeBtn.addEventListener('click', () => {
  if (state.addMode) {
    exitAddMode();
    return;
  }
  state.addMode = true;
  els.addModeBanner.hidden = false;
  els.addModeBtn.textContent = 'Cancel adding';
  document.getElementById('map').style.cursor = 'crosshair';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.addMode) exitAddMode();
});

// --- Wards / toles -----------------------------------------------------------

async function loadWards() {
  state.wards = await fetchAllPages('/wards');

  const filterOptions = ['<option value="">All wards</option>'];
  const formOptions = [];
  for (const ward of state.wards) {
    const label = ward.name ? `Ward ${ward.wardNumber} — ${ward.name}` : `Ward ${ward.wardNumber}`;
    filterOptions.push(`<option value="${ward.id}">${escapeHtml(label)}</option>`);
    formOptions.push(`<option value="${ward.id}">${escapeHtml(label)}</option>`);
  }
  els.wardFilter.innerHTML = filterOptions.join('');
  els.fieldWard.innerHTML = formOptions.join('');
}

async function loadTolesForWard(wardId) {
  if (!wardId) return [];
  if (state.tolesByWardId.has(wardId)) return state.tolesByWardId.get(wardId);
  const toles = await fetchAllPages('/toles', { wardId });
  state.tolesByWardId.set(wardId, toles);
  return toles;
}

async function populateToleSelect(wardId, selectedToleId) {
  const toles = await loadTolesForWard(wardId);
  const options = ['<option value="">— none —</option>'];
  for (const tole of toles) {
    options.push(
      `<option value="${tole.id}" ${tole.id === selectedToleId ? 'selected' : ''}>${escapeHtml(tole.name)}</option>`,
    );
  }
  els.fieldTole.innerHTML = options.join('');
}

els.fieldWard.addEventListener('change', () => {
  populateToleSelect(els.fieldWard.value, null);
});

// --- Households / markers -----------------------------------------------------------

function householdPopupLabel(household) {
  return escapeHtml(household.address);
}

function plotHousehold(household) {
  if (household.centerLat == null || household.centerLng == null) return; // can't plot without coords

  const existing = state.markersByHouseholdId.get(household.id);
  if (existing) state.map.removeLayer(existing);

  const marker = L.marker([household.centerLat, household.centerLng], { draggable: true }).addTo(state.map);
  marker.bindTooltip(householdPopupLabel(household));
  marker.on('click', () => openPanelForExistingHousehold(household, marker));
  marker.on('dragend', () => {
    const { lat, lng } = marker.getLatLng();
    if (state.editingHouseholdId === household.id) updateCoordsDisplay(lat, lng);
  });

  state.markersByHouseholdId.set(household.id, marker);
}

async function loadHouseholds() {
  for (const marker of state.markersByHouseholdId.values()) state.map.removeLayer(marker);
  state.markersByHouseholdId.clear();

  const wardId = els.wardFilter.value || undefined;
  const households = await fetchAllPages('/households', wardId ? { wardId } : {});

  for (const household of households) plotHousehold(household);

  const withCoords = households.filter((h) => h.centerLat != null && h.centerLng != null);
  if (withCoords.length > 0) {
    const bounds = L.latLngBounds(withCoords.map((h) => [h.centerLat, h.centerLng]));
    state.map.fitBounds(bounds.pad(0.2));
  }
}

els.wardFilter.addEventListener('change', () => {
  loadHouseholds();
});

// --- Household panel -----------------------------------------------------------

function updateCoordsDisplay(lat, lng) {
  els.fieldCoords.textContent = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

function closePanel() {
  els.panel.hidden = true;
  if (state.tempMarker && state.editingHouseholdId === null) {
    state.map.removeLayer(state.tempMarker);
  }
  state.tempMarker = null;
  state.editingHouseholdId = null;
  els.formError.hidden = true;
}

els.panelClose.addEventListener('click', closePanel);

async function openPanelForNewHousehold(latlng) {
  state.editingHouseholdId = null;
  state.tempMarker = L.marker(latlng, { draggable: true }).addTo(state.map);
  state.tempMarker.on('dragend', () => {
    const p = state.tempMarker.getLatLng();
    updateCoordsDisplay(p.lat, p.lng);
  });

  els.panelTitle.textContent = 'New household';
  els.deleteBtn.hidden = true;
  els.manageFamilyBtn.hidden = true; // only meaningful once the household exists
  els.fieldWard.disabled = false;
  els.form.reset();
  updateCoordsDisplay(latlng.lat, latlng.lng);

  const defaultWardId = els.wardFilter.value || state.wards[0]?.id || '';
  els.fieldWard.value = defaultWardId;
  await populateToleSelect(defaultWardId, null);

  els.panel.hidden = false;
  els.fieldAddress.focus();
}

async function openPanelForExistingHousehold(household, marker) {
  state.editingHouseholdId = household.id;
  state.tempMarker = marker;

  els.panelTitle.textContent = 'Edit household';
  els.deleteBtn.hidden = false;
  els.manageFamilyBtn.hidden = false;
  els.fieldWard.disabled = true; // moving a household to a different ward isn't supported by the API
  els.form.reset();
  els.fieldAddress.value = household.address;
  els.fieldLandmark.value = household.landmark || '';
  els.fieldWard.value = household.wardId;
  updateCoordsDisplay(household.centerLat, household.centerLng);

  await populateToleSelect(household.wardId, household.toleId);

  els.panel.hidden = false;
  els.fieldAddress.focus();
}

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  els.formError.hidden = true;
  els.saveBtn.disabled = true;

  try {
    const latlng = state.tempMarker.getLatLng();
    const address = els.fieldAddress.value.trim();
    const landmark = els.fieldLandmark.value.trim();
    const toleId = els.fieldTole.value;
    const isEditing = Boolean(state.editingHouseholdId);

    // households.validation.ts: createHouseholdSchema takes toleId/landmark
    // as .optional() (undefined only — a literal null 400s), while
    // updateHouseholdSchema takes them as .nullable().optional() (null
    // explicitly clears the field). Same UI, two different wire shapes.
    const payload = {
      address,
      centerLat: latlng.lat,
      centerLng: latlng.lng,
      ...(isEditing
        ? { landmark: landmark || null, toleId: toleId || null }
        : { ...(landmark ? { landmark } : {}), ...(toleId ? { toleId } : {}) }),
    };

    let saved;
    if (isEditing) {
      const body = await api(`/households/${state.editingHouseholdId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      saved = body.data;
    } else {
      const body = await api('/households', {
        method: 'POST',
        body: JSON.stringify({ ...payload, wardId: els.fieldWard.value }),
      });
      saved = body.data;
      state.map.removeLayer(state.tempMarker); // replaced by plotHousehold()'s own marker below
      state.tempMarker = null;
    }

    plotHousehold(saved);
    closePanel();
  } catch (err) {
    els.formError.textContent = err.message;
    els.formError.hidden = false;
  } finally {
    els.saveBtn.disabled = false;
  }
});

els.deleteBtn.addEventListener('click', async () => {
  if (!state.editingHouseholdId) return;
  if (!confirm('Delete this household? This cannot be undone from the map.')) return;

  try {
    await api(`/households/${state.editingHouseholdId}`, { method: 'DELETE' });
    const marker = state.markersByHouseholdId.get(state.editingHouseholdId);
    if (marker) {
      state.map.removeLayer(marker);
      state.markersByHouseholdId.delete(state.editingHouseholdId);
    }
    closePanel();
  } catch (err) {
    els.formError.textContent = err.message;
    els.formError.hidden = false;
  }
});

// --- Family modal (docs/modules/09-household-family-tree.md) -------------
//
// Everyone shown here is an existing Voter, found via search and linked —
// there is no "type a name and it just works" path. A resident is any Voter
// whose householdId already equals this household; the house owner must be
// one of those residents (the API enforces this, not just this UI).

function formatAge(dateOfBirthIso) {
  const dob = new Date(dateOfBirthIso);
  const ageMs = Date.now() - dob.getTime();
  const age = Math.floor(ageMs / (365.25 * 24 * 60 * 60 * 1000));
  return `${age}y`;
}

els.manageFamilyBtn.addEventListener('click', () => {
  if (!state.editingHouseholdId) return;
  openFamilyModal(state.editingHouseholdId, els.fieldAddress.value);
});

els.familyModalClose.addEventListener('click', closeFamilyModal);
els.familyModalBackdrop.addEventListener('click', (e) => {
  if (e.target === els.familyModalBackdrop) closeFamilyModal();
});

function closeFamilyModal() {
  els.familyModalBackdrop.hidden = true;
  state.familyHouseholdId = null;
  state.familyHousehold = null;
  state.familyResidents = [];
  els.familyLinkSearchInput.value = '';
  els.familyLinkSearchResults.innerHTML = '';
  els.relationshipError.hidden = true;
}

async function openFamilyModal(householdId, address) {
  state.familyHouseholdId = householdId;
  els.familyModalAddress.textContent = address;
  els.familyModalBackdrop.hidden = false;
  await refreshFamilyModal();
}

async function refreshFamilyModal() {
  const householdId = state.familyHouseholdId;
  if (!householdId) return;

  const [residents, household, tree] = await Promise.all([
    fetchAllPages('/voters', { householdId }),
    api(`/households/${householdId}`).then((b) => b.data),
    api(`/households/${householdId}/family-tree`).then((b) => b.data),
  ]);
  state.familyResidents = residents;
  // Search-to-link is scoped to this ward below — voters.service.ts rejects
  // linking a voter to a household outside their own ward, so showing
  // out-of-ward search results would just be a guaranteed dead-end click.
  state.familyHousehold = household;

  renderResidentsList(residents);
  renderOwnerSelect(residents, household.headOfHouseholdId);
  renderRelationshipSelects(residents);
  renderFamilyTree(tree);
}

function renderResidentsList(residents) {
  if (residents.length === 0) {
    els.familyResidentsList.innerHTML = '<li>No voters linked to this household yet.</li>';
    return;
  }
  els.familyResidentsList.innerHTML = residents
    .map(
      (v) =>
        `<li><span>${escapeHtml(v.fullName)}</span><span class="voter-meta">${formatAge(v.dateOfBirth)}${v.gender ? ' · ' + v.gender : ''}</span></li>`,
    )
    .join('');
}

function renderOwnerSelect(residents, currentHeadId) {
  const options = ['<option value="">— none —</option>'];
  for (const v of residents) {
    options.push(`<option value="${v.id}" ${v.id === currentHeadId ? 'selected' : ''}>${escapeHtml(v.fullName)}</option>`);
  }
  els.familyOwnerSelect.innerHTML = options.join('');
}

function renderRelationshipSelects(residents) {
  const options = residents.map((v) => `<option value="${v.id}">${escapeHtml(v.fullName)}</option>`).join('');
  els.relationshipFrom.innerHTML = options;
  els.relationshipTo.innerHTML = options;
}

els.familyOwnerSelect.addEventListener('change', async () => {
  if (!state.familyHouseholdId) return;
  try {
    const updated = await api(`/households/${state.familyHouseholdId}`, {
      method: 'PATCH',
      body: JSON.stringify({ headOfHouseholdId: els.familyOwnerSelect.value || null }),
    });
    const tree = await api(`/households/${state.familyHouseholdId}/family-tree`).then((b) => b.data);
    renderFamilyTree(tree);
    if (state.editingHouseholdId === state.familyHouseholdId) plotHousehold(updated.data);
  } catch (err) {
    alert(err.message);
  }
});

let searchDebounceTimer = null;
els.familyLinkSearchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  const term = els.familyLinkSearchInput.value.trim();
  if (term.length < 2) {
    els.familyLinkSearchResults.innerHTML = '';
    return;
  }
  searchDebounceTimer = setTimeout(() => runFamilyLinkSearch(term), 300);
});

async function runFamilyLinkSearch(term) {
  // Scoped to the household's own ward — a voter can only ever be linked to
  // a household in their own ward (voters.service.ts), so an unscoped search
  // would surface results that are guaranteed to fail if clicked.
  const body = await api(
    `/voters?${new URLSearchParams({ search: term, wardId: state.familyHousehold.wardId, pageSize: '10' })}`,
  );
  const alreadyLinked = new Set(state.familyResidents.map((v) => v.id));
  const results = body.data.filter((v) => !alreadyLinked.has(v.id));

  if (results.length === 0) {
    els.familyLinkSearchResults.innerHTML = '<li>No matching voters found in this ward.</li>';
    return;
  }
  els.familyLinkSearchResults.innerHTML = results
    .map(
      (v) =>
        `<li data-voter-id="${v.id}"><span>${escapeHtml(v.fullName)} <span class="voter-meta">${formatAge(v.dateOfBirth)}</span></span><button type="button" class="btn-link-small">Link</button></li>`,
    )
    .join('');
}

els.familyLinkSearchResults.addEventListener('click', async (e) => {
  const li = e.target.closest('li[data-voter-id]');
  if (!li) return;
  try {
    await api(`/voters/${li.dataset.voterId}`, {
      method: 'PATCH',
      body: JSON.stringify({ householdId: state.familyHouseholdId }),
    });
    els.familyLinkSearchInput.value = '';
    els.familyLinkSearchResults.innerHTML = '';
    await refreshFamilyModal();
  } catch (err) {
    alert(err.message);
  }
});

els.relationshipAddBtn.addEventListener('click', async () => {
  els.relationshipError.hidden = true;
  const fromId = els.relationshipFrom.value;
  const toId = els.relationshipTo.value;
  const type = els.relationshipType.value;

  if (!fromId || !toId) return;

  try {
    await api(`/voters/${fromId}/relationships`, {
      method: 'POST',
      body: JSON.stringify({ relatedVoterId: toId, type }),
    });
    const tree = await api(`/households/${state.familyHouseholdId}/family-tree`).then((b) => b.data);
    renderFamilyTree(tree);
  } catch (err) {
    els.relationshipError.textContent = err.message;
    els.relationshipError.hidden = false;
  }
});

// Renders the classic pure-CSS org-chart pattern (nested <ul>/<li>, connector
// lines via ::before/::after borders — see .tree rules in style.css) from the
// tree shape GET /households/{id}/family-tree returns.
function renderTreeNode(voter, isHead) {
  return `<div class="node${isHead ? ' node-head' : ''}">
    <div class="node-name">${escapeHtml(voter.fullName)}</div>
    <div class="node-age">${formatAge(voter.dateOfBirth)}${voter.gender ? ' · ' + voter.gender : ''}</div>
  </div>`;
}

function renderDescendants(nodes) {
  if (!nodes || nodes.length === 0) return '';
  return `<ul>${nodes
    .map((n) => `<li>${renderTreeNode(n.voter, false)}${renderDescendants(n.children)}</li>`)
    .join('')}</ul>`;
}

function renderFamilyTree(tree) {
  els.familyMemberCount.textContent = `Family members: ${tree.totalFamilyMembers}`;

  if (!tree.headOfHousehold) {
    els.familyTreeContainer.innerHTML =
      '<p class="hint">Set a house owner above to start building the family tree.</p>';
    return;
  }

  // Built from already-escaped parts (escapeHtml on the final joined string
  // would double-escape the "&" separator).
  const headLabel = tree.spouse
    ? `${escapeHtml(tree.headOfHousehold.fullName)} &amp; ${escapeHtml(tree.spouse.fullName)}`
    : escapeHtml(tree.headOfHousehold.fullName);
  const headNode = `<div class="node node-head">
    <div class="node-name">${headLabel}</div>
    <div class="node-age">${formatAge(tree.headOfHousehold.dateOfBirth)}</div>
  </div>`;

  els.familyTreeContainer.innerHTML = `<ul class="tree"><li>${headNode}${renderDescendants(tree.children)}</li></ul>`;
}

// --- Utilities / bootstrap -----------------------------------------------------------

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

async function initApp() {
  showApp();
  if (!state.map) initMap();
  await loadWards();
  await loadHouseholds();
}

(async function bootstrap() {
  const session = loadSession();
  if (!session) {
    showLogin();
    return;
  }
  state.accessToken = session.accessToken;
  state.user = session.user;
  try {
    // Validate the stored token still works before committing to the app
    // screen, and refresh the cached user in case it changed server-side.
    const body = await api('/auth/me');
    state.user = body.data;
    await initApp();
  } catch {
    // api() already cleared the session and showed the login screen on 401
  }
})();
