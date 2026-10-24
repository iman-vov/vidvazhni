// The camp between missions (docs/design/camp.md, art/ui-mockups/camp/v1.png): the heroes in their
// colours on the left, tabs and the chosen hero's gold on top, the hero's bust in the middle, the
// mission slots and the two chests below, [До місії ▸] with a summary in the corner. Tabs:
// «Спорядження», «Крамниця» (shop-v1.png: buy, sell, ★, slot filter, gifts) and «Рівень». Every
// change goes through the pure rules in src/rules/campaign.ts and is saved at once.

import { buy, canLevelUp, equip, giftGold, playableScenarios, sell, sellPrice, setupFromCampaign, shopStock, takeFromChest, unequip, upgrade, type CampaignHero, type CampaignResult, type CampaignState } from '../../rules/campaign';
import type { CampaignRules, ItemDef, ItemSlot } from '../../rules/content';
import { itemNameKey, UPGRADED } from '../../rules/items';
import type { LoadedContent } from '../../rules/load';
import type { GameSetup } from '../../rules/state';
import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { icon, type IconName } from '../../ui/game/icons';
import { stepLine } from '../../ui/game/text';
import { heroBustUrl, portraitUrl } from '../../ui/game/uiArt';
import { settings } from '../settings';
import type { SavedCampaign } from '../storage';
import { artButton } from './menu';
import './camp.css';

export interface CampOptions {
  content: LoadedContent;
  saved: SavedCampaign;
  onSave: (state: CampaignState) => void;
  onMission: (setup: GameSetup) => void;
  onNewCampaign: () => void;
  onMenu: () => void;
  /** [До місії ▸] opens the campaign map (src/app/screens/campaignMap.ts); without it, the summary. */
  onMap?: () => void;
}

type SlotGroup = keyof CampaignRules['slots'];
const SLOT_ORDER: SlotGroup[] = ['head', 'body', 'legs', 'hands', 'small'];
type Tab = 'gear' | 'shop' | 'level';
const TABS: { id: Tab; icon: IconName }[] = [
  { id: 'gear', icon: 'item' },
  { id: 'shop', icon: 'gold' },
  { id: 'level', icon: 'xp' },
];

const groupOf = (slot: ItemSlot): SlotGroup => (slot === 'hand' || slot === 'twoHands' ? 'hands' : slot);

