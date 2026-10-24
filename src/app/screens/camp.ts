// The camp between missions (docs/design/camp.md): the screen comes with step 12.

import type { CampaignState } from '../../rules/campaign';
import type { LoadedContent } from '../../rules/load';
import type { GameSetup } from '../../rules/state';
import { h } from '../../ui/dom';
import { t } from '../../ui/i18n';
import { icon } from '../../ui/game/icons';
import type { SavedCampaign } from '../storage';
import { menuBackdrop } from './menu';

export interface CampOptions {
  content: LoadedContent;
  saved: SavedCampaign;
  onSave: (state: CampaignState) => void;
  onMission: (setup: GameSetup) => void;
  onNewCampaign: () => void;
  onMenu: () => void;
}

export function campScreen(o: CampOptions): HTMLElement {
  return h(
    'div',
    { class: 'gpage is-art' },
    menuBackdrop(true),
    h('header', { class: 'gpage-head' }, h('button', { class: 'gbtn gbtn-icon', 'aria-label': t('menu.back'), onclick: o.onMenu }, icon('left')), h('h1', null, t('camp.title'))),
  );
}
