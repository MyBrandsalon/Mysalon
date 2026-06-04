// ════════════════════════════════════════════════════════════════════
//  MYSALON — SUPABASE DATA LAYER  (_mysalon.js)
//  Shared across all MySalon portal pages.
//  Replace placeholders:
//    https://sgliztuggyksdemzkaxr.supabase.co  → https://xxxx.supabase.co
//    sb_publishable_GtdUt6IV6TcsGoyOP02oIQ_CZf0vLQy → eyJ...
// ════════════════════════════════════════════════════════════════════

var MS_URL = 'https://sgliztuggyksdemzkaxr.supabase.co';
var MS_KEY = 'sb_publishable_GtdUt6IV6TcsGoyOP02oIQ_CZf0vLQy';

// ── Low-level helpers ─────────────────────────────────────────────
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

// ── CRUD wrappers ────────────────────────────────────────────────
function msSelect(table, qs) {
  return _msFetch(table + (qs ? '?' + qs : ''), { method: 'GET' });
}
function msInsert(table, row) {
  return _msFetch(table, { method: 'POST', body: JSON.stringify(row) })
    .then(function(rows) { return Array.isArray(rows) ? rows[0] : rows; });
}
function msUpdate(table, id, patch) {
  return _msFetch(table + '?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH', body: JSON.stringify(patch)
  }).then(function(rows) { return Array.isArray(rows) ? rows[0] : rows; });
}
function msDelete(table, id) {
  return _msFetch(table + '?id=eq.' + encodeURIComponent(id), { method: 'DELETE' });
}
function msDeleteWhere(table, qs) {
  return _msFetch(table + '?' + qs, { method: 'DELETE' });
}

// ── Tenant resolution ────────────────────────────────────────────
// Call once on page load. Reads ?salon=SLUG from URL and caches tenant.
var MS_TENANT = null;  // populated by msInit()

function msInit(onDone, onError) {
  var slug = _getSlug();
  if (!slug) {
    if (onError) onError('No salon slug in URL (?salon=SLUG)');
    return;
  }
  msSelect('tenants', 'slug=eq.' + encodeURIComponent(slug) + '&is_active=eq.true&select=*')
    .then(function(rows) {
      if (!rows || !rows.length) {
        if (onError) onError('Salon not found or inactive.');
        return;
      }
      MS_TENANT = rows[0];
      _applyTenantBranding(MS_TENANT);
      if (onDone) onDone(MS_TENANT);
    })
    .catch(function(err) {
      if (onError) onError(err && err.message ? err.message : String(err));
    });
}

function _getSlug() {
  return new URLSearchParams(location.search).get('salon') ||
         sessionStorage.getItem('ms_slug') || '';
}

function _applyTenantBranding(tenant) {
  // Swap logo if a placeholder exists on the page
  var logoEl = document.getElementById('ms-logo');
  if (logoEl && tenant.logo_url) logoEl.src = tenant.logo_url;

  // Swap salon name text nodes
  document.querySelectorAll('.ms-salon-name').forEach(function(el) {
    el.textContent = tenant.name;
  });

  // Set page title
  document.title = tenant.name + ' — MySalon';

  // Store for session
  sessionStorage.setItem('ms_slug',      tenant.slug);
  sessionStorage.setItem('ms_tenant_id', tenant.id);
  sessionStorage.setItem('ms_plan',      tenant.plan);
  sessionStorage.setItem('ms_name',      tenant.name);
  sessionStorage.setItem('ms_logo',      tenant.logo_url || '');
}

// ── Subscription gate ────────────────────────────────────────────
// Call before rendering a paid feature. Redirects if plan insufficient.
function msRequirePlan(minPlan) {
  var planRank = { free: 0, pro: 1, business: 2 };
  var current  = sessionStorage.getItem('ms_plan') || 'free';
  if ((planRank[current] || 0) < (planRank[minPlan] || 0)) {
    window.location.href = _slugUrl('upgrade.html');
    return false;
  }
  return true;
}

// ── URL helpers ──────────────────────────────────────────────────
function _slugUrl(page) {
  var slug = sessionStorage.getItem('ms_slug') || '';
  return page + (slug ? '?salon=' + encodeURIComponent(slug) : '');
}

// ── Auth helpers ─────────────────────────────────────────────────
function msSession() {
  return {
    tenantId: sessionStorage.getItem('ms_tenant_id'),
    slug:     sessionStorage.getItem('ms_slug'),
    role:     sessionStorage.getItem('ms_role'),
    phone:    sessionStorage.getItem('ms_phone'),
    name:     sessionStorage.getItem('ms_user_name'),
    staffId:  sessionStorage.getItem('ms_staff_id'),
    plan:     sessionStorage.getItem('ms_plan')
  };
}

function msLogout() {
  sessionStorage.clear();
  var slug = _getSlug();
  window.location.href = 'index.html' + (slug ? '?salon=' + encodeURIComponent(slug) : '');
}

