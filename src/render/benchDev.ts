// Dev-only board benchmark (dev/bench.html): loads dev/board.html?board=sN&quality=Q&bench=1 in a
// frame for every scenario × quality, waits for the models, warms up, then measures frame times for a
// few seconds with the board drawing every frame (default camera, 4 heroes, every room revealed).
// At the end it shows a table and POSTs the JSON to /__bench, which the dev server writes to
// docs/tech/bench/<date>-<device>.json (vite.config.ts). An unfinished run resumes after a reload.
//   ?boards=s0,s1,…  ?qualities=low,medium,high  ?warm=3  ?secs=5  ?device=ipad-air-m2  ?auto=1

import { readDeviceInfo, GRAPHICS_QUALITIES, type GraphicsQuality } from './quality';
import { PERF_BUDGET, type PerfBreakdown } from './perfStats';

interface Run {
  board: string;
  quality: GraphicsQuality;
  /** Average frames per second over the measured seconds. */
  fps: number;
  /** The 5th percentile: fps of the slowest 5 % of frames. */
  p5: number;
  frames: number;
  calls: number;
  tris: number;
  /** Drawing buffer in device pixels and the pixel ratio the board used. */
  canvas: [number, number];
  pixelRatio: number;
  env: Record<string, unknown>;
  perf?: PerfBreakdown;
  error?: string;
}

interface Saved {
  device: string;
  started: string;
  plan: { board: string; quality: GraphicsQuality }[];
  runs: Run[];
}

interface BoardWindow extends Window {
  board?: {
    spin(on: boolean): void;
    stats(): { fps: number; calls: number; triangles: number };
    environment(): Record<string, unknown>;
  };
  devBoard?: { modelsReady(timeoutMs?: number): Promise<void>; perf?(): PerfBreakdown };
}

const params = new URLSearchParams(location.search);
const BOARDS = (params.get('boards') ?? 's0,s1,s2,s3,s4,s5,s6,s7,s8,s9,s10').split(',').filter(Boolean);
const QUALITIES = (params.get('qualities') ?? 'low,medium,high').split(',').filter((q): q is GraphicsQuality => (GRAPHICS_QUALITIES as readonly string[]).includes(q));
const WARM = Number(params.get('warm') ?? 3);
const SECS = Number(params.get('secs') ?? 5);
const KEY = 'vidvazhni.bench';

const frame = document.getElementById('frame') as HTMLIFrameElement;
const bar = document.getElementById('bar')!;
const start = document.getElementById('start')!;
const result = document.getElementById('result')!;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function load(): Saved | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
  } catch {
    return null;
  }
}

function save(s: Saved | null): void {
  try {
    if (s) localStorage.setItem(KEY, JSON.stringify(s));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: no resume after a reload.
  }
}

function guessDevice(): string {
  const ua = navigator.userAgent;
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 0)) return 'ipad';
  if (/iPhone/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'android-phone' : 'android-tablet';
  return 'pc';
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'device';
}

function status(text: string): void {
  bar.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = text;
  bar.appendChild(span);
}

/** Frees the last board's WebGL context now: a page unloaded in a frame keeps it until garbage
 *  collection, and after a few dozen boards the browser loses contexts and blocks WebGL for the site. */
