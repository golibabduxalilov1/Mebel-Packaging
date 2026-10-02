/*
 * BazisPackExport.js  v1.0.0
 * Bazis-Mebelshchik skripti: joriy modeldagi detallarni "Bazis upokovka" tizimi uchun JSON faylga yozadi (TZ 3.5, S1-S11).
 * Har bir detal alohida chiqariladi, birlashtirish veb-tizimda (S4).
 *
 * MUHIM: skript Bazis tashqarisida yozilgan va Bazis ichida HALI SINALMAGAN.
 * Bazis skript API versiyalarga qarab farq qiladi, shuning uchun har bir xususiyat mavjudligi tekshiriladi
 * (yo'q bo'lsa qiymat null yoziladi va tizim uni "noma'lum" deb ko'rsatadi). Birinchi ishga tushirishda
 * natijaviy JSON ni kichik modelda tekshiring (README.md, "Tekshirish" bo'limi).
 *
 * Chiqish sxemasi (frontend/src/lib/import/bazisJson.ts bilan mos):
 * { schemaVersion: 1, scriptVersion, bazisApiVersion, model, unit: "mm", date,
 *   parts: [{ id, name, artPos, designation, material, length, width, thickness, type, product,
 *             butts: [{ material, thickness, sign }], bent, hidden, pos: { min: [x,y,z], max: [x,y,z] } }] }
 */

var SCRIPT_VERSION = '1.0.0';

// ---------- yordamchilar ----------
function has(o, k) {
  try { return o != null && typeof o[k] !== 'undefined'; } catch (e) { return false; }
}
function get(o, k, def) {
  try { var v = o[k]; return typeof v === 'undefined' ? def : v; } catch (e) { return def; }
}
function num(v) {
  var n = Number(v);
  return isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function str(v) {
  if (v === null || typeof v === 'undefined') return null;
  var s = String(v);
  return s.length ? s : null;
}
function vec(p) {
  if (!p) return null;
  var x = num(get(p, 'x', get(p, 'X'))), y = num(get(p, 'y', get(p, 'Y'))), z = num(get(p, 'z', get(p, 'Z')));
  return x === null || y === null || z === null ? null : [x, y, z];
}
// JSON.stringify bo'lmagan eski dvigatellar uchun zaxira
function toJson(v) {
  if (typeof JSON !== 'undefined' && JSON.stringify) return JSON.stringify(v, null, 1);
  if (v === null) return 'null';
  if (typeof v === 'number') return isFinite(v) ? String(v) : 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'string') return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t') + '"';
  if (v instanceof Array) { var a = []; for (var i = 0; i < v.length; i++) a.push(toJson(v[i])); return '[' + a.join(',') + ']'; }
  var o = []; for (var k in v) if (v.hasOwnProperty(k)) o.push(toJson(k) + ':' + toJson(v[k])); return '{' + o.join(',') + '}';
}

// ---------- log (S9) ----------
var LOG = [];
function log(msg) {
  LOG.push(msg);
  try { if (typeof console !== 'undefined' && console.log) console.log(msg); } catch (e) { /* yo'q */ }
}

// ---------- obyektlarni aylanib chiqish (S2) ----------
function children(o) {
  var list = [];
  var n = get(o, 'Count', 0);
  for (var i = 0; i < n; i++) {
    var c = null;
    try { c = o.Objects[i]; } catch (e) { try { c = o[i]; } catch (e2) { c = null; } }
    if (c) list.push(c);
  }
  return list;
}

function asType(o) {
  // S2/S3: tur aniqlash (TFurnPanel, TFurnBlock, TFastener/TFurnAsm/TAsmKit, TExtrusionBody). AsPanel/AsBlock/... bo'lmasa sinf nomi bo'yicha
  var p = get(o, 'AsPanel', null);
  if (p) return { kind: 'panel', obj: p };
  var f = get(o, 'AsFastener', null);
  if (f) return { kind: 'hardware', obj: f };
  var x = get(o, 'AsExtrusion', null) || get(o, 'AsProfile', null);
  if (x) return { kind: 'profile', obj: x };
  var b = get(o, 'AsBlock', null) || get(o, 'AsAssembly', null);
  if (b) return { kind: 'block', obj: b };
  var cls = '';
  try { cls = String(o.constructor && o.constructor.name || o.ClassName || ''); } catch (e) { cls = ''; }
  if (/Panel/i.test(cls)) return { kind: 'panel', obj: o };
  if (/Fastener|Furniture|Asm|Kit/i.test(cls)) return { kind: 'hardware', obj: o };
  if (/Extrusion|Profile/i.test(cls)) return { kind: 'profile', obj: o };
  if (children(o).length) return { kind: 'block', obj: o };
  return { kind: 'other', obj: o };
}

