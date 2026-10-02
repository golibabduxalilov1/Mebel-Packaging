/* Qabul sinovi (Colada.dae): "Бок л" asosiy, "Полка л" va "Цоколь" yelimlanadi. Fayl topilmasa o'tkazib yuboriladi. */
import fs from 'fs';
import { importFile } from '../src/lib/import/importFile.ts';
import { LabStore } from '../src/lib/lab/store.ts';
import { compositeInfo, eff, materialMap, partMatrices, packItems } from '../src/lib/model/labdoc.ts';
const ok = (c: boolean, m: string) => { console.log((c ? 'OK  ' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };
const file = [process.env.COLADA_DAE, new URL('./fixtures/Colada.dae', import.meta.url).pathname, '/home/mrmoon/Downloads/Desktop/Colada.dae'].find((f) => f && fs.existsSync(f));
(async () => {
  if (!file) { console.log('SKIP Colada.dae topilmadi'); return; }
  const b = fs.readFileSync(file);
  const r: any = await importFile({ fileName: 'Colada.dae', bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), options: { unit: 'auto', upAxis: 'auto', daeLevel: 'top' } });
  const parts = r.result.parts;
  const find = (n: string) => parts.find((p: any) => p.name.trim() === n);
  const bok = find('Бок л'), polka = find('Полка л'), cokol = find('Цоколь');
  if (!bok || !polka || !cokol) { console.log('SKIP kerakli detallar yo\'q'); return; }
  const s = new LabStore();
  s.load(r.result, null, null, [], {});
  const st = () => s.get();
  const pos = (id: string) => JSON.stringify(parts.find((p: any) => p.id === id).obb);
  const before = [bok, polka, cokol].map((p) => pos(p.id));
  s.setMode('glue');
  const pick = (id: string) => s.onPick({ partId: id, point: null as any, faceIndex: 0 }, { ctrlKey: false, metaKey: false, shiftKey: false, clientX: 0, clientY: 0 });
  s.glueConfirm();
  ok(st().doc.composites.length === 0, 'asosiy tanlanmaguncha tugma ishlamaydi');
  pick(bok.id);
  s.glueConfirm();
  ok(st().doc.composites.length === 0, 'yelimlanadigan tanlanmaguncha tugma ishlamaydi');
  pick(polka.id); pick(cokol.id);
  s.glueConfirm();
  const comp = st().doc.composites[0];
  ok(!!comp && comp.name === eff(bok, undefined).name && comp.members.length === 3, 'kompozit "Бок л" nomi bilan, 3 detal');
  ok(comp.mainId === bok.id, 'asosiy detal = Бок л');
  ok([bok, polka, cokol].every((p, i) => pos(p.id) === before[i]) && Object.keys(partMatrices(st().doc)).length === 0, 'koordinatalar o\'zgarmagan (siljish 0)');
  const info = compositeInfo(comp, new Map(parts.map((p: any) => [p.id, p])), st().doc, materialMap([]));
  const bb = info.bbox!;
  const inside = [bok, polka, cokol].every((p: any) => p.bbox.min.every((v: number, k: number) => v >= bb.min[k] - 1e-3) && p.bbox.max.every((v: number, k: number) => v <= bb.max[k] + 1e-3));
  ok(!!info.dims && inside, 'gabarit qutisi uchala detalni qamraydi: ' + info.dims?.map((v) => Math.round(v)).join('x'));
  const items = packItems(st().views);
  const ci = items.filter((i) => i.refKind === 'composite');
  ok(ci.length === 1 && ci[0].qty === 1 && ci[0].name === comp.name, 'upokovkaga kompozit bitta birlik (qty 1) bo\'lib o\'tadi');
  ok(!items.some((i) => i.refKind === 'row' && [polka.id, cokol.id].some((id) => st().doc.rows.some((x) => x.id === i.refUid && x.members.includes(id)))), 'yelimlangan detallar qatorlarda takrorlanmaydi');
})();
