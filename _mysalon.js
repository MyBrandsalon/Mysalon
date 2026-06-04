// ════════════════════════════════════════════════════════════════
//  MYSALON — MULTI-TENANT SUPABASE DATA LAYER  (_mysalon.js)
//  Drop-in replacement for Budget Barber's _supabase.js
//  All data is scoped by tenant_id for full multi-tenancy.
//  Replace the two placeholders below before deploying.
// ════════════════════════════════════════════════════════════════

var MS_URL = 'https://sgliztuggyksdemzkaxr.supabase.co';
var MS_KEY = 'YOUR_MYSALON_ANON_KEY'; // eyJ... key from Supabase → Settings → API

// ── Low-level helpers ─────────────────────────────────────────
function _msHeaders() {
  return {
    'Content-Type':  'application/json',
    'apikey':        MS_KEY,
    'Authorization': 'Bearer ' + MS_KEY,
    'Prefer':        'return=representation'
  };
}
function _msFetch(path, opts) {
  return fetch(MS_URL + '/rest/v1/' + path, Object.assign({ headers: _msHeaders() }, opts))
    .then(function(r) {
      if (!r.ok) return r.text().then(function(t) { throw new Error(t); });
      var ct = r.headers.get('content-type') || '';
      return ct.indexOf('application/json') !== -1 ? r.json() : [];
    });
}

