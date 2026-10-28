// The camp between missions (docs/design/camp.md, art/ui-mockups/camp/v1.png): the heroes in their
// colours on the left, tabs and the chosen hero's gold on top, the hero's bust in the middle, the
// mission slots and the two chests below, [До місії ▸] with a summary in the corner. Tabs:
// «Спорядження», «Крамниця» (shop-v1.png: buy, sell, ★, slot filter, gifts) and «Рівень»
// (level-v1.png: +health, 1 of 2 new cards, a perk with the modifier deck before and after, and
// «Карти на місію» when the card pool is larger than the hand). Every
// change goes through the pure rules in src/rules/campaign.ts and is saved at once.

import { availablePerks, buy, canLevelUp, cardPool, equip, giftGold, levelUp, levelUpCards, pickHand, playableScenarios, sell, sellPrice, setupFromCampaign, shopStock, takeFromChest, unequip, upgrade, type CampaignHero, type CampaignResult, type CampaignState } from '../../rules/campaign';
import type { CampaignRules, ItemDef, ItemSlot } from '../../rules/content';
import { itemNameKey, UPGRADED } from '../../rules/items';
import { perkedCards } from '../../rules/modifiers';
import type { LoadedContent } from '../../rules/load';
import type { GameSetup, GameState, HeroState } from '../../rules/state';
import { cardView, compactCard } from '../../ui/game/card';
import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { icon, type IconName } from '../../ui/game/icons';
import { modifierLabel, stepLine } from '../../ui/game/text';
import { campHeroUrl, heroBustUrl, portraitUrl } from '../../ui/game/uiArt';
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
  // «Рівень»: the wizard's choices and the hand being picked, for the chosen hero.
  let newCard: string | null = null;
  let newPerk: string | null = null;
  let hand: string[] | null = null;
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
          { class: 'gcamp-hero', 'aria-pressed': String(x.classId === chosen), style: `--hero: ${c.heroes[x.classId]?.color ?? '#888'}`, onclick: () => ((chosen = x.classId), (message = ''), (newCard = newPerk = null), (hand = null), render()) },
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
            { class: 'gcamp-tab', role: 'tab', 'aria-selected': String(it.id === tab), onclick: () => ((tab = it.id), (message = ''), render()) },
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
    const url = campHeroUrl(x.classId) ?? heroBustUrl(x.classId);
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
          : h('button', { class: 'gbtn gcamp-buy', 'data-sound': 'coins', disabled: x.gold < it.price, onclick: () => change(buy(c, state, x.classId, it.id)) }, t('camp.shop.buy'), ' ', icon('gold'), it.price),
      ),
    );
  }

  /** «Крамниця»: the slot filter, the wares, and «Подарувати» to another hero. */
  function shop(): HTMLElement {
    const x = hero();
    const fits = (it: ItemDef) => !filter || groupOf(it.slot) === filter;
    const stock = shopStock(c, state, settings.get().variants);
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

  /** The modifier deck as chips «+1 ×5» (the infusing +1 with its icon). */
  function deckView(cards: string[], fresh: string[] = []): HTMLElement {
    const counts = new Map<string, number>();
    for (const id of cards) counts.set(id, (counts.get(id) ?? 0) + 1);
    const order = ['+2', '+1', '+1:infuse', '+0', '-1', '-2', 'x2', 'miss'];
    const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length);
    const ids = [...counts.keys()].sort((a, b) => rank(a) - rank(b));
    return h(
      'div',
      { class: 'gcamp-deck' },
      ids.map((id) =>
        h(
          'span',
          { class: `gcamp-mod${fresh.includes(id) ? ' is-new' : ''}` },
          h('b', null, modifierLabel(id)),
          id.endsWith(':infuse') ? icon('infuse') : null,
          h('small', null, `×${counts.get(id)}`),
        ),
      ),
    );
  }

  const perkOps = (ids: string[]) => ids.flatMap((id) => c.perks[id]?.ops ?? []);

  /** «Рівень»: the wizard when there is enough XP, else the progress and the current perks. */
  function level(): HTMLElement {
    const x = hero();
    const cls = c.heroes[x.classId];
    const before = perkedCards(perkOps(x.perks));
    const parts: (HTMLElement | null)[] = [message ? h('p', { class: 'gcamp-msg', role: 'status' }, message) : null];
    if (canLevelUp(c, x)) {
      const cards = levelUpCards(c, x);
      const perks = availablePerks(c, x);
      const after = newPerk ? perkedCards(perkOps([...x.perks, newPerk])) : before;
      const fresh = after.filter((id) => after.filter((y) => y === id).length > before.filter((y) => y === id).length);
      const ready = (!cards.length || !!newCard) && (!perks.length || !!newPerk);
      const fake = { variants: settings.get().variants } as GameState;
      const owner = { classId: x.classId } as HeroState;
      const color = cls?.color ?? '#888';
      parts.push(
        h(
          'div',
          { class: 'gcamp-panel gcamp-lvl-head' },
          h('h3', null, icon('xp'), ' ', t('camp.lvl.title', { level: x.level + 1 })),
          h('span', null, icon('hp'), ' ', t('camp.lvl.hp', { from: cls?.hpByLevel[x.level - 1] ?? '', to: cls?.hpByLevel[x.level] ?? '' })),
          h('button', { class: 'gbtn gbtn-primary gcamp-lvl-ok', 'data-sound': 'levelUp', disabled: !ready, onclick: () => {
                const choice = { card: newCard ?? undefined, perk: newPerk ?? undefined };
                newCard = newPerk = null;
                change(levelUp(c, state, x.classId, choice));
              },
            }, icon('check'), ' ', t('camp.lvl.confirm')),
        ),
        h(
          'div',
          { class: 'gcamp-lvl' },
          cards.length
            ? h(
                'section',
                { class: 'gcamp-panel gcamp-lvl-cards' },
                h('h3', null, t('camp.lvl.card')),
                h(
                  'div',
                  { class: 'gcamp-lvl-pair' },
                  cards.map((id) =>
                    h(
                      'div',
                      { class: 'gcamp-lvl-card' },
                      cardView({ s: fake, content: c, hero: owner, cardId: id, accent: color, picked: newCard === id }),
                      h('button', { class: `gbtn${newCard === id ? ' gbtn-primary' : ''}`, 'aria-pressed': String(newCard === id), onclick: () => ((newCard = id), render()) }, newCard === id ? icon('check') : null, ' ', t('camp.lvl.pick')),
                    ),
                  ),
                ),
              )
            : null,
          h(
            'section',
            { class: 'gcamp-panel gcamp-lvl-perks' },
            h('h3', null, t('camp.lvl.perk')),
            h(
              'div',
              { class: 'gcamp-perk-list' },
              Object.keys(c.perks).map((id) =>
                h(
                  'button',
                  { class: 'gcamp-perk', 'aria-pressed': String(newPerk === id), disabled: !perks.includes(id), onclick: () => ((newPerk = id), render()) },
                  newPerk === id ? icon('check') : null,
                  h('span', null, t(`perk.${id}`)),
                ),
              ),
            ),
            h('small', null, t('camp.lvl.before')),
            deckView(before),
            h('small', null, t('camp.lvl.after')),
            deckView(after, fresh),
          ),
        ),
      );
    } else {
      const need = c.campaign.xpByLevel[x.level];
      parts.push(
        h(
          'section',
          { class: 'gcamp-panel gcamp-lvl-head' },
          h('h3', null, icon('xp'), ' ', need !== undefined ? t('camp.lvl.need', { n: need - x.xp, level: x.level + 1 }) : t('camp.lvl.max')),
          h('small', null, x.perks.length ? x.perks.map((id) => t(`perk.${id}`)).join(' · ') : t('camp.lvl.noPerks')),
          deckView(before),
        ),
      );
    }
    parts.push(handPicker(x));
    return h('div', { class: 'gcamp-level' }, parts);
  }

  /** «Карти на місію»: only when the pool is larger than the hand; saved once the hand is full. */
  function handPicker(x: CampaignHero): HTMLElement | null {
    const size = c.heroes[x.classId]?.handSize ?? 0;
    const pool = cardPool(c, x);
    if (pool.length <= size) return null;
    const picked = hand ?? (x.handPick ?? []).filter((id) => pool.includes(id));
    const fake = { variants: settings.get().variants } as GameState;
    const owner = { classId: x.classId } as HeroState;
    const toggle = (id: string) => {
      hand = picked.includes(id) ? picked.filter((y) => y !== id) : picked.length < size ? [...picked, id] : picked;
      if (hand.length === size) change(pickHand(c, state, x.classId, hand));
      else render();
    };
    return h(
      'section',
      { class: 'gcamp-panel gcamp-hand' },
      h('h3', null, icon('hand'), ' ', t('camp.hand.title'), ' ', h('b', { class: 'gcamp-hand-n' }, `${picked.length} / ${size}`)),
      h('small', null, picked.length === size ? t('camp.hand.saved') : t('camp.hand.hint', { n: size })),
      h(
        'div',
        { class: 'gcamp-hand-grid' },
        pool.map((id) => compactCard({ s: fake, content: c, hero: owner, cardId: id, accent: c.heroes[x.classId]?.color, picked: picked.includes(id), onToggle: () => toggle(id) })),
      ),
    );
  }

  function nextScenario(): string | undefined {
    return playableScenarios(state, c.scenarios)[0];
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
        : tab === 'level'
          ? h('div', { class: 'gcamp-gear' }, level())
          : h('div', { class: 'gcamp-gear' }, slots(), message ? h('p', { class: 'gcamp-msg', role: 'status' }, message) : h('p', { class: 'gcamp-hint' }, t('camp.hint')), chests()),
      h('div', { class: 'gcamp-go' }, artButton('compass', t('camp.toMission'), () => (o.onMap ? o.onMap() : ((summary = true), render())), { cls: 'is-go' })),
      summary ? summaryDialog() : '',
    );
  }

  render();
  return root;
}
