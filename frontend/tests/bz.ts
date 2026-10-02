import fs from 'fs';
import { importFile } from '../src/lib/import/importFile.ts';
(async () => { const b = fs.readFileSync(new URL('./fixtures/bazis-sample.json', import.meta.url)); const r: any = await importFile({ fileName: 'x.json', bytes: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), options: { unit: 'auto', upAxis: 'auto', daeLevel: 'top' } });
 console.log(r.ok, r.result?.parts.map((p: any) => [p.name, p.kind, p.geom, p.dims.L, p.dims.W, p.dims.T, p.edgeText])); })();
