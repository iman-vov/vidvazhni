// Dev-only review page (`?icons`): every icon at 24, 32 and 48 px on a light parchment panel, on the
// dark HUD slate as is and with `vi-on-dark`, plus a monochrome silhouette grid at 24 px to check that
// no two icons share a shape.

import { h } from '../dom';
import { onLangChange, setLang, LANGS, getLang, t } from '../i18n';
import { ICON_GROUPS, icon, iconLabel, type IconGroup, type IconName } from './index';

const CSS = `
html{overflow:auto!important;height:auto!important}
body.icons-gallery{margin:0;background:#1d2433;color:#e9e2d2;font:14px/1.4 system-ui,'Segoe UI',Roboto,sans-serif;overflow:auto;height:auto}
.ig{padding:16px 20px 40px;max-width:1500px}
.ig h1{font-size:20px;margin:0 0 4px}.ig h2{font-size:15px;margin:22px 0 8px;color:#f0d79a;text-transform:capitalize}
.ig-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0 10px}
.ig-bar button{min-height:36px;padding:0 12px;border-radius:8px;border:1px solid #556;background:#2a3346;color:inherit;font:inherit}
.ig-bar button[aria-pressed=true]{background:#f0d79a;color:#2a1c10}
.ig-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.ig-cell{display:grid;grid-template-columns:1fr;border-radius:10px;overflow:hidden;border:1px solid #39435a}
.ig-pane{display:flex;align-items:flex-end;justify-content:center;gap:8px;padding:10px 6px 6px}
.ig-dark{background:#263049;color:#f1ead9}.ig-light{background:#efe2c4;color:#4a3524}
.ig-name{font-size:12px;padding:3px 8px;background:#151b28;display:flex;justify-content:space-between;gap:6px}
.ig-name small{color:#98a2b6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ig-mono{display:grid;grid-template-columns:repeat(auto-fill,64px);gap:6px}
.ig-mono>div{display:flex;flex-direction:column;align-items:center;gap:3px;padding:8px 2px 4px;background:#efe2c4;color:#1d1510;border-radius:8px;font-size:10px}
.ig-mono .vi{--icon-accent:currentColor;--icon-halo:transparent}
.ig-sample{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:10px;background:#263049;border-radius:10px}
.ig-sample span{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:8px;background:#33405c;min-height:44px;box-sizing:border-box}
`;

export function mountIconGallery(root: HTMLElement = document.body): void {
  document.title = 'Icons';
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  document.body.className = 'icons-gallery';
  const render = () => {
    root.replaceChildren(page());
  };
  onLangChange(render);
  render();
}

function page(): HTMLElement {
  const groups = Object.entries(ICON_GROUPS) as [IconGroup, readonly IconName[]][];
  return h(
    'div',
    { class: 'ig' },
    h('h1', null, `Icons (${groups.reduce((n, [, l]) => n + l.length, 0)})`),
    h('div', { class: 'ig-bar' }, LANGS.map((l) => h('button', { 'aria-pressed': String(l === getLang()), onclick: () => setLang(l) }, l))),
    h('h2', null, 'Silhouettes, 24 px'),
    h(
      'div',
      { class: 'ig-mono', id: 'ig-mono' },
      groups.flatMap(([, list]) => list.map((n) => h('div', null, icon(n, { size: 24 }), n))),
    ),
    h('h2', null, 'In text'),
    h(
      'div',
      { class: 'ig-sample' },
      h('span', null, icon('attack', { title: false }), `${t('stat.attack')} 3`),
      h('span', null, icon('ranged', { title: false }), `${t('stat.attack')} 2`, icon('range', { title: false }), '4'),
      h('span', null, icon('move', { title: false }), `${t('stat.move')} 3`, icon('jump', { title: false })),
      h('span', null, icon('hp', { title: false }), '7/10'),
      h('span', null, icon('fire', { title: false, size: 22 }), icon('ice', { size: 22 }), icon('air', { size: 22 }), icon('earth', { size: 22 }), icon('light', { size: 22 }), icon('dark', { size: 22 })),
    ),
    groups.map(([group, list]) =>
      h(
        'section',
        null,
        h('h2', null, group),
        h(
          'div',
          { class: 'ig-grid' },
          list.map((n) => {
            const sizes = (cls: string, className?: string) => h('div', { class: `ig-pane ${cls}` }, [24, 32, 48].map((size) => icon(n, { size, className })));
            return h('div', { class: 'ig-cell', title: iconLabel(n) }, sizes('ig-light'), sizes('ig-dark'), sizes('ig-dark', 'vi-on-dark'), h('div', { class: 'ig-name' }, h('b', null, n), h('small', null, iconLabel(n))));
          }),
        ),
      ),
    ),
  );
}