function butts(panel) {
  // S3: kromkalar (Butts)
  var out = [];
  var bs = get(panel, 'Butts', null);
  if (!bs) return null;
  var n = get(bs, 'Count', 0);
  for (var i = 0; i < n; i++) {
    var b = null;
    try { b = bs[i]; } catch (e) { b = null; }
    if (!b) continue;
    out.push({ material: str(get(b, 'Material', get(b, 'MaterialName', null))), thickness: num(get(b, 'Thickness', get(b, 'ClipThickness', null))), sign: str(get(b, 'Sign', null)) });
  }
  return out;
}

function sizes(t, outer) {
  // S3/S5: o'lchamlar. Panel (egilgan ham): GSize (tekislikdagi gabarit) + Thickness; aks holda GMin/GMax
  var o = t.obj;
  var L = null, W = null, T = null;
  if (t.kind === 'panel') {
    var g = get(o, 'GSize', null);
    if (g) { L = num(get(g, 'x', get(g, 'X'))); W = num(get(g, 'y', get(g, 'Y'))); }
    if (L === null) L = num(get(o, 'ContourWidth', null));
    if (W === null) W = num(get(o, 'ContourHeight', null));
    T = num(get(o, 'Thickness', null));
  }
  if (L === null || W === null || T === null) {
    var mn = vec(get(o, 'GMin', null) || get(outer, 'GMin', null)), mx = vec(get(o, 'GMax', null) || get(outer, 'GMax', null));
    if (mn && mx) {
      var d = [Math.abs(mx[0] - mn[0]), Math.abs(mx[1] - mn[1]), Math.abs(mx[2] - mn[2])].sort(function (a, b) { return b - a; });
      if (L === null) L = num(d[0]);
      if (W === null) W = num(d[1]);
      if (T === null) T = num(d[2]);
    }
  }
  // L >= W
  if (L !== null && W !== null && W > L) { var tmp = L; L = W; W = tmp; }
  return { L: L, W: W, T: T };
}

// ---------- asosiy ----------
var SETTINGS = { exportHidden: false, exportPos: true }; // S6: yashirinlar standartda chiqarilmaydi
var parts = [];
var counter = 0;
var skipped = 0;
var hiddenSkipped = 0;
var seen = [];

function ownerName(o) {
  // S3: mahsulot nomi: eng yuqoridagi blok (Owner zanjiri)
  var top = null, cur = get(o, 'Owner', null), guard = 0;
  while (cur && guard++ < 50) {
    if (cur === Model || get(cur, 'Owner', null) == null) break;
    top = cur;
    cur = get(cur, 'Owner', null);
  }
  return top ? str(get(top, 'Name', null)) : null;
}

function addPart(o, t, product, hidden) {
  counter++;
  var s = sizes(t, o);
  var mn = SETTINGS.exportPos ? vec(get(o, 'GMin', null)) : null, mx = SETTINGS.exportPos ? vec(get(o, 'GMax', null)) : null;
  parts.push({
    id: 'b' + counter,
    name: str(get(o, 'Name', null)),
    artPos: str(get(o, 'ArtPos', null)),
    designation: str(get(o, 'Designation', null)),
    material: str(get(t.obj, 'MaterialName', get(o, 'MaterialName', null))),
    length: s.L, width: s.W, thickness: s.T,
    type: t.kind,
    product: product,
    butts: t.kind === 'panel' ? butts(t.obj) : null,
    bent: !!get(t.obj, 'Bent', false),                     // S5
    hidden: hidden,
    pos: mn && mx ? { min: mn, max: mx } : null            // S8: global gabarit (mm), Bazis ichida tekshirilishi kerak
  });
}

function handle(o, product, parentHidden, recurse) {
  for (var k = 0; k < seen.length; k++) if (seen[k] === o) return; // forEach va rekursiya takrorlanmasin
  seen.push(o);
  var t;
  try { t = asType(o); } catch (e) { log('tur aniqlanmadi: ' + e); skipped++; return; }
  var hidden = parentHidden || get(o, 'Visible', true) === false;
  if (t.kind === 'block') {
    if (!recurse) return;
    var pname = product || str(get(o, 'Name', null));
    var ch = children(t.obj);
    if (!ch.length) ch = children(o);
    for (var i = 0; i < ch.length; i++) handle(ch[i], pname, hidden, true);
    return;
  }
  if (t.kind === 'other') { skipped++; log('noma\'lum tugun: ' + str(get(o, 'Name', null))); return; }
  if (hidden && !SETTINGS.exportHidden) { hiddenSkipped++; return; }
  try { addPart(o, t, product, hidden); } catch (e) { log('detal o\'qilmadi (' + str(get(o, 'Name', null)) + '): ' + e); skipped++; }
}

