/* Import Web Worker ichida bajariladi (TZ 5-bo'lim): asosiy oqim qotib qolmaydi. */
import { importFile, transferList, type ImportRequest } from './importFile';

// DOM va webworker tip kutubxonalari bir loyihada to'qnashmasligi uchun minimal tip
interface WorkerScope {
  onmessage: ((ev: MessageEvent<ImportRequest>) => void) | null;
  postMessage(msg: unknown, transfer?: Transferable[]): void;
}
const ctx = self as unknown as WorkerScope;

ctx.onmessage = async (ev: MessageEvent<ImportRequest>) => {
  const res = await importFile(ev.data);
  if (res.ok) ctx.postMessage(res, transferList(res.result));
  else ctx.postMessage(res);
};