export function campScreen(o: CampOptions): HTMLElement {
  const c = o.content;
  let state = o.saved.campaign;
  let chosen = state.heroes[0]?.classId ?? '';
  let tab: Tab = 'gear';
  let filter: SlotGroup | null = null;
  let summary = false;
  let confirmNew = false;
  let message = '';
  const root = h('div', { class: 'gcamp' });

  const hero = (): CampaignHero => state.heroes.find((x) => x.classId === chosen) ?? (state.heroes[0] as CampaignHero);
  const playerName = (id: string) => o.saved.players.find((p) => p.id === id)?.name ?? '';
  const plusOf = (x: CampaignHero, id: string) => !!x.owned.find((it) => it.id === id)?.plus;
  const nameOf = (id: string, plus = false) => t(itemNameKey(plus ? `${id}${UPGRADED}` : id));

  function change(r: CampaignResult): void {
    if (r.ok) {
      state = r.state;
      message = '';
      o.onSave(state);
    } else message = t('camp.error', { error: r.error });
    render();
  }

  function heroColumn(): HTMLElement {
    return h(
      'nav',
      { class: 'gcamp-heroes', 'aria-label': t('camp.heroes') },
      state.heroes.map((x) => {
        const url = portraitUrl(x.classId);
        return h(
          'button',
          { class: 'gcamp-hero', 'aria-pressed': String(x.classId === chosen), style: `--hero: ${c.heroes[x.classId]?.color ?? '#888'}`, onclick: () => ((chosen = x.classId), (message = ''), render()) },
          h('span', { class: 'gcamp-portrait', 'aria-hidden': 'true' }, url ? h('img', { src: url, alt: '', draggable: 'false' }) : null),
          h(
            'span',
            { class: 'gcamp-hero-text' },
            h('b', null, t(`class.${x.classId}`)),
            h('small', null, [playerName(x.playerId), t('camp.level', { level: x.level })].filter(Boolean).join(' · ')),
          ),
          canLevelUp(c, x) ? h('span', { class: 'gcamp-levelup', title: t('camp.levelUp') }, icon('xp')) : null,
        );
      }),
      h(
        'button',
        { class: `gbtn gcamp-new${confirmNew ? ' is-warn' : ''}`, onclick: () => (confirmNew ? o.onNewCampaign() : ((confirmNew = true), render())) },
        confirmNew ? t('camp.newCampaign.confirm') : t('campaign.new'),
      ),
    );
  }

  function topBar(): HTMLElement {
    return h(
      'div',
      { class: 'gcamp-top' },
      h(
        'div',
        { class: 'gcamp-tabs', role: 'tablist' },
        TABS.map((it) =>
          h(
            'button',
            { class: 'gcamp-tab', role: 'tab', 'aria-selected': String(it.id === tab), disabled: it.id === 'level', title: it.id === 'level' ? t('camp.soon') : null, onclick: () => ((tab = it.id), (message = ''), render()) },
            icon(it.icon),
            h('span', null, t(`camp.tab.${it.id}`)),
          ),
        ),
      ),
      h('div', { class: 'gcamp-gold', title: t('camp.gold') }, icon('gold'), h('span', null, t('camp.gold')), h('b', null, hero().gold)),
    );
  }

  function stage(): HTMLElement {
    const x = hero();
    const url = heroBustUrl(x.classId);
    const need = c.campaign.xpByLevel[x.level];
    return h(
      'div',
      { class: 'gcamp-stage', style: `--hero: ${c.heroes[x.classId]?.color ?? '#888'}` },
      url ? h('img', { class: 'gcamp-bust', src: url, alt: '', draggable: 'false' }) : null,
      h(
        'div',
        { class: 'gcamp-plate' },
        h('h2', null, t(`class.${x.classId}`)),
        h('span', null, t('camp.level', { level: x.level }), ' · ', icon('xp'), ' ', need !== undefined ? `${x.xp} / ${need}` : x.xp),
      ),
    );
  }

  /** The mission slots in order; a two-handed item fills both hands. */
  function slots(): HTMLElement {
    const x = hero();
    const boxes: HTMLElement[] = [];
    for (const group of SLOT_ORDER) {
      const items = x.equipped.map((id) => c.items[id]).filter((it): it is ItemDef => !!it && groupOf(it.slot) === group);
      const filled: (ItemDef | null)[] = [];
      for (const it of items) for (let i = 0; i < (it.slot === 'twoHands' ? 2 : 1); i++) filled.push(it);
      for (let i = 0; i < c.campaign.slots[group]; i++) {
        const it = filled[i] ?? null;
        const label = t(`camp.slot.${group}`);
        boxes.push(
          it
            ? h(
                'button',
                { class: `gcamp-slot is-full${plusOf(x, it.id) ? ' is-plus' : ''}`, title: t('camp.unequip'), onclick: () => change(unequip(state, x.classId, it.id)) },
                icon('item'),
                h('b', null, nameOf(it.id, plusOf(x, it.id))),
                h('small', null, label),
              )
            : h('div', { class: 'gcamp-slot' }, icon('item'), h('small', null, label)),
        );
      }
    }
    return h('div', { class: 'gcamp-slots', 'aria-label': t('camp.slots') }, boxes);
  }

  function itemChip(id: string, plus: boolean, onclick: (() => void) | null, note?: string): HTMLElement {
    const def = c.items[id];
    return h(
      'button',
      { class: `gcamp-item${plus ? ' is-plus' : ''}`, disabled: !onclick, onclick: onclick ?? undefined },
      h('b', null, nameOf(id, plus)),
      h('small', null, note ?? (def ? `${t(`slot.${def.slot}`)} · ${t(`use.${def.use}`)}` : '')),
    );
  }

  function chests(): HTMLElement {
    const x = hero();
    const inChest = x.owned.filter((it) => !x.equipped.includes(it.id));
    return h(
      'div',
      { class: 'gcamp-chests' },
      h(
        'section',
        { class: 'gcamp-panel' },
        h('h3', null, icon('chest'), ' ', t('camp.heroChest')),
        inChest.length
          ? h('div', { class: 'gcamp-items' }, inChest.map((it) => itemChip(it.id, it.plus, () => change(equip(c, state, x.classId, it.id)))))
          : h('p', { class: 'gcamp-empty' }, t('camp.heroChest.empty')),
      ),
      h(
        'section',
        { class: 'gcamp-panel' },
        h('h3', null, icon('chest'), ' ', t('camp.partyChest')),
        state.partyChest.length
          ? h(
              'div',
              { class: 'gcamp-items' },
              state.partyChest.map((id) => {
                const has = x.owned.some((it) => it.id === id);
                return itemChip(id, false, has ? null : () => change(takeFromChest(state, x.classId, id)), has ? t('camp.alreadyOwned') : t('camp.take'));
              }),
            )
          : h('p', { class: 'gcamp-empty' }, t('camp.partyChest.empty')),
      ),
    );
  }

  /** One shop card: name, effect in words, slot, and [Купити] or [★] [Продати] for an owned item. */
  function shopCard(x: CampaignHero, it: ItemDef): HTMLElement {
    const owned = x.owned.find((o) => o.id === it.id);
    const orbs = settings.get().variants.orbs;
    const effectOf = (steps: ItemDef['effect']) => steps.map((st) => stepLine(st, orbs)).join('; ');
    const up = it.upgrade;
    const effect = owned?.plus && up ? (orbs && up.forkEffect ? up.forkEffect : up.effect) : orbs && it.forkEffect ? it.forkEffect : it.effect;
    return h(
      'article',
      { class: `gcamp-ware${owned ? ' is-owned' : ''}${owned?.plus ? ' is-plus' : ''}` },
      h('div', { class: 'gcamp-ware-head' }, icon('item'), h('b', null, nameOf(it.id, !!owned?.plus))),
      h('p', { class: 'gcamp-ware-effect' }, effectOf(effect)),
      h('small', null, `${t(`slot.${it.slot}`)} · ${t(`use.${it.use}`)}`),
      owned && !owned.plus && up ? h('small', { class: 'gcamp-ware-up' }, icon('up'), ' ', effectOf(orbs && up.forkEffect ? up.forkEffect : up.effect)) : null,
      h(
        'div',
        { class: 'gcamp-ware-foot' },
        owned
          ? [
              up && !owned.plus
                ? h('button', { class: 'gbtn gcamp-buy is-up', disabled: x.gold < up.price, title: t('camp.shop.upgrade'), onclick: () => change(upgrade(c, state, x.classId, it.id)) }, icon('up'), t('camp.shop.upgrade'), ' ', icon('gold'), up.price)
                : null,
              h('button', { class: 'gbtn gcamp-buy is-sell', onclick: () => change(sell(c, state, x.classId, it.id)) }, t('camp.shop.sell'), ' ', icon('gold'), sellPrice(c, it, owned.plus)),
            ]
          : h('button', { class: 'gbtn gcamp-buy', disabled: x.gold < it.price, onclick: () => change(buy(c, state, x.classId, it.id)) }, t('camp.shop.buy'), ' ', icon('gold'), it.price),
      ),
    );
  }

  /** «Крамниця»: the slot filter, the wares, and «Подарувати» to another hero. */
  function shop(): HTMLElement {
    const x = hero();
    const fits = (it: ItemDef) => !filter || groupOf(it.slot) === filter;
    const stock = shopStock(c, state);
    // Owned items not on sale yet (taken from the party chest) can still be sold or upgraded here.
    const extra = x.owned.map((o) => c.items[o.id]).filter((it): it is ItemDef => !!it && !stock.includes(it));
    const wares = [...stock, ...extra].filter(fits);
    const others = state.heroes.filter((y) => y.classId !== x.classId);
    const step = c.campaign.giftStep;
    return h(
      'div',
      { class: 'gcamp-shop' },
      h(
        'div',
        { class: 'gcamp-filter', role: 'group', 'aria-label': t('camp.shop.filter') },
        ([null, ...SLOT_ORDER] as (SlotGroup | null)[]).map((g) =>
          h('button', { class: 'gcamp-chip', 'aria-pressed': String(filter === g), onclick: () => ((filter = g), render()) }, g ? t(`camp.slot.${g}`) : t('camp.shop.all')),
        ),
      ),
      message ? h('p', { class: 'gcamp-msg', role: 'status' }, message) : null,
      wares.length ? h('div', { class: 'gcamp-wares' }, wares.map((it) => shopCard(x, it))) : h('p', { class: 'gcamp-empty' }, t('camp.shop.empty')),
      others.length
        ? h(
            'section',
            { class: 'gcamp-panel gcamp-gift' },
            h('h3', null, icon('gold'), ' ', t('camp.gift.title', { n: step })),
            h(
              'div',
              { class: 'gcamp-items' },
              others.map((y) =>
                h(
                  'button',
                  { class: 'gcamp-item gcamp-gift-to', style: `--hero: ${c.heroes[y.classId]?.color ?? '#888'}`, disabled: x.gold < step, onclick: () => change(giftGold(c, state, x.classId, y.classId)) },
                  h('b', null, t(`class.${y.classId}`)),
                  h('small', null, icon('gold'), ' ', y.gold),
                ),
              ),
            ),
          )
        : null,
    );
  }

  function nextScenario(): string | undefined {
    return playableScenarios(state)[0];
  }

  function startMission(): void {
    const id = nextScenario();
    if (!id) return;
    const r = setupFromCampaign(state, id, { seed: Math.floor(Math.random() * 1_000_000_000), variants: settings.get().variants });
    if (r.ok) o.onMission(r.setup);
    else ((message = t('camp.error', { error: r.error })), render());
  }

  /** [До місії ▸]: who goes with what, then the start. */
  function summaryDialog(): HTMLElement {
    const id = nextScenario();
    return h(
      'div',
      { class: 'gcamp-dialog', role: 'dialog', 'aria-modal': 'true', onclick: (e: Event) => e.target === e.currentTarget && ((summary = false), render()) },
      h(
        'section',
        { class: 'gcamp-panel gcamp-summary' },
        h('h2', null, t('camp.summary.title')),
        h('p', { class: 'gcamp-mission' }, id ? t('camp.summary.mission', { name: t(`scenario.${id}`) }) : t('camp.summary.none')),
        h(
          'ul',
          null,
          state.heroes.map((x) =>
            h(
              'li',
              { style: `--hero: ${c.heroes[x.classId]?.color ?? '#888'}` },
              h('span', { class: 'gcamp-portrait is-small', 'aria-hidden': 'true' }, portraitUrl(x.classId) ? h('img', { src: portraitUrl(x.classId), alt: '' }) : null),
              h('b', null, t(`class.${x.classId}`)),
              h('span', null, x.equipped.length ? x.equipped.map((it) => nameOf(it, plusOf(x, it))).join(', ') : t('camp.summary.noItems')),
              h('span', { class: 'gcamp-summary-gold' }, icon('gold'), ' ', x.gold),
            ),
          ),
        ),
        h(
          'div',
          { class: 'gcamp-summary-foot' },
          h('button', { class: 'gbtn', onclick: () => ((summary = false), render()) }, icon('left'), ' ', t('camp.summary.back')),
          artButton('play', t('camp.summary.start'), startMission, { cls: 'is-go', disabled: !id }),
        ),
      ),
    );
  }

  function render(): void {
    root.replaceChildren(
      h('div', { class: 'gcamp-bg', 'aria-hidden': 'true' }),
      h(
        'header',
        { class: 'gcamp-head' },
        h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('menu.back'), onclick: o.onMenu }, icon('left')),
        h('h1', null, t('camp.title')),
      ),
      heroColumn(),
      topBar(),
      stage(),
      h('div', { class: 'gcamp-marta', 'aria-hidden': 'true' }, h('span', null, t('camp.marta'))),
      tab === 'shop'
        ? h('div', { class: 'gcamp-gear' }, shop())
        : h('div', { class: 'gcamp-gear' }, slots(), message ? h('p', { class: 'gcamp-msg', role: 'status' }, message) : h('p', { class: 'gcamp-hint' }, t('camp.hint')), chests()),
      h('div', { class: 'gcamp-go' }, artButton('compass', t('camp.toMission'), () => (o.onMap ? o.onMap() : ((summary = true), render())), { cls: 'is-go' })),
      summary ? summaryDialog() : '',
    );
  }

  render();
  return root;
}
