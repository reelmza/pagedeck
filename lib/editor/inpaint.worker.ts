/// <reference lib="webworker" />
import { inpaint, type Hole } from "./inpaint";

/** Runs the content-aware fill off the main thread, so the page never
 *  freezes while a patch is being computed. */
self.onmessage = (e: MessageEvent<{ id: number; data: Uint8ClampedArray; width: number; height: number; hole: Hole }>) => {
  const { id, data, width, height, hole } = e.data;
  try {
    const out = inpaint(data, width, height, hole);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, data: out }, [out.buffer]);
  } catch (err) {
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, error: String(err) });
  }
};
