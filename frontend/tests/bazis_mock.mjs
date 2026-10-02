// BazisPackExport.js ni soxta Bazis obyektlari bilan ishga tushiradi (Bazis ichidagi sinov o'rnini bosmaydi).
import fs from 'fs';
import vm from 'vm';
const src = fs.readFileSync(new URL('../../bazis-script/BazisPackExport.js', import.meta.url), 'utf8');
const panel = (name, w, h, t, mat, mn, mx, extra = {}) => ({ Name: name, ArtPos: '1', Visible: true, GMin: { x: mn[0], y: mn[1], z: mn[2] }, GMax: { x: mx[0], y: mx[1], z: mx[2] },
  AsPanel: { GSize: { x: w, y: h }, Thickness: t, MaterialName: mat, Bent: !!extra.bent, Butts: Object.assign([{ Sign: 'ABS 2', Thickness: 2 }], { Count: 1 }) }, ...extra });
function model() {
  const block = { Name: 'Shkaf', Count: 3, Objects: [], Visible: true };
  block.Objects = [panel('Bok', 503, 2067, 16, 'ЛДСП 16', [0, 0, 0], [16, 2067, 503]), panel('Polka', 768, 480, 16, 'ЛДСП 16', [16, 300, 0], [784, 316, 480]),
    panel('Egilgan', 900, 400, 4, 'ХДФ 3', [0, 0, 0], [600, 400, 300], { bent: true })];
  block.AsBlock = block;
  const fast = { Name: 'Саморез 3х19', Visible: true, AsFastener: {}, GMin: { x: 0, y: 0, z: 0 }, GMax: { x: 3, y: 19, z: 3 } };
  const hidden = { ...panel('Yashirin', 100, 100, 16, 'ЛДСП 16', [0, 0, 0], [100, 100, 16]), Visible: false };
  const M = { Name: 'test', Count: 3, Objects: [block, fast, hidden] };
  for (const o of block.Objects) o.Owner = block;
  block.Owner = M; fast.Owner = M; hidden.Owner = M;
  return M;
}
function run(withForEach) {
  let written = null;
  const M = model();
  if (withForEach) M.forEach = (cb) => { const walk = (o) => { cb(o); (o.Objects || []).forEach(walk); }; M.Objects.forEach(walk); };
  const ctx = { confirm: () => true, Model: M, alert: (m) => console.log('ALERT', m),
    system: { apiVersion: 11, askFileNameSave: () => '/tmp/out', fileExists: () => false, writeTextFile: (f, t) => { written = [f, t]; } } };
  vm.runInNewContext(src, ctx);
  return JSON.parse(written[1]);
}
const ok = (c, m) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };
for (const fe of [false, true]) {
  const j = run(fe);
  const by = Object.fromEntries(j.parts.map((p) => [p.name, p]));
  const tag = fe ? '[Model.forEach]' : '[Objects rekursiya]';
  ok(j.schemaVersion === 1 && j.unit === 'mm' && j.bazisApiVersion === 11, tag + ' sarlavha (S7, S10)');
  ok(j.parts.length === 4, tag + ' 4 detal (yashirin chiqarilmadi, S6): ' + j.parts.length);
  ok(by['Bok'].length === 2067 && by['Bok'].width === 503 && by['Bok'].thickness === 16 && by['Bok'].product === 'Shkaf', tag + ' panel o\'lchami va mahsulot (S3)');
  ok(by['Egilgan'].bent === true, tag + ' egilgan belgisi (S5)');
  ok(by['Саморез 3х19'].type === 'hardware' && by['Саморез 3х19'].length === 19, tag + ' furnitura');
  ok(Array.isArray(by['Bok'].pos.min), tag + ' pos (S8)');
  if (!fe) fs.writeFileSync(new URL('./fixtures/bazis-sample.json', import.meta.url), JSON.stringify(j, null, 1));
}
