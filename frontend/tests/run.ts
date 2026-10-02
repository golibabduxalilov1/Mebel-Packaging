import fs from 'fs';
import { importFile } from '../src/lib/import/importFile.ts';
const opts = { unit: 'auto', upAxis: 'auto', daeLevel: 'top' };
const show = (r) => {
  if (!r.ok) { console.log('ERR', r); return; }
  const R = r.result;
  console.log(R.name, R.format, R.source, 'parts', R.parts.length, 'gabarit', R.gabarit?.map(v=>Math.round(v*10)/10), r.ms+'ms');
  console.log(' stats', JSON.stringify(R.stats));
  for (const p of R.parts) console.log('  ', p.id, p.name, '|', p.kind, p.geom, '|', p.material, '| L W T', p.dims.L?.toFixed(1), p.dims.W?.toFixed(1), p.dims.T?.toFixed(1), '| vol', p.volume?.toFixed(0), '| groups', p.matGroups?.length, p.color);
  console.log(' notes', R.notes);
};
const fx = (f) => new URL('./fixtures/' + f, import.meta.url);
const buf = (f) => { const b = fs.readFileSync(fx(f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
(async()=>{
show(await importFile({ fileName: 'test.dae', bytes: buf('test.dae'), options: opts }));
show(await importFile({ fileName: 'test.dae', bytes: buf('test.dae'), options: { ...opts, daeLevel: 'mesh' } }));
show(await importFile({ fileName: 't.obj', bytes: buf('t.obj'), mtlText: fs.readFileSync(fx('t.mtl'),'utf8'), options: opts }));
show(await importFile({ fileName: 'x.b3d', bytes: new TextEncoder().encode('hello world 1234567').buffer, options: opts }));
})();