function release(): void {
  const win = frame.contentWindow as (BoardWindow & { board?: { dispose?(): void } }) | null;
  try {
    const canvases = [...(win?.document.querySelectorAll('canvas') ?? [])];
    win?.board?.dispose?.();
    for (const c of canvases) {
      const gl = (c.getContext('webgl2') ?? c.getContext('webgl')) as WebGLRenderingContext | null;
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    // A page from another origin or one that never started: nothing to free.
  }
}

/** Loads one board in the frame and resolves with its window once the models are in. A page that
 *  does not start (the dev server re-optimising its dependencies answers 504 once) is reloaded. */
async function openBoard(board: string, quality: GraphicsQuality): Promise<BoardWindow> {
  const url = `board.html?board=${board}&quality=${quality}&bench=1`;
  for (let attempt = 0; attempt < 3; attempt++) {
    release();
    await new Promise<void>((resolve) => {
      frame.onload = () => resolve();
      frame.src = attempt ? `${url}&try=${attempt}` : url;
    });
    const win = frame.contentWindow as BoardWindow;
    for (let i = 0; i < 300 && !(win.board && win.devBoard); i++) await sleep(100);
    if (!win.board || !win.devBoard) continue;
    await win.devBoard.modelsReady(20000);
    return win;
  }
  throw new Error('board did not start');
}

/** Draws every frame: warm-up until the scene holds still, then measures. "Still" is the same
 *  triangle count and no new shader programs for 3 s: kits keep arriving after the models, and each
 *  new material compiles its shaders on first draw (seconds per frame on a tablet). */
async function measure(win: BoardWindow, run: Pick<Run, 'board' | 'quality'>, label: string): Promise<Run> {
  const board = win.board!;
  board.spin(true);
  const warmEnd = performance.now() + WARM * 1000;
  let last = '';
  let stableSince = performance.now();
  while (performance.now() < warmEnd || performance.now() - stableSince < 3000) {
    const tris = board.stats().triangles;
    const programs = win.devBoard?.perf?.().programs ?? 0;
    const now = `${tris}:${programs}`;
    if (now !== last) {
      last = now;
      stableSince = performance.now();
    }
    if (performance.now() > warmEnd + 30000) break;
    status(`${label}  розігрів…  tris ${tris}  shaders ${programs}`);
    await sleep(250);
  }
  const times: number[] = [];
  const calls: number[] = [];
  const tris: number[] = [];
  await new Promise<void>((resolve) => {
    // Ends on a timer too: a hidden page gets no animation frames at all.
    let done = false;
    setTimeout(() => {
      done = true;
      resolve();
    }, SECS * 1000);
    let sampled = 0;
    const tick = (t: number) => {
      if (done) return;
      times.push(t);
      if (t - sampled > 250) {
        sampled = t;
        const st = board.stats();
        calls.push(st.calls);
        tris.push(st.triangles);
        status(`${label}  вимірюю…  fps ${st.fps || '—'}  calls ${st.calls}  tris ${st.triangles}`);
      }
      win.requestAnimationFrame(tick);
    };
    win.requestAnimationFrame(tick);
  });
  board.spin(false);
  const deltas = times.slice(1).map((t, i) => t - times[i]!).sort((a, b) => a - b);
  const total = times.length > 1 ? times[times.length - 1]! - times[0]! : 0;
  const p95 = deltas[Math.min(deltas.length - 1, Math.floor(deltas.length * 0.95))] ?? 0;
  // The board's canvas is the biggest one (icons and HUD bits may draw on small ones).
  const canvas = [...win.document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height)[0];
  const perf = steadyPerf(win);
  return {
    ...run,
    fps: total > 0 ? round1(((times.length - 1) * 1000) / total) : 0,
    p5: round1(p95 > 0 ? 1000 / p95 : 0),
    frames: times.length,
    // A page that drew no frames (hidden) has no samples: the captured frame stands in.
    calls: median(calls) || perf?.total.calls || 0,
    tris: median(tris) || perf?.total.tris || 0,
    canvas: [canvas?.width ?? 0, canvas?.height ?? 0],
    pixelRatio: canvas && canvas.clientWidth ? round1((canvas.width / canvas.clientWidth) * 100) / 100 : 0,
    env: board.environment(),
    perf,
  };
}

/** The second capture: the first may include a lamp shadow map drawn once after a change. */
function steadyPerf(win: BoardWindow): PerfBreakdown | undefined {
  win.devBoard?.perf?.();
  return win.devBoard?.perf?.();
}

const round1 = (x: number) => Math.round(x * 10) / 10;
function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)] ?? 0;
}

async function runAll(saved: Saved): Promise<void> {
  start.hidden = true;
  result.hidden = true;
  try {
    await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<unknown> } }).wakeLock?.request('screen');
  } catch {
    // No wake lock: the tablet's auto-lock may pause the run; it resumes after a reload.
  }
  for (let i = saved.runs.length; i < saved.plan.length; i++) {
    const job = saved.plan[i]!;
    const label = `${i + 1}/${saved.plan.length}  ${job.board} ${job.quality}`;
    status(`${label}  завантаження…`);
    let run: Run;
    try {
      const win = await openBoard(job.board, job.quality);
      run = await measure(win, job, label);
    } catch (err) {
      run = { ...job, fps: 0, p5: 0, frames: 0, calls: 0, tris: 0, canvas: [0, 0], pixelRatio: 0, env: {}, error: String(err) };
    }
    saved.runs.push(run);
    save(saved);
  }
  release();
  frame.src = 'about:blank';
  bar.innerHTML = '';
  await finish(saved);
}