function msRequireAuth(role) {
  var sess = msSession();
  if (!sess.tenantId || !sess.role) {
    window.location.href = _slugUrl('login-' + (role || 'owner') + '.html');
    return null;
  }
  if (role && sess.role !== role) {
    window.location.href = _slugUrl('login-' + role + '.html');
    return null;
  }
  return sess;
}

// ── Named data accessors ─────────────────────────────────────────
var MS = {

  // ── Tenant ──
  getTenant: function(slug) {
    return msSelect('tenants', 'slug=eq.' + encodeURIComponent(slug) + '&select=*')
      .then(function(r) { return r && r[0]; });
  },
  updateTenant: function(id, patch) { return msUpdate('tenants', id, patch); },

  // ── Salons (branches) ──
  getSalons: function(tenantId) {
    return msSelect('salons', 'tenant_id=eq.' + encodeURIComponent(tenantId) + '&is_active=eq.true&order=name.asc');
  },
  insertSalon: function(row) { return msInsert('salons', row); },
  updateSalon: function(id, patch) { return msUpdate('salons', id, patch); },

  // ── Staff ──
  getStaff: function(tenantId) {
    return msSelect('staff', 'tenant_id=eq.' + encodeURIComponent(tenantId) + '&order=name.asc');
  },
  getStaffBySalon: function(tenantId, salonId) {
    return msSelect('staff', 'tenant_id=eq.' + encodeURIComponent(tenantId) +
      '&salon_id=eq.' + encodeURIComponent(salonId) + '&active=eq.true&order=name.asc');
  },
  insertStaff: function(row) { return msInsert('staff', row); },
  updateStaff: function(id, patch) { return msUpdate('staff', id, patch); },
  deleteStaff: function(id) { return msDelete('staff', id); },

  // ── Customers ──
  getCustomers: function(tenantId) {
    return msSelect('customers', 'tenant_id=eq.' + encodeURIComponent(tenantId) + '&order=name.asc');
  },
  insertCustomer: function(row) { return msInsert('customers', row); },
  updateCustomer: function(id, patch) { return msUpdate('customers', id, patch); },

  // ── Entries ──
  getEntries: function(tenantId, salonId, dateStr) {
    var qs = 'tenant_id=eq.' + encodeURIComponent(tenantId);
    if (salonId) qs += '&salon_id=eq.' + encodeURIComponent(salonId);
    if (dateStr) qs += '&date=eq.' + encodeURIComponent(dateStr);
    qs += '&order=created_at.desc';
    return msSelect('entries', qs);
  },
  insertEntry: function(row) { return msInsert('entries', row); },
  updateEntry: function(id, patch) { return msUpdate('entries', id, patch); },
  deleteEntry: function(id) { return msDelete('entries', id); },

  // ── Style Cards ──
  getStyleCards: function(tenantId, customerId) {
    var qs = 'tenant_id=eq.' + encodeURIComponent(tenantId);
    if (customerId) qs += '&customer_id=eq.' + encodeURIComponent(customerId);
    qs += '&order=date.desc';
    return msSelect('style_cards', qs);
  },
  insertStyleCard: function(row) { return msInsert('style_cards', row); },
  updateStyleCard: function(id, patch) { return msUpdate('style_cards', id, patch); },

  // ── Visits ──
  getVisits: function(tenantId, customerId) {
    var qs = 'tenant_id=eq.' + encodeURIComponent(tenantId);
    if (customerId) qs += '&customer_id=eq.' + encodeURIComponent(customerId);
    qs += '&order=date.desc&limit=50';
    return msSelect('visits', qs);
  },
  insertVisit: function(row) { return msInsert('visits', row); },

  // ── Cash In ──
  getCashIn: function(tenantId, salonId, dateStr) {
    var qs = 'tenant_id=eq.' + encodeURIComponent(tenantId);
    if (salonId) qs += '&salon_id=eq.' + encodeURIComponent(salonId);
    if (dateStr) qs += '&date=eq.' + encodeURIComponent(dateStr);
    return msSelect('cash_in', qs);
  },
  insertCashIn: function(row) { return msInsert('cash_in', row); },

  // ── Expenses ──
  getExpenses: function(tenantId, salonId, dateStr) {
    var qs = 'tenant_id=eq.' + encodeURIComponent(tenantId);
    if (salonId) qs += '&salon_id=eq.' + encodeURIComponent(salonId);
    if (dateStr) qs += '&date=eq.' + encodeURIComponent(dateStr);
    return msSelect('expenses', qs);
  },
  insertExpense: function(row) { return msInsert('expenses', row); },

  // ── Attendance ──
  getAttendance: function(tenantId, salonId, dateStr) {
    var qs = 'tenant_id=eq.' + encodeURIComponent(tenantId);
    if (salonId) qs += '&salon_id=eq.' + encodeURIComponent(salonId);
    if (dateStr) qs += '&date=eq.' + encodeURIComponent(dateStr);
    return msSelect('attendance', qs);
  },
  upsertAttendance: function(row) {
    return _msFetch('attendance?on_conflict=tenant_id,stylist_id,date', {
      method: 'POST',
      headers: Object.assign(_msHeaders(), { 'Prefer': 'resolution=merge-duplicates,return=representation' }),
      body: JSON.stringify(row)
    }).then(function(r) { return Array.isArray(r) ? r[0] : r; });
  },

  // ── Advances ──
  getAdvances: function(tenantId, stylistId) {
    var qs = 'tenant_id=eq.' + encodeURIComponent(tenantId);
    if (stylistId) qs += '&stylist_id=eq.' + encodeURIComponent(stylistId);
    qs += '&order=date.desc';
    return msSelect('advances', qs);
  },
  insertAdvance: function(row) { return msInsert('advances', row); },

  // ── Cosmetics ──
  getCosmetics: function(tenantId, salonId) {
    var qs = 'tenant_id=eq.' + encodeURIComponent(tenantId);
    if (salonId) qs += '&salon_id=eq.' + encodeURIComponent(salonId);
    qs += '&order=product_name.asc';
    return msSelect('cosmetics', qs);
  },
  insertCosmetic: function(row) { return msInsert('cosmetics', row); },
  updateCosmetic: function(id, patch) { return msUpdate('cosmetics', id, patch); },
  deleteCosmetic: function(id) { return msDelete('cosmetics', id); },

  // ── Queue Tokens (Pro+) ──
  getQueue: function(tenantId, salonId, dateStr) {
    var qs = 'tenant_id=eq.' + encodeURIComponent(tenantId);
    if (salonId) qs += '&salon_id=eq.' + encodeURIComponent(salonId);
    if (dateStr) qs += '&date=eq.' + encodeURIComponent(dateStr);
    qs += '&order=position.asc';
    return msSelect('queue_tokens', qs);
  },
  insertQueueToken: function(row) { return msInsert('queue_tokens', row); },
  updateQueueToken: function(id, patch) { return msUpdate('queue_tokens', id, patch); },

  // ── Hire Board (Business+) ──
  getHirePostings: function(tenantId) {
    return msSelect('hire_board', 'tenant_id=eq.' + encodeURIComponent(tenantId) +
      '&is_active=eq.true&order=created_at.desc');
  },
  insertHirePosting: function(row) { return msInsert('hire_board', row); },
  updateHirePosting: function(id, patch) { return msUpdate('hire_board', id, patch); },

  // ── Subscriptions ──
  getSubscription: function(tenantId) {
    return msSelect('subscriptions', 'tenant_id=eq.' + encodeURIComponent(tenantId) +
      '&status=eq.active&order=created_at.desc&limit=1')
      .then(function(r) { return r && r[0]; });
  },
  insertSubscription: function(row) { return msInsert('subscriptions', row); },

  // ── Super Admin helpers ──
  getAllTenants: function(page, limit) {
    var p = page || 0; var l = limit || 50;
    return msSelect('tenants', 'order=created_at.desc&limit=' + l + '&offset=' + (p * l));
  },
  getTenantStats: function() {
    return Promise.all([
      msSelect('tenants', 'select=id&is_active=eq.true'),
      msSelect('tenants', 'select=id&plan=eq.pro'),
      msSelect('tenants', 'select=id&plan=eq.business'),
      msSelect('subscriptions', 'select=amount&status=eq.active')
    ]).then(function(r) {
      var totalRevenue = (r[3] || []).reduce(function(s, x) { return s + parseFloat(x.amount || 0); }, 0);
      return { totalActive: r[0].length, proPlan: r[1].length, businessPlan: r[2].length, monthlyRevenue: totalRevenue };
    });
  }
};

