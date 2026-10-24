// Scenario end after art/ui-mockups/scenario-end/v1.png: victory or defeat with the scenario name, one
// card per hero in their colour (gold, XP, the scenario's bonus goal), the loot (gold, chest and enemy
// finds, into the party chest) and «Як було? Легко / Саме те / Важко». The answer goes into the campaign
// save per scenario (`onRate`) and, with the optional comment, into the device log when the screen is
// left. A campaign mission ends with [До табору] only, which counts the result in the campaign.

import { h } from '../../ui/dom';
import { itemNameKey } from '../../rules/items';
import { secondaryMet } from '../../rules/objectives';
import type { ScenarioFeedback } from '../../rules/campaign';
import type { HeroState } from '../../rules/state';
import { t } from '../../ui/i18n';
import { icon, type IconName } from '../../ui/game/icons';
import { chestFinds } from '../../ui/game/events';
import { className } from '../../ui/game/text';
import { campHeroUrl, heroBustUrl } from '../../ui/game/uiArt';
import { artButton } from './menu';
import './end.css';
import { addFeedback, type FeedbackRating } from '../feedback';
import type { GameController } from '../game';

export interface EndOptions {
  game: GameController;
  onMenu: () => void;
  onAgain: () => void;
  /** A campaign mission: [До табору] (`applyScenarioResult`) instead of «again» and «menu». */
  onCamp?: () => void;
  /** «Як було?» answered (or changed): store it in the campaign save. */
  onRate?: (rating: ScenarioFeedback) => void;
  /** The story outro slot under the header (src/app/story.ts); none when «Сюжет» is off. */
  outro?: () => HTMLElement | null;
}

const RATINGS: { id: FeedbackRating; mouth: string }[] = [
  { id: 'easy', mouth: 'M8 14.5q4 3.5 8 0' },
  { id: 'right', mouth: 'M8 15.5h8' },
  { id: 'hard', mouth: 'M8 16.5q4-3.5 8 0' },
];

