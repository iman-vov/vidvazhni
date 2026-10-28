// The campaign map (docs/design/camp.md, step 15 «вибір наступного сценарію»): the painted map from
// art/ui-mockups/campaign-map/v2.png on a table, in the slate-and-gold frame with a thin parchment
// edge. Mission markers come from data/campaign-map.json and their state from the campaign
// (src/rules/campaignMap.ts): won, available (pulsing), closed by a choice (grey route), unknown («?»).
// Tapping a marker opens a panel with the name, the first narrator line of the story, the objective
// and [Почати] (or [Переграти] for a won mission; a lost one simply stays available). The map pans
// and zooms inside the frame: drag, pinch, wheel or the ± buttons.

import mapData from '../../../data/campaign-map.json';
import { playableScenarios, setupFromCampaign, type CampaignState } from '../../rules/campaign';
import { markerStates, routeStates, type CampaignMapDef, type MapMarker, type MarkerState } from '../../rules/campaignMap';
import type { LoadedContent } from '../../rules/load';
import type { GameSetup } from '../../rules/state';
import { getGraphicsQuality } from '../../render/quality';
import { h } from '../../ui/dom';
import { getLang, has, t } from '../../ui/i18n';
import { icon, type IconName } from '../../ui/game/icons';
import mapFull from '../../ui/game/assets/campaign-map.webp';
import mapLow from '../../ui/game/assets/campaign-map-lo.webp';
import { settings } from '../settings';
import { artButton } from './menu';
import './campaignMap.css';

export const CAMPAIGN_MAP = mapData as CampaignMapDef;

export interface CampaignMapOptions {
  content: LoadedContent;
  campaign: CampaignState;
  onMission: (setup: GameSetup) => void;
  onCamp: () => void;
  onMenu: () => void;
}

const GOAL_ICONS: Record<string, IconName> = {
  killAll: 'attack',
  reachExit: 'objective-flag',
  killBoss: 'elite',
  carryItem: 'loot',
  survive: 'hp',
  defend: 'defend-point',
  escort: 'escort',
  race: 'jump',
  protect: 'shield',
  objectStates: 'lever',
};

const MARKER_ICONS: Partial<Record<MarkerState, IconName>> = { completed: 'check', available: 'objective-flag', locked: 'close' };

type StoryFile = { scenarios: Record<string, { intro?: { speaker: string; text: string }[] }> };
const STORIES = import.meta.glob<StoryFile>('../../../data/story/*.json', { import: 'default' });

/** The first narrator line of a scenario's intro, in the current language (uk as a fallback). */
async function introLine(id: string): Promise<string> {
  for (const lang of [getLang(), 'uk']) {
    const load = STORIES[`../../../data/story/${lang}.json`];
    const intro = load ? (await load()).scenarios[id]?.intro : undefined;
    const line = intro?.find((l) => l.speaker === 'narrator') ?? intro?.[0];
    if (line) return line.text;
  }
  return '';
}

const MIN_DRAG = 6;
const MAX_ZOOM = 3;