function collect() {
  parts = []; counter = 0; skipped = 0; hiddenSkipped = 0; seen = []; LOG = [];
  if (typeof Model.forEach === 'function') {
    // S2: Model.forEach (barcha tugunlar); mahsulot nomi Owner zanjiridan
    Model.forEach(function (o) {
      var t = null;
      try { t = asType(o); } catch (e) { t = null; }
      if (t && t.kind === 'block') return;
      var hid = false, cur = get(o, 'Owner', null), g = 0;
      while (cur && g++ < 50) { if (get(cur, 'Visible', true) === false) hid = true; cur = get(cur, 'Owner', null); }
      handle(o, ownerName(o), hid, false);
    });
  }
  if (!parts.length) {
    var top = children(Model);
    for (var i = 0; i < top.length; i++) handle(top[i], null, false, true);
  }
}

function apiVersion() {
  // S10
  try { return typeof system !== 'undefined' && system ? (get(system, 'apiVersion', null) || get(system, 'version', null)) : null; } catch (e) { return null; }
}

function exportJson() {
  if (typeof Model === 'undefined' || !Model) { alert('Model topilmadi: skriptni Bazis-Mebelshchik ichida, ochiq loyihada ishga tushiring.'); return; }
  collect();
  if (!parts.length) { alert('Modelda detal topilmadi.' + (LOG.length ? '\n' + LOG.slice(0, 5).join('\n') : '')); return; }
  var modelName = str(get(Model, 'Name', null)) || str(get(Model, 'FileName', null)) || 'model';
  var d = new Date();
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var out = {
    schemaVersion: 1, scriptVersion: SCRIPT_VERSION, bazisApiVersion: apiVersion(), model: modelName, unit: 'mm',
    date: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds()),
    parts: parts
  };
  var text = toJson(out);

  // S7: saqlash oynasi, mavjud faylni qayta yozishni so'rash
  var file = null;
  try { if (system && system.askFileNameSave) file = system.askFileNameSave('json'); } catch (e) { file = null; }
  if (!file) { try { if (system && system.askFileName) file = system.askFileName('json'); } catch (e2) { file = null; } }
  if (!file) return;
  if (!/\.json$/i.test(file)) file += '.json';
  var exists = false;
  try { exists = !!(system.fileExists && system.fileExists(file)); } catch (e5) { exists = false; }
  if (exists && typeof confirm === 'function' && !confirm('Fayl mavjud. Qayta yozilsinmi?\n' + file)) return;
  var ok = false;
  try { if (system.writeTextFile) { system.writeTextFile(file, text); ok = true; } } catch (e3) { log('writeTextFile: ' + e3); }
  if (!ok) { try { if (system.writeFile) { system.writeFile(file, text); ok = true; } } catch (e4) { log('writeFile: ' + e4); } }
  if (!ok) { alert('Faylga yozib bo\'lmadi: ' + file + (LOG.length ? '\n' + LOG.slice(-3).join('\n') : '')); return; }
  alert('Bazis upokovka: ' + parts.length + ' ta detal yozildi' +
    (hiddenSkipped ? ', ' + hiddenSkipped + ' ta yashirin detal chiqarilmadi' : '') +
    (skipped ? ', ' + skipped + ' ta obyekt o\'qilmadi (log)' : '') + '.\n' + file);
}

// ---------- panel va sozlamalar (S1) ----------
var PROP_FILE = 'BazisPackExport.prop';
function setupPanel() {
  var P = typeof Action !== 'undefined' && Action ? get(Action, 'Properties', null) : null;
  if (!P || typeof P.NewButton !== 'function') return false;
  try { if (P.Load) P.Load(PROP_FILE); } catch (e) { /* birinchi ishga tushirish */ }
  var hiddenProp = P.NewBool ? P.NewBool('Yashirin detallarni ham chiqarish', SETTINGS.exportHidden) : null;
  var posProp = P.NewBool ? P.NewBool('3D joylashuvni (GMin/GMax) yozish', SETTINGS.exportPos) : null;
  var btn = P.NewButton('Экспортировать');
  btn.OnClick = function () {
    if (hiddenProp) SETTINGS.exportHidden = !!hiddenProp.Value;
    if (posProp) SETTINGS.exportPos = !!posProp.Value;
    try { if (P.Save) P.Save(PROP_FILE); } catch (e) { log('sozlama saqlanmadi: ' + e); }
    exportJson();
  };
  if (typeof Action.Continue === 'function') Action.Continue(); // skript panel bilan ochiq qoladi
  return true;
}

if (!setupPanel()) exportJson(); // panel API bo'lmasa darhol eksport