/** The outline face on a feedback button, drawn like the mockup's. */
function face(mouth: string): HTMLElement {
  const el = h('span', { class: 'gend-face', 'aria-hidden': 'true' });
  el.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><circle cx="8.6" cy="9.6" r=".6" fill="currentColor"/><circle cx="15.4" cy="9.6" r=".6" fill="currentColor"/><path d="${mouth}"/></svg>`;
  return el;
}

export function endScreen(o: EndOptions): HTMLElement {
  const g = o.game;
  const s = g.state;
  const content = g.content;
  const scenario = content.scenarios[s.scenarioId];
  const won = s.phase === 'won';
  let rating: FeedbackRating | null = null;
  let comment = '';
  const rewards = g.rewards();
  const goals = won ? (scenario?.secondary ?? []) : [];
  const fromChests: string[] = [];
  const fromEnemies: string[] = [];
  for (const ev of s.log) {
    if (ev.type === 'looted') fromChests.push(...chestFinds(ev, s.log));
    else if (ev.type === 'itemFound' && !ev.chest) fromEnemies.push(t(itemNameKey(ev.item)));
  }
  const rewardItems = won ? (scenario?.reward.items ?? []) : [];
  const root = h('div', { class: `gpage is-art gend-screen ${won ? 'is-win' : 'is-loss'}` });

  /** The device log entry (with the comment) is written once, when the player leaves. */
  function leave(go: () => void): () => void {
    return () => {
      if (rating)
        addFeedback({
          scenarioId: s.scenarioId,
          won,
          rating,
          comment: comment.trim(),
          rounds: s.round,
          heroes: g.heroes().map((x) => x.classId),
          difficulty: s.difficulty,
          variants: s.variants,
          at: new Date().toISOString(),
        });
      go();
    };
  }

  function heroCard(r: (typeof rewards)[number]): HTMLElement {
    const hero = s.figures[r.heroId] as HeroState;
    const url = campHeroUrl(hero.classId) ?? heroBustUrl(hero.classId);
    return h(
      'article',
      { class: 'gend-hero', style: `--hero: ${content.heroes[hero.classId]?.color ?? '#888'}` },
      h('div', { class: 'gend-hero-art' }, url ? h('img', { src: url, alt: '', draggable: 'false' }) : null),
      h('h3', null, className(hero.classId)),
      h('p', { class: 'gend-stat' }, icon('gold'), h('span', null, t('ui.gold')), h('b', null, r.gold)),
      h('p', { class: 'gend-stat' }, icon('xp'), h('span', null, t('ui.xp')), h('b', null, r.xp)),
      goals.length
        ? goals.map((goal) => {
            const met = secondaryMet(s, goal);
            return h('p', { class: `gend-goal${met ? ' is-met' : ''}` }, icon(met ? 'check' : 'close'), h('span', null, t(`objective.secondary.${goal.check}`, Object.fromEntries(Object.entries(goal.params ?? {}).map(([k, v]) => [k, String(v)])))));
          })
        : h('p', { class: 'gend-goal is-none' }, h('span', null, won ? t('game.end.noGoal') : t('game.end.goalLost'))),
    );
  }

  function lootSlot(iconName: IconName, label: string, items: string[], big?: string | number): HTMLElement {
    return h(
      'div',
      { class: `gend-slot${items.length || big !== undefined ? '' : ' is-empty'}` },
      icon(iconName),
      big !== undefined ? h('b', { class: 'gend-slot-big' }, big) : h('span', { class: 'gend-slot-items' }, items.length ? items.join(', ') : '—'),
      h('small', null, label),
    );
  }

  function render(): void {
    const gold = rewards.reduce((sum, r) => sum + r.gold, 0);
    root.replaceChildren(
      h('div', { class: 'gend-bg', 'aria-hidden': 'true' }),
      h(
        'header',
        { class: 'gend-head' },
        h('h1', { class: 'gend-title' }, won ? t('game.end.victory') : t('game.end.defeat')),
        h('p', { class: 'gend-name' }, t(`scenario.${s.scenarioId}`)),
        h('p', { class: 'gend-sub' }, t('game.end.rounds', { rounds: s.round })),
      ),
      o.outro?.() ?? h('p', { class: 'gintro gend-outro' }, won ? t(`scenario.${s.scenarioId}.outro`) : t('game.end.lossText')),
      h('section', { class: 'gend-heroes', 'aria-label': t('ui.hero') }, rewards.map(heroCard)),
      h(
        'section',
        { class: 'gend-loot', 'aria-label': t('game.end.loot') },
        h('h2', null, icon('chest'), t('game.end.loot')),
        h(
          'div',
          { class: 'gend-loot-row' },
          lootSlot('coin', t('ui.gold'), [], gold),
          lootSlot('chest', t('game.end.fromChests'), fromChests),
          lootSlot('monster', t('game.end.fromEnemies'), fromEnemies),
          h(
            'div',
            { class: 'gend-dest' },
            rewardItems.length ? h('span', null, icon('item'), t('game.end.reward', { items: rewardItems.map((id) => t(itemNameKey(id))).join(', ') })) : null,
            h('span', null, icon('arrow'), o.onCamp ? t('game.end.toPartyChest') : t('game.end.notCampaign')),
          ),
        ),
      ),
      h(
        'footer',
        { class: 'gend-foot' },
        h(
          'div',
          { class: 'gend-rate' },
          h('h2', null, t('game.feedback.title')),
          h(
            'div',
            { class: 'gend-rate-row' },
            RATINGS.map((r) =>
              h(
                'button',
                {
                  class: `gend-rate-btn is-${r.id}`,
                  'aria-pressed': String(rating === r.id),
                  onclick: () => {
                    rating = r.id;
                    o.onRate?.(r.id);
                    render();
                  },
                },
                face(r.mouth),
                t(`game.feedback.${r.id}`),
              ),
            ),
          ),
          rating
            ? h('input', { class: 'ginput gend-comment', type: 'text', placeholder: t('game.feedback.comment'), value: comment, oninput: (e: Event) => (comment = (e.target as HTMLInputElement).value) })
            : null,
        ),
        h(
          'div',
          { class: 'gend-go' },
          o.onCamp
            ? h('button', { class: 'gend-camp', onclick: leave(o.onCamp) }, icon('map'), h('span', null, t('campaign.toCamp')))
            : [artButton('compass', t('game.end.again'), leave(o.onAgain), { cls: 'is-small' }), artButton('play', t('game.toMenu'), leave(o.onMenu))],
        ),
      ),
    );
  }

  render();
  return root;
}