async function finish(saved: Saved): Promise<void> {
  const report = {
    device: saved.device,
    started: saved.started,
    finished: new Date().toISOString(),
    userAgent: navigator.userAgent,
    gpu: readDeviceInfo().gpu,
    devicePixelRatio: window.devicePixelRatio,
    screen: [screen.width, screen.height],
    settings: { warm: WARM, secs: SECS },
    runs: saved.runs,
  };
  let where = '';
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}__bench`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(report) });
    where = res.ok ? `Збережено: ${(await res.json()).file}` : `Сервер не зберіг (${res.status})`;
  } catch (err) {
    where = `Сервер не зберіг: ${String(err)}`;
  }
  save(null);
  showTable(report.runs, `${saved.device} · ${report.gpu} · DPR ${report.devicePixelRatio}`, where, report);
}

function showTable(runs: Run[], title: string, where: string, report: unknown): void {
  result.hidden = false;
  result.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = 'Результат';
  const sub = document.createElement('div');
  sub.className = 'muted';
  sub.textContent = `${title}\n${where}`;
  sub.style.whiteSpace = 'pre-wrap';
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>місія</th><th>якість</th><th>fps</th><th>p5</th><th>calls</th><th>tris</th><th>canvas</th></tr>';
  for (const r of runs) {
    const budget = PERF_BUDGET[r.quality];
    const tr = document.createElement('tr');
    const cell = (text: string, cls = '') => {
      const td = document.createElement('td');
      td.textContent = text;
      if (cls) td.className = cls;
      tr.appendChild(td);
    };
    cell(r.board);
    cell(r.quality);
    cell(r.error ? 'помилка' : String(r.fps), r.error ? 'bad' : r.fps >= 30 ? 'ok' : 'bad');
    cell(String(r.p5));
    cell(String(r.calls), r.calls > budget.calls ? 'bad' : 'ok');
    cell(r.tris.toLocaleString('uk'), r.tris > budget.tris ? 'bad' : 'ok');
    cell(`${r.canvas[0]}×${r.canvas[1]}`);
    table.appendChild(tr);
  }
  const again = document.createElement('button');
  again.textContent = 'Ще раз';
  again.onclick = () => location.reload();
  const copy = document.createElement('button');
  copy.textContent = 'Копіювати JSON';
  copy.onclick = () => void navigator.clipboard?.writeText(JSON.stringify(report, null, 1));
  result.append(h, sub, table, again, document.createTextNode(' '), copy);
}

function showStart(): void {
  const previous = load();
  start.innerHTML = '';
  const h = document.createElement('h2');
  h.textContent = 'Бенчмарк дошки';
  h.style.margin = '0';
  const about = document.createElement('div');
  about.className = 'muted';
  about.textContent = `${BOARDS.length} місій × ${QUALITIES.join('/')} — по ~${WARM + SECS} с кожна після завантаження (усього ~${Math.ceil((BOARDS.length * QUALITIES.length * (WARM + SECS + 8)) / 60)} хв). Не чіпай екран, поки йде заміряння.`;
  const input = document.createElement('input');
  input.value = params.get('device') ?? previous?.device ?? guessDevice();
  input.setAttribute('aria-label', 'Пристрій');
  const go = document.createElement('button');
  go.className = 'go';
  go.textContent = 'Почати';
  go.onclick = () => {
    const plan = BOARDS.flatMap((board) => QUALITIES.map((quality) => ({ board, quality })));
    const saved: Saved = { device: slug(input.value), started: new Date().toISOString(), plan, runs: [] };
    save(saved);
    void runAll(saved);
  };
  start.append(h, about, input, go);
  if (previous && previous.runs.length < previous.plan.length) {
    const resume = document.createElement('button');
    resume.textContent = `Продовжити (${previous.runs.length}/${previous.plan.length})`;
    resume.onclick = () => void runAll(previous);
    start.appendChild(resume);
  }
  if (params.get('auto') === '1') go.click();
}

showStart();
