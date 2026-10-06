/**
 * دفتر الإيجارات — وسيط WhatsApp و Meta Ads
 *
 * يحفظ مفاتيح Meta بشكل مخفي (لا تظهر في الموقع العام)، ويقبل الطلبات فقط من
 * حسابات الدخول المسموح لها في الموقع (يتحقق من تسجيل دخول Firebase).
 *
 * الإعداد مرة واحدة (التفاصيل في README.md ← «واتساب مباشر وإعلانات Meta»):
 *  1) افتح https://script.new والصق هذا الملف كاملًا ثم احفظ.
 *  2) Project Settings ⚙️ ← Script properties ← أضف القيم:
 *       ALLOWED_EMAILS     بريد الدخول للموقع (وأكثر من بريد بفاصلة)
 *       META_TOKEN         توكن System User الدائم من Meta Business
 *       WA_PHONE_NUMBER_ID رقم الـ Phone number ID من WhatsApp ← API Setup
 *       AD_ACCOUNT_ID      رقم الحساب الإعلاني (الرقم بعد act= في رابط Ads Manager)
 *     واختياري: WA_TEMPLATE_REMINDER (افتراضي rent_reminder)، WA_TEMPLATE_RENEWAL (افتراضي lease_renewal)، WA_LANG (افتراضي en)
 *  3) Deploy ← New deployment ← Web app ← Execute as: Me · Who has access: Anyone ← انسخ الرابط إلى الموقع.
 */
const FIREBASE_API_KEY = 'AIzaSyC64-x34PlOjKQ4geobGzkf2ABJuDwVQUI'; // مفتاح Firebase العام لموقعك (ليس سرًّا)
const GRAPH = 'https://graph.facebook.com/v23.0';

function doGet() {
  return json_({ ok: true, app: 'rentbook-meta' });
}

function doPost(e) {
  try {
    const req = JSON.parse(e.postData.contents);
    const email = verifyUser_(req.idToken);
    if (!email) return json_({ ok: false, error: 'unauthorized' });
    const p = PropertiesService.getScriptProperties();
    switch (req.action) {
      case 'config':
        return json_({ ok: true, email: email,
          whatsapp: !!(p.getProperty('META_TOKEN') && p.getProperty('WA_PHONE_NUMBER_ID')),
          ads: !!(p.getProperty('META_TOKEN') && p.getProperty('AD_ACCOUNT_ID')) });
      case 'wa_send':   return json_(waSend_(req, p));
      case 'ads_list':  return json_(adsList_(p));
      case 'ads_activate': return json_(adsSetStatus_(req.campaignId, 'ACTIVE', true, p));
      case 'ads_pause': return json_(adsSetStatus_(req.campaignId, 'PAUSED', false, p));
      default: return json_({ ok: false, error: 'unknown_action' });
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

// ---------- الحماية: نفس حساب الدخول في الموقع ----------
function verifyUser_(idToken) {
  if (!idToken) return null;
  const allowed = (PropertiesService.getScriptProperties().getProperty('ALLOWED_EMAILS') || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(String);
  const r = UrlFetchApp.fetch('https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=' + FIREBASE_API_KEY, {
    method: 'post', contentType: 'application/json', payload: JSON.stringify({ idToken: idToken }), muteHttpExceptions: true
  });
  if (r.getResponseCode() !== 200) return null;
  const u = (JSON.parse(r.getContentText()).users || [])[0];
  const email = u && u.email && String(u.email).toLowerCase();
  return email && allowed.indexOf(email) >= 0 ? email : null;
}

// ---------- Meta Graph API ----------
function graph_(method, path, payload, p) {
  const token = p.getProperty('META_TOKEN');
  if (!token) throw new Error('META_TOKEN missing');
  const opt = { method: method, muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token } };
  if (payload) { opt.contentType = 'application/json'; opt.payload = JSON.stringify(payload); }
  const r = UrlFetchApp.fetch(GRAPH + path, opt);
  const body = JSON.parse(r.getContentText() || '{}');
  if (r.getResponseCode() >= 300 || body.error) {
    const e = body.error || {};
    throw new Error((e.error_user_msg || e.message || ('HTTP ' + r.getResponseCode())) + (e.code ? ' [' + e.code + ']' : ''));
  }
  return body;
}

// ---------- WhatsApp: إرسال تذكير برسالة معتمدة (Template) ----------
function waSend_(req, p) {
  const phoneId = p.getProperty('WA_PHONE_NUMBER_ID');
  if (!phoneId) throw new Error('WA_PHONE_NUMBER_ID missing');
  const to = String(req.to || '').replace(/[^0-9]/g, '');
  if (to.length < 8) throw new Error('invalid phone number');
  const kind = req.kind === 'renew' ? 'renew' : 'reminder';
  const name = kind === 'renew'
    ? (p.getProperty('WA_TEMPLATE_RENEWAL') || 'lease_renewal')
    : (p.getProperty('WA_TEMPLATE_REMINDER') || 'rent_reminder');
  const params = (req.params || []).slice(0, 5).map(function (v) { return { type: 'text', text: String(v).slice(0, 200) }; });
  const res = graph_('post', '/' + phoneId + '/messages', {
    messaging_product: 'whatsapp', to: to, type: 'template',
    template: { name: name, language: { code: p.getProperty('WA_LANG') || 'en' }, components: [{ type: 'body', parameters: params }] }
  }, p);
  return { ok: true, id: res.messages && res.messages[0] && res.messages[0].id, template: name };
}

// ---------- الإعلانات ----------
function actId_(p) {
  const id = String(p.getProperty('AD_ACCOUNT_ID') || '').replace(/^act_/, '');
  if (!id) throw new Error('AD_ACCOUNT_ID missing');
  return 'act_' + id;
}
function adsList_(p) {
  const fields = 'id,name,status,effective_status,objective,daily_budget,lifetime_budget';
  const r = graph_('get', '/' + actId_(p) + '/campaigns?fields=' + fields + '&limit=50', null, p);
  const acct = graph_('get', '/' + actId_(p) + '?fields=currency,name', null, p);
  return { ok: true, currency: acct.currency, account: acct.name, campaigns: r.data || [] };
}
// التفعيل يشغّل الحملة ومجموعاتها وإعلاناتها (حتى تبدأ فعليًا)؛ الإيقاف يكفيه إيقاف الحملة
function adsSetStatus_(campaignId, status, cascade, p) {
  if (!/^\d+$/.test(String(campaignId || ''))) throw new Error('invalid campaign id');
  const own = graph_('get', '/' + actId_(p) + '/campaigns?fields=id&limit=200', null, p).data || [];
  if (!own.some(function (c) { return c.id === String(campaignId); })) throw new Error('campaign not in this ad account');
  graph_('post', '/' + campaignId, { status: status }, p);
  let sets = 0, ads = 0;
  if (cascade) {
    (graph_('get', '/' + campaignId + '/adsets?fields=id,status&limit=100', null, p).data || []).forEach(function (s) {
      if (s.status !== 'ACTIVE' && s.status !== 'ARCHIVED' && s.status !== 'DELETED') { graph_('post', '/' + s.id, { status: 'ACTIVE' }, p); sets++; }
    });
    (graph_('get', '/' + campaignId + '/ads?fields=id,status&limit=200', null, p).data || []).forEach(function (a) {
      if (a.status !== 'ACTIVE' && a.status !== 'ARCHIVED' && a.status !== 'DELETED') { graph_('post', '/' + a.id, { status: 'ACTIVE' }, p); ads++; }
    });
  }
  return { ok: true, status: status, adsets: sets, ads: ads };
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