// ── Bootstrap: load all data for current tenant into localStorage ─
function msBootstrap(tenantId, salonId, onDone, onError) {
  Promise.all([
    MS.getStaff(tenantId),
    MS.getSalons(tenantId),
    MS.getCustomers(tenantId)
  ]).then(function(results) {
    localStorage.setItem('ms_staff',     JSON.stringify(results[0] || []));
    localStorage.setItem('ms_salons',    JSON.stringify(results[1] || []));
    localStorage.setItem('ms_customers', JSON.stringify(results[2] || []));
    if (onDone) onDone();
  }).catch(function(err) {
    console.warn('[MySalon] Bootstrap failed:', err);
    if (onError) onError(err);
  });
}

// ── Utility: today's date string ─────────────────────────────────
function msToday() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
}

// ── Utility: format INR ──────────────────────────────────────────
function msRupee(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

// ── Utility: referral code ───────────────────────────────────────
function msBuildReferral(phone) {
  var p = String(phone).replace(/\D/g, '');
  if (p.length !== 10) return '';
  var h = 0;
  for (var i = 0; i < p.length; i++) { h = ((h << 5) - h) + p.charCodeAt(i); h = h & h; }
  h = Math.abs(h ^ 0x5BB1E);
  var a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return 'MS' + p + a[h % a.length] + a[Math.floor(h / a.length) % a.length];
}