export function campaignMapScreen(o: CampaignMapOptions): HTMLElement {
  const map = CAMPAIGN_MAP;
  const W = map.image.width;
  const H = map.image.height;
  const states = markerStates(map, o.campaign);
  const routes = routeStates(map, states);
  const byId = new Map(map.markers.map((m) => [m.id, m]));
  let selected: string | null = null;
  let message = '';

  const nameOf = (m: MapMarker) => (has(`scenario.${m.id}`) ? t(`scenario.${m.id}`) : t(`map.region.${m.region}`));

  // ─── Map: art, routes, markers ───
  const routeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  routeSvg.setAttribute('class', 'gmap-routes');
  routeSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  routeSvg.setAttribute('aria-hidden', 'true');
  map.links.forEach(([a, b], i) => {
    const from = byId.get(a);
    const to = byId.get(b);
    if (!from || !to || routes[i] === 'hidden') return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('class', `gmap-route is-${routes[i]}`);
    line.setAttribute('x1', String(from.x * W));
    line.setAttribute('y1', String(from.y * H));
    line.setAttribute('x2', String(to.x * W));
    line.setAttribute('y2', String(to.y * H));
    routeSvg.append(line);
  });

  const markers = map.markers
    .filter((m) => states[m.id] !== 'hidden')
    .map((m) => {
      const state = states[m.id] as MarkerState;
      const iconName = MARKER_ICONS[state];
      const label = state === 'unknown' ? t('map.unknown') : `${nameOf(m)} · ${t(`map.state.${state}`)}`;
      return h(
        'button',
        { class: `gmap-marker is-${state}`, style: `left: ${m.x * 100}%; top: ${m.y * 100}%`, 'aria-label': label, title: label, 'data-id': m.id, onclick: () => select(m.id) },
        h('span', { class: 'gmap-pin' }, iconName ? icon(iconName) : h('b', null, '?')),
        state === 'available' ? h('span', { class: 'gmap-tag' }, nameOf(m)) : null,
      );
    });

  const img = h('img', { class: 'gmap-art', src: getGraphicsQuality() === 'low' ? mapLow : mapFull, width: W, height: H, alt: t('map.alt'), draggable: 'false' });
  const stage = h('div', { class: 'gmap-stage', style: `width: ${W}px; height: ${H}px` }, img, routeSvg, h('div', { class: 'gmap-markers' }, markers));
  const paper = h('div', { class: 'gmap-paper' }, stage);
  const panel = h('aside', { class: 'gmap-panel', 'aria-live': 'polite' });

  // ─── Pan and zoom ───
  let scale = 1;
  let minScale = 1;
  let tx = 0;
  let ty = 0;
  const size = () => ({ pw: paper.clientWidth, ph: paper.clientHeight });

  function apply(): void {
    const { pw, ph } = size();
    tx = W * scale <= pw ? (pw - W * scale) / 2 : Math.min(0, Math.max(pw - W * scale, tx));
    ty = H * scale <= ph ? (ph - H * scale) / 2 : Math.min(0, Math.max(ph - H * scale, ty));
    stage.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
    stage.style.setProperty('--s', String(scale));
  }

  /** Zoom to `next` keeping the map point under (px, py) in place. */
  function zoomAt(next: number, px: number, py: number): void {
    const s = Math.min(minScale * MAX_ZOOM, Math.max(minScale, next));
    tx = px - ((px - tx) / scale) * s;
    ty = py - ((py - ty) / scale) * s;
    scale = s;
    apply();
  }

  function centerOn(x: number, y: number): void {
    const { pw, ph } = size();
    tx = pw / 2 - x * W * scale;
    ty = ph / 2 - y * H * scale;
    apply();
  }

  let fitted = false;
  function fit(): void {
    const { pw, ph } = size();
    if (!pw || !ph) return;
    const prev = scale / minScale;
    minScale = Math.max(pw / W, ph / H);
    scale = minScale * (fitted ? prev : 1);
    if (!fitted) {
      fitted = true;
      const focus = map.markers.find((m) => states[m.id] === 'available') ?? map.markers[0];
      if (focus) return centerOn(focus.x, focus.y);
    }
    apply();
  }
  new ResizeObserver(fit).observe(paper);

  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let pinch = 0;
  paper.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = 0;
    if (pointers.size === 2) pinch = spread();
  });
  paper.addEventListener('pointermove', (e) => {
    const last = pointers.get(e.pointerId);
    if (!last) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved > MIN_DRAG && pointers.size === 1 && !paper.hasPointerCapture(e.pointerId)) paper.setPointerCapture(e.pointerId);
    if (pointers.size === 2) {
      const d = spread();
      const r = paper.getBoundingClientRect();
      const [p, q] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      if (pinch) zoomAt((scale * d) / pinch, (p.x + q.x) / 2 - r.left, (p.y + q.y) / 2 - r.top);
      pinch = d;
    } else if (moved > MIN_DRAG) {
      tx += dx;
      ty += dy;
      apply();
    }
  });
  const release = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    pinch = 0;
  };
  paper.addEventListener('pointerup', release);
  paper.addEventListener('pointercancel', release);
  // A drag must not count as a tap on the marker under the finger.
  paper.addEventListener('click', (e) => moved > MIN_DRAG && (e.stopPropagation(), e.preventDefault()), true);
  paper.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const r = paper.getBoundingClientRect();
      zoomAt(scale * (e.deltaY < 0 ? 1.15 : 1 / 1.15), e.clientX - r.left, e.clientY - r.top);
    },
    { passive: false },
  );
  function spread(): number {
    const [p, q] = [...pointers.values()];
    return p && q ? Math.hypot(p.x - q.x, p.y - q.y) : 0;
  }
  const zoomBy = (k: number) => {
    const { pw, ph } = size();
    zoomAt(scale * k, pw / 2, ph / 2);
  };

  // ─── Mission panel ───
  function start(id: string): void {
    const r = setupFromCampaign(o.campaign, id, { seed: Math.floor(Math.random() * 1_000_000_000), variants: settings.get().variants });
    if (r.ok) o.onMission(r.setup);
    else ((message = t('camp.error', { error: r.error })), renderPanel());
  }

  function select(id: string | null): void {
    selected = id;
    message = '';
    for (const el of markers) el.classList.toggle('is-selected', el.dataset.id === id);
    renderPanel();
  }

  function renderPanel(): void {
    const m = selected ? byId.get(selected) : undefined;
    if (!m) {
      panel.hidden = true;
      return panel.replaceChildren();
    }
    panel.hidden = false;
    // The card stands on the other side of the map from the marker, so it never hides it.
    panel.classList.toggle('is-left', m.x > 0.55);
    const state = states[m.id] as MarkerState;
    const scenario = o.content.scenarios[m.id];
    const goal = scenario?.goal.type;
    const playable = !!scenario && playableScenarios(o.campaign).includes(m.id);
    const intro = h('p', { class: 'gmap-intro' });
    if (state !== 'unknown' && state !== 'locked') void introLine(m.id).then((text) => (intro.textContent = text));
    panel.replaceChildren(
      h(
        'section',
        { class: 'gmap-card' },
        h('button', { class: 'gbtn gbtn-icon gmap-close', 'aria-label': t('map.close'), onclick: () => select(null) }, icon('close')),
        h('small', { class: 'gmap-region' }, t(`map.region.${m.region}`), ' · ', t(`map.state.${state}`)),
        h('h2', null, state === 'unknown' ? t('map.unknown') : nameOf(m)),
        state === 'unknown' ? h('p', { class: 'gmap-intro' }, t('map.unknown.text')) : state === 'locked' ? h('p', { class: 'gmap-intro' }, t('map.locked.text')) : intro,
        goal && state !== 'unknown' && state !== 'locked'
          ? h('p', { class: 'gmap-goal' }, icon(GOAL_ICONS[goal] ?? 'objective-flag'), h('span', null, has(`goal.type.${goal}`) ? t(`goal.type.${goal}`) : goal))
          : null,
        message ? h('p', { class: 'gmap-msg', role: 'status' }, message) : null,
        playable ? artButton('play', state === 'completed' ? t('map.replay') : t('map.start'), () => start(m.id), { cls: 'is-go' }) : null,
      ),
    );
  }

  const root = h(
    'div',
    { class: 'gmap' },
    h('div', { class: 'gmap-bg', 'aria-hidden': 'true' }),
    h(
      'header',
      { class: 'gmap-head' },
      h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('menu.back'), onclick: o.onMenu }, icon('left')),
      h('h1', null, t('map.title')),
      h('button', { class: 'gbtn gmap-camp', onclick: o.onCamp }, icon('chest'), ' ', t('map.camp')),
    ),
    h(
      'div',
      { class: 'gmap-view' },
      h(
        'div',
        { class: 'gmap-frame' },
        paper,
        h(
          'div',
          { class: 'gmap-zoom' },
          h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('map.zoomIn'), onclick: () => zoomBy(1.4) }, '+'),
          h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('map.zoomOut'), onclick: () => zoomBy(1 / 1.4) }, '−'),
        ),
      ),
      panel,
    ),
  );
  renderPanel();
  return root;
}