// ── CRUD wrappers ─────────────────────────────────────────────
function msSelect(table, qs) {
  return _msFetch(table + (qs ? '?' + qs : ''), { method: 'GET' });
}
function msInsert(table, row) {
  return _msFetch(table, { method: 'POST', body: JSON.stringify(row) })
    .then(function(r) { return Array.isArray(r) ? r[0] : r; });
}
function msUpsert(table, row, conflict) {
  return _msFetch(table + '?on_conflict=' + (conflict || 'id'), {
    method: 'POST',
    headers: Object.assign(_msHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(row)
  }).then(function(r) { return Array.isArray(r) ? r[0] : r; });
}
function msUpdate(table, id, patch) {
  return _msFetch(table + '?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH', body: JSON.stringify(patch)
  }).then(function(r) { return Array.isArray(r) ? r[0] : r; });
}
function msDelete(table, id) {
  return _msFetch(table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
}

// ── Tenant resolution ─────────────────────────────────────────
// Called once on every page. Reads ?salon=SLUG, fetches tenant, applies branding.
var MS_TENANT = null;

function msInit(slug, onDone, onError) {
  if (!slug) { if (onError) onError('No salon ID'); return; }
  msSelect('tenants', 'slug=eq.' + encodeURIComponent(slug) + '&is_active=eq.true&select=*')
    .then(function(rows) {
      if (!rows || !rows.length) { if (onError) onError('Salon not found'); return; }
      MS_TENANT = rows[0];
      _msApplyBranding(MS_TENANT);
      if (onDone) onDone(MS_TENANT);
    })
    .catch(function(e) { if (onError) onError(e && e.message ? e.message : String(e)); });
}

function _msApplyBranding(t) {
  // Swap logo
  document.querySelectorAll('.ms-logo').forEach(function(el) {
    if (t.logo_url) { el.src = t.logo_url; el.style.display = 'block'; }
  });
  // Swap salon name in all labelled elements
  document.querySelectorAll('.ms-salon-name').forEach(function(el) { el.textContent = t.name; });
  document.title = t.name + ' — MySalon';
  // Store
  sessionStorage.setItem('ms_slug',      t.slug);
  sessionStorage.setItem('ms_tenant_id', t.id);
  sessionStorage.setItem('ms_plan',      t.plan || 'free');
  sessionStorage.setItem('ms_name',      t.name);
  sessionStorage.setItem('ms_logo',      t.logo_url || '');
}

// ── Plan gate ────────────────────────────────────────────────
var _PLAN_RANK = { free: 0, pro: 1, business: 2 };
function msRequirePlan(min) {
  var cur = sessionStorage.getItem('ms_plan') || 'free';
  if ((_PLAN_RANK[cur] || 0) < (_PLAN_RANK[min] || 0)) {
    var slug = sessionStorage.getItem('ms_slug') || '';
    window.location.href = 'upgrade.html' + (slug ? '?salon=' + encodeURIComponent(slug) + '&feature=' + encodeURIComponent(min + ' feature') : '');
    return false;
  }
  return true;
}

// ── Session helpers ──────────────────────────────────────────
function msSession() {
  return {
    tenantId:   sessionStorage.getItem('ms_tenant_id'),
    slug:       sessionStorage.getItem('ms_slug'),
    role:       sessionStorage.getItem('ms_role'),
    phone:      sessionStorage.getItem('ms_phone'),
    name:       sessionStorage.getItem('ms_user_name'),
    staffId:    sessionStorage.getItem('ms_staff_id'),
    salonId:    sessionStorage.getItem('ms_salon_id'),
    plan:       sessionStorage.getItem('ms_plan'),
    logoUrl:    sessionStorage.getItem('ms_logo'),
    salonName:  sessionStorage.getItem('ms_name')
  };
}

function msLogout(loginPage) {
  var slug = sessionStorage.getItem('ms_slug') || '';
  sessionStorage.clear();
  var page = loginPage || 'index.html';
  window.location.href = page + (slug ? '?salon=' + encodeURIComponent(slug) : '');
}

// ── localStorage wrapper (same pattern as BB's LS) ───────────
var LS = {
  get: function(k) { try { return JSON.parse(localStorage.getItem('ms_' + k)); } catch(e) { return null; } },
  set: function(k, v) { try { localStorage.setItem('ms_' + k, JSON.stringify(v)); return true; } catch(e) { return false; } },
  del: function(k) { try { localStorage.removeItem('ms_' + k); } catch(e) {} }
};

// ── Bootstrap: load all tenant data → localStorage ──────────
// Identical merge logic to BB's supaBootstrap.
function msBootstrap(tenantId, onDone, onError) {
  var localEntries = LS.get('entries') || [];
  var localAdv     = LS.get('advances') || [];

  Promise.all([
    msSelect('staff',        'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('salons',       'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('customers',    'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('entries',      'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('cash_in',      'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('expenses',     'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('attendance',   'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('style_cards',  'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('visits',       'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('advances',     'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('mgr_cash_in',  'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('mgr_expenses', 'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('deductions',   'tenant_id=eq.' + encodeURIComponent(tenantId)),
    msSelect('att_overrides','tenant_id=eq.' + encodeURIComponent(tenantId))
  ]).then(function(res) {
    var data = {
      staff:        res[0]  || [],
      salons:       res[1]  || [],
      customers:    res[2]  || [],
      entries:      res[3]  || [],
      cashIn:       res[4]  || [],
      expenses:     res[5]  || [],
      attendance:   res[6]  || [],
      styleCards:   res[7]  || [],
      visits:       res[8]  || [],
      advances:     res[9]  || [],
      mgrCashIn:    res[10] || [],
      mgrExpenses:  res[11] || [],
      deductions:   res[12] || [],
      attOverrides: res[13] || []
    };
    _msApplyData(data, localEntries, localAdv);
    if (onDone) onDone(data);
  }).catch(function(err) {
    console.warn('[MS] Bootstrap failed, using cache:', err);
    if (onError) onError(err);
  });
}

function _msApplyData(d, localEntries, localAdv) {
  function toStr(r, keys) {
    keys.forEach(function(k) { if (r[k] !== undefined && r[k] !== null) r[k] = String(r[k]); });
    return r;
  }
  // Staff, salons, customers, etc. — write directly
  if (d.staff && d.staff.length)
    LS.set('staff', d.staff.map(function(r) { return toStr(r, ['id','phone','salonId','salon_id','loginPin','login_pin','tenantId','tenant_id']); }));
  if (d.salons && d.salons.length)
    LS.set('salons', d.salons.map(function(r) { return toStr(r, ['id','mgrPhone','mgr_phone','tenantId','tenant_id']); }));
  if (d.customers && d.customers.length)
    LS.set('customers', d.customers.map(function(r) { return toStr(r, ['id','phone','loginPin','login_pin','tenantId','tenant_id']); }));
  if (d.cashIn && d.cashIn.length)
    LS.set('cashIn', d.cashIn.map(function(r) { return toStr(r, ['barberId','barber_id','tenantId','tenant_id']); }));
  if (d.expenses && d.expenses.length)
    LS.set('expenses', d.expenses.map(function(r) { return toStr(r, ['barberId','barber_id','tenantId','tenant_id']); }));
  if (d.attendance && d.attendance.length)
    LS.set('attendance', d.attendance.map(function(r) { return toStr(r, ['barberId','barber_id','tenantId','tenant_id']); }));
  if (d.styleCards && d.styleCards.length)
    LS.set('styleCards', d.styleCards.map(function(r) { return toStr(r, ['id','customerId','customer_id','barberId','barber_id','salonId','salon_id','tenantId','tenant_id']); }));
  if (d.visits && d.visits.length)
    LS.set('visits', d.visits.map(function(r) { return toStr(r, ['id','customerId','customer_id','barberId','barber_id','salonId','salon_id','tenantId','tenant_id']); }));
  if (d.mgrCashIn && d.mgrCashIn.length)
    LS.set('mgrCashIn', d.mgrCashIn.map(function(r) { return toStr(r, ['managerId','manager_id','salonId','salon_id','tenantId','tenant_id']); }));
  if (d.mgrExpenses && d.mgrExpenses.length)
    LS.set('mgrExpenses', d.mgrExpenses.map(function(r) { return toStr(r, ['managerId','manager_id','salonId','salon_id','tenantId','tenant_id']); }));

  // Deductions — store flat + keyed
  if (d.deductions && d.deductions.length) {
    LS.set('deductions', d.deductions.map(function(r) {
      return { staffId: String(r.staff_id||r.staffId||''), month: r.month||'', desc: r.desc||'', amount: Number(r.amount||0) };
    }));
    var dg = {};
    d.deductions.forEach(function(r) {
      var sid = String(r.staff_id || r.staffId || '');
      var k = 'ded_' + sid + '_' + r.month;
      if (!dg[k]) dg[k] = [];
      dg[k].push({ desc: r.desc || '', amount: Number(r.amount || 0) });
    });
    Object.keys(dg).forEach(function(k) { LS.set(k, dg[k]); });
  }

  // Att overrides
  if (d.attOverrides && d.attOverrides.length) {
    d.attOverrides.forEach(function(r) {
      LS.set('att_' + (r.staff_id||r.staffId) + '_' + r.month, { present: r.present, half: r.half, absent: r.absent });
    });
  }

  // Entries — same merge logic as BB
  var rawRemote = (d.entries || []).map(function(r) {
    ['id','barberId','barber_id','salonId','salon_id','customerPhone','customer_phone','tenantId','tenant_id'].forEach(function(k) {
      if (r[k] !== undefined && r[k] !== null) r[k] = String(r[k]);
    });
    return r;
  });
  var mergedEntries;
  if (!localEntries || localEntries.length === 0) {
    mergedEntries = rawRemote;
  } else {
    var localIdSet = {}, remoteIdSet = {};
    (localEntries || []).forEach(function(r) { if (r.id) localIdSet[String(r.id)] = true; });
    rawRemote.forEach(function(r) { if (r.id) remoteIdSet[String(r.id)] = true; });
    mergedEntries = rawRemote.filter(function(r) { return !r.id || localIdSet[String(r.id)]; });
    (localEntries || []).forEach(function(r) { if (r.id && !remoteIdSet[String(r.id)]) mergedEntries.push(r); });
  }
  LS.set('entries', mergedEntries);

  // Advances merge
  var remoteAdv = (d.advances || []).map(function(r) {
    return toStr(r, ['barberId','barber_id','tenantId','tenant_id']);
  });
  var remoteTsSet = {};
  remoteAdv.forEach(function(r) { if (r.ts) remoteTsSet[String(r.ts)] = true; });
  var mergedAdv = remoteAdv.slice();
  (localAdv || []).forEach(function(r) { if (r.ts && !remoteTsSet[String(r.ts)]) mergedAdv.push(r); });
  LS.set('advances', mergedAdv);
}

// ── Upsert customer by phone (multi-tenant) ──────────────────
function msEnsureCustomer(tenantId, phone, name, salonId, extra) {
  if (!phone || String(phone).replace(/\D/g,'').length < 10) return Promise.resolve(null);
  function _norm(p) { var s = String(p||'').replace(/\D/g,''); return s.length > 10 ? s.slice(-10) : s; }
  var np = _norm(phone);
  var row = Object.assign({
    tenant_id: tenantId,
    phone: np,
    name: (name && name !== 'Walk-in') ? name : 'Customer ' + np.slice(-4),
    salon_id: salonId || null,
    role: 'customer'
  }, extra || {});

  return _msFetch('customers?on_conflict=tenant_id,phone', {
    method: 'POST',
    headers: Object.assign(_msHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=representation' }),
    body: JSON.stringify(row)
  }).then(function(r) { return Array.isArray(r) ? r[0] : r; })
    .then(function(saved) {
      if (!saved || saved.error) return null;
      // Sync local cache
      var custs = LS.get('customers') || [];
      var idx = -1;
      if (saved.id) custs.forEach(function(c, i) { if (String(c.id) === String(saved.id)) idx = i; });
      if (idx < 0) custs.forEach(function(c, i) { if (_norm(c.phone) === _norm(saved.phone)) idx = i; });
      if (idx >= 0) custs[idx] = Object.assign({}, custs[idx], saved);
      else custs.push(saved);
      LS.set('customers', custs);
      return saved;
    }).catch(function(e) { console.warn('[MS] ensureCustomer failed:', e); return null; });
}

// ── Referral/cashback customer lookup ────────────────────────
function _msCustByPhone(phone) {
  function _norm(p) { var s = String(p||'').replace(/\D/g,''); return s.length > 10 ? s.slice(-10) : s; }
  var t = _norm(phone);
  if (!t) return undefined;
  return (LS.get('customers') || []).find(function(c) { return _norm(c.phone) === t; });
}

// ── Cashback helpers (identical logic to BB) ─────────────────
var MS_WALLET_MIN_BILL   = 250;
var MS_AUTO_CB_PCT       = 5;
var MS_AUTO_CB_FLAT_CAP  = 50;
var MS_AUTO_CB_PCT_CAP   = 30;
var MS_WALLET_REDEEM_CAP = 20; // % of bill

function _msAutoCashback(subtotal, phone) {
  if (!phone || String(phone).replace(/\D/g,'').length < 10) return 0;
  if (!subtotal || subtotal <= 0) return 0;
  var raw = subtotal * MS_AUTO_CB_PCT / 100;
  var cap = Math.min(MS_AUTO_CB_FLAT_CAP, subtotal * MS_AUTO_CB_PCT_CAP / 100);
  return Math.round(Math.min(raw, cap));
}
function _msCbActive(c) {
  if (!c) return false;
  if (Number(c.cashback_credit||0) <= 0) return false;
  var exp = c.cashback_credit_expires_at;
  if (!exp) return true;
  return new Date(exp) > new Date();
}
function _msActiveCb(c) { return _msCbActive(c) ? Number(c.cashback_credit||0) : 0; }

// ── Compatibility shims (same signatures as BB) ──────────────
// So all existing business logic in app files just works.

function appendRowToSheet(sheetName, rowObj, onDone) {
  var tbl = _msTable(sheetName);
  if (!tbl) { if (onDone) onDone(false); return; }
  msInsert(tbl, rowObj)
    .then(function() { if (onDone) onDone(true); })
    .catch(function(e) { console.warn('[MS] insert ' + tbl, e); if (onDone) onDone(false); });
}
function updateRowInSheet(sheetName, rowObj, onDone) {
  var tbl = _msTable(sheetName);
  if (!tbl || !rowObj.id) { if (onDone) onDone(false); return; }
  msUpdate(tbl, rowObj.id, rowObj)
    .then(function() { if (onDone) onDone(true); })
    .catch(function(e) { console.warn('[MS] update ' + tbl, e); if (onDone) onDone(false); });
}
function deleteRowFromSheet(sheetName, id, onDone) {
  var tbl = _msTable(sheetName);
  if (!tbl) { if (onDone) onDone(false); return; }
  msDelete(tbl, id)
    .then(function() { if (onDone) onDone(true); })
    .catch(function(e) { console.warn('[MS] delete ' + tbl, e); if (onDone) onDone(false); });
}
function fetchSheetRows(sheetName, filters, onDone) {
  var tbl = _msTable(sheetName);
  if (!tbl) { onDone([]); return; }
  var qs = '';
  if (filters) qs = Object.keys(filters).map(function(k) { return k + '=eq.' + encodeURIComponent(filters[k]); }).join('&');
  msSelect(tbl, qs).then(function(rows) { onDone(rows || []); }).catch(function() { onDone([]); });
}
function _msTable(name) {
  var map = {
    Entries: 'entries', Staff: 'staff', Salons: 'salons',
    Customers: 'customers', CashIn: 'cash_in', Expenses: 'expenses',
    Attendance: 'attendance', StyleCards: 'style_cards', Visits: 'visits',
    Advances: 'advances', MgrCashIn: 'mgr_cash_in', MgrExpenses: 'mgr_expenses',
    Deductions: 'deductions', AttOverrides: 'att_overrides'
  };
  return map[name] || null;
}

// ── Supabase shims (same names as BB for max compat) ─────────
var SUPA_URL = MS_URL;
var SUPA_KEY = MS_KEY;
function _supaHeaders() { return _msHeaders(); }
function _supaFetch(path, opts) { return _msFetch(path, opts); }
function sbSelect(table, qs) { return msSelect(table, qs); }
function sbInsert(table, row) { return msInsert(table, row); }
function sbUpdate(table, id, patch) { return msUpdate(table, id, patch); }
function sbDelete(table, id) { return msDelete(table, id); }
function sbUpsert(table, row) { return msUpsert(table, row); }
function sbUpsertByPhone(row) {
  var tenantId = sessionStorage.getItem('ms_tenant_id') || '';
  return msEnsureCustomer(tenantId, row.phone, row.name, row.salonId || row.salon_id, row);
}
function ensureCustomer(phone, name, salonId, extra) {
  var tenantId = sessionStorage.getItem('ms_tenant_id') || '';
  return msEnsureCustomer(tenantId, phone, name, salonId, extra);
}
function supaBootstrap(onDone, onError) {
  var tenantId = sessionStorage.getItem('ms_tenant_id') || '';
  if (!tenantId) { if (onError) onError('No tenant'); return; }
  msBootstrap(tenantId, onDone, onError);
}

// ── RPC shims ────────────────────────────────────────────────
function _sbRpc(fnName, params) {
  return _msFetch('rpc/' + fnName, { method: 'POST', body: JSON.stringify(params || {}) });
}
function _earnCashback(customerId, amount, entryId, label) {
  return _sbRpc('earn_cashback', { p_customer_id: customerId, p_amount: amount, p_entry_id: entryId||null, p_label: label||null })
    .catch(function() { return _earnCashbackFallback(customerId, amount, entryId, label); });
}
function _earnCashbackFallback(customerId, amount, entryId, label) {
  if (!customerId || amount <= 0) return Promise.resolve(null);
  var expIso = new Date(Date.now() + 90*24*60*60*1000).toISOString();
  return msInsert('cashback_chunks', {
    customer_id: customerId, amount_initial: amount, amount_remaining: amount,
    earned_at: new Date().toISOString(), expires_at: expIso,
    source_entry_id: entryId||null, source_label: label||null
  }).catch(function() { return null; }).then(function() {
    return msSelect('customers', 'id=eq.' + encodeURIComponent(customerId)).then(function(rows) {
      var c = rows && rows[0]; if (!c) return null;
      return msUpdate('customers', c.id, {
        cashback_credit: Number(c.cashback_credit||0) + amount,
        cashback_credit_expires_at: expIso,
        cashback_lifetime_earned: Number(c.cashback_lifetime_earned||0) + amount
      });
    });
  });
}
function _redeemCashback(customerId, amount, entryId) {
  if (amount <= 0) return Promise.resolve(0);
  return _sbRpc('redeem_cashback_fifo', { p_customer_id: customerId, p_amount: amount, p_entry_id: entryId||null })
    .catch(function() {
      return msSelect('customers', 'id=eq.' + encodeURIComponent(customerId)).then(function(rows) {
        var c = rows && rows[0]; if (!c) return 0;
        var avail = Number(c.cashback_credit||0);
        var used  = Math.min(avail, amount);
        if (used <= 0) return 0;
        return msUpdate('customers', c.id, { cashback_credit: avail - used }).then(function() { return used; });
      }).catch(function() { return 0; });
    });
}
function _refreshCustomerCache(customerId) {
  if (!customerId) return Promise.resolve(null);
  return msSelect('customers', 'id=eq.' + encodeURIComponent(customerId)).then(function(rows) {
    var fresh = rows && rows[0]; if (!fresh) return null;
    var custs = LS.get('customers') || [];
    var idx = -1;
    custs.forEach(function(c, i) { if (String(c.id) === String(fresh.id)) idx = i; });
    if (idx >= 0) custs[idx] = Object.assign({}, custs[idx], fresh);
    else custs.push(fresh);
    LS.set('customers', custs);
    return fresh;
  }).catch(function() { return null; });
}

// ── Utility helpers ──────────────────────────────────────────
function msToday()    { return new Date().toLocaleDateString('en-IN'); }
function msTodayISO() { return new Date().toISOString().split('T')[0]; }
function msRupee(n)   { return '₹' + Number(n||0).toLocaleString('en-IN'); }
function msGetSlug()  { return new URLSearchParams(location.search).get('salon') || sessionStorage.getItem('ms_slug') || ''; }

// Referral code generator
function msBuildReferral(phone) {
  var p = String(phone).replace(/\D/g,'');
  if (p.length !== 10) return '';
  var h = 0;
  for (var i = 0; i < p.length; i++) { h = ((h << 5) - h) + p.charCodeAt(i); h = h & h; }
  h = Math.abs(h ^ 0x5BB1E);
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'MS' + p + a[h % a.length] + a[Math.floor(h / a.length) % a.length];
}

// ── Page bootstrap helper ────────────────────────────────────
// Call at top of every page. Checks session, inits tenant, then calls cb.
function msPageInit(requiredRole, onReady, onFail) {
  var slug = msGetSlug();
  if (!slug) { if (onFail) onFail('no-slug'); else window.location.href = 'index.html'; return; }
  sessionStorage.setItem('ms_slug', slug);

  // Check session
  var sess = msSession();
  if (requiredRole && (!sess.tenantId || sess.role !== requiredRole)) {
    window.location.href = 'login-' + requiredRole + '.html?salon=' + encodeURIComponent(slug);
    return;
  }

  // If branding not yet applied, fetch tenant
  if (!MS_TENANT && sess.tenantId) {
    MS_TENANT = { id: sess.tenantId, name: sess.salonName || 'MySalon', logo_url: sess.logoUrl, plan: sess.plan };
    _msApplyBranding(MS_TENANT);
  }

  if (onReady) onReady(sess);
}
