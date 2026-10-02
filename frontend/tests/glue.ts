import fs from 'fs';
import { importFile } from '../src/lib/import/importFile.ts';
import * as D from '../src/lib/model/labdoc.ts';
import { isIdent } from '../src/lib/model/mat4.ts';
const ok = (c: boolean, m: string) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };
(async () => {
  const b = fs.readFileSync(new URL('./fixtures/test.dae', import.meta.url));
  const r: any = await importFile({ fileName: 'test.dae', bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), options: { unit: 'auto', upAxis: 'auto', daeLevel: 'top' } });
  const parts = r.result.parts;
  let doc = D.newDoc();
  doc = { ...doc, rows: D.autoRows(parts, doc) };
  console.log('rows', doc.rows.map((x: any) => x.members.join('+')));
  const mats = D.materialMap([{ name: 'ДСП бук 16', density: 700, sheetL: null, sheetW: null, sheetWeight: null, method: 'density' }]);
  const views = D.rowViews(parts, doc, mats);
  console.log(views.map(v => [v.name, v.qty, v.unitWeight?.toFixed(2), v.totalWeight?.toFixed(2)]));
  // yelimlash: asosiy m1, yelimlanadigan m3; hech narsa siljimaydi
  const before = D.partMatrices(doc);
  doc = D.glue(doc, parts, 'm1', ['m3']);
  ok(JSON.stringify(D.partMatrices(doc)) === JSON.stringify(before), 'matritsalar o\'zgarmadi (siljish 0)');
  ok(doc.composites[0].members.every((m) => isIdent(m.matrix)), 'barcha a\'zolar matritsasi birlik');
  ok(doc.composites[0].name === parts[0].name && doc.composites[0].mainId === 'm1', 'nom va asosiy detal');
  ok(D.glue(D.newDoc(), parts, 'm2', ['m2', 'm2']).composites[0].members.length === 1, 'asosiy yelimlanadiganlar ro\'yxatiga kirmaydi')
  const v2 = D.rowViews(parts, doc, mats);
  console.log(v2.map(v => [v.kind, v.name, v.qty, v.L?.toFixed(1), v.W?.toFixed(1), v.T?.toFixed(1), v.totalWeight?.toFixed(2)]));
  const cid = doc.composites[0].id;
  // nested: glue composite to m2
  doc = D.glue(doc, parts, 'm2', [cid]);
  console.log('nested', doc.composites.length, doc.composites[0].members.map(m => m.partId), doc.composites[0].name);
  ok(doc.composites[0].name === parts[1].name, 'kompozit nomi asosiy (m2) nomi bilan');
  doc = D.detach(doc, doc.composites[0].id, 'm3', parts);
  console.log('after detach', doc.composites[0].members.map(m => m.partId), doc.rows.map((x: any) => x.members.join('+')));
  doc = D.dissolve(doc, doc.composites[0].id);
  console.log('after dissolve', doc.composites.length, doc.rows.map((x: any) => x.members.join('+')));
})();
