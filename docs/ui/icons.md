# Іконки «Відважних»

Правило від користувача: «Всі іконки, всі позначення мають бути наші. Ніде не використовуємо стандартні емодзі.»
Тому в грі немає емодзі, дінгбатів і символів-картинок (★ ✓ ⚔ 🛡 ❤ ⚡ ▲ ● →…). Усе, що позначає дію, стан чи
стихію, — власні SVG-іконки з `src/ui/icons/`. Типографіка лишається: − × … ≤ « » — · ±.

![Аркуш іконок на світлому тлі](../screenshots/icons/sheet-light-48.png)

## Стиль

Кожна іконка — окремий файл `src/ui/icons/svg/<name>.svg`, viewBox 24×24, три шари:

1. **Контур:** ті самі фігури, обведені товстою заокругленою лінією (2,5 одиниці, тобто 1,25 з кожного боку)
   кольором `var(--icon-line, #3a2414)` — теплий темно-коричневий, як обведення на розписаній мініатюрі.
2. **Тіло:** плоска заливка `currentColor` — колір бере з тексту або з CSS (`color`).
3. **Деталі:** тонкі лінії й крапки всередині кольором тієї ж `--icon-line`.

Тобто на іконку є лише один колір тіла (`currentColor`) і один акцент (`--icon-line`). Якщо задати
`--icon-line: currentColor` (клас `.vi-mono`), лишається голий силует: так перевіряється, що кожну іконку
впізнати за формою, а не за кольором (вимога основи, «Інтерфейс і UX → Загальне»).

![Силуети, 24 px](../screenshots/icons/silhouettes-24.png)

**Як змінити стиль** під макети ChatGPT (`art/ui-mockups/icon-sheet/`, коли з'явиться): правити лише SVG-файли.
Колір обведення для всієї гри чи окремого екрана — змінна `--icon-line` у CSS (наприклад, світла для стилю
B «нічне місто й золото»). Рекомендовані кольори тіла для стихій, станів тощо — `ICON_TINTS` у
`src/ui/icons/svg.ts`. Тест `tests/ui/icons.test.ts` стежить, щоб файл лишався в контракті: viewBox 24,
`currentColor`, жодних інших кольорів, крім запасного для `--icon-line`, без `<text>`, `<image>`, `<use>`.

## API

```ts
import { icon, iconHtml, rich, plain } from '../ui/icons';

icon('attack');                         // <svg> з aria-label з i18n («Атака ближня»)
icon('fire', { size: 32 });             // розмір у px або будь-яка CSS-довжина; типово 1.25em
icon('move', { title: false });         // декоративна (поруч є текст): aria-hidden
iconHtml('coin');                       // те саме рядком для шаблонів
rich('Атака 3 {icon:arrow} 5');         // текст + <svg> для i18n-рядків з плейсхолдерами
plain('Атака 3 {icon:arrow} 5');        // «Атака 3 – 5» для title, aria-label, копій журналу
```

- Імена — тип `IconName` (union у `src/ui/icons/names.ts`, згруповані в `ICON_GROUPS`).
- Підписи для екранних читачів — ключі `icon.<name>` у `data/i18n/{uk,de,en}.json`.
- `src/ui/icons/svg.ts` не залежить від DOM та i18n, тому його бере й рендер дошки (`src/render`).
- Ігровий екран користується обгорткою `icon(name, cls, label)` з `src/ui/game/icons.ts` (span `.gi`, який
  розмір задає game.css), а всередині — той самий набір.
- У текстах i18n іконка пишеться як `{icon:name}`; `t()` такі плейсхолдери не чіпає, а показ іде через `rich()`.

## Галерея

Dev-сервер, `?icons` (наприклад, `http://localhost:5173/vidvazhni/?icons`): усі іконки в 24/32/48 px на темній і
світлій панелі, монохромна сітка силуетів і приклади в тексті; є перемикач мови для підписів.
Код — `src/ui/icons/gallery.ts`. Скріншоти: `docs/screenshots/icons/`.

## Набір (77) і де він стоїть

| Група | Іконки | Де показуються |
|---|---|---|
| Дії | `attack` меч, `ranged` лук зі стрілою, `range` стріла в польоті, `targets` приціл, `move` чобіт, `jump` дуга над каменем, `fly` крило, `heal` хрест, `shield` щит, `retaliate` щит у шипах, `push` стрілка-блок, `pull` гак, `pierce` стріла крізь пластину, `area` три гекси, `loot` мішок, `provoke` прапор, `infuse` сфера з променями, `consume` сфера, що вбирає іскри, `summon` фігурка на диску, `teleport` два портали, `special` сувій | кроки на картах (`card.ts`, `text.ts → stepIconName`), поточний крок і базові дії (`scenarioScreen.ts`), статуси героїв (`panels.ts`), очікувана шкода над ціллю на дошці (`boardView.ts`, `attack`), дебаг: кнопки цілей (`attack`) |
| Позначки карт | `initiative` пісочний годинник, `loss` розірвана карта, `xp` зірка, `momentum` блискавка, `active` дві стрілки по колу, `bless` іскри, `curse` око в трикутнику | ініціатива й «провідна» карта, втрата/активна карта, досвід, наснага (`card.ts`, `panels.ts`, `scenarioScreen.ts`, `end.ts`), дебаг-карти (`momentum`); `initiative` також замість «?» у черзі ходів, поки карту не обрано |
| Стани | `poison` крапля з бульками, `wound` три подряпини, `immobilize` дві ланки ланцюга, `disarm` зламаний меч, `stun` зірки на орбіті, `muddle` спіраль, `invisible` привид, `strengthen` зігнута рука | рядок станів героїв і монстрів (`panels.ts → statusRow`), значки над фігурами на дошці (`boardOverlay.ts`), кроки «наклади стан» |
| Стихії | `fire` полум'я, `ice` сніжинка, `air` вітер, `earth` дві вершини, `light` сонце, `dark` півмісяць, `any` шестикутник; сфери форку `orb-fire`, `orb-earth`, `orb-air` (та сама стихія в кільці) | панель стихій (`panels.ts`), бонуси поглинання на картах (`card.ts`), вибір стихії (`scenarioScreen.ts`) |
| Світ | `door`, `trap` щелепи пастки, `chest`, `coin`, `hp` серце, `monster` рогата голова, `hero` погруддя, `elite` корона | здоров'я й монети (`panels.ts`, `end.ts`), монети, що злітають на дошці (`boardView.ts`, `coin`), щит над фігурою (`boardOverlay.ts`, `shield`), черга ходів (`monster`) |
| Інтерфейс | `hand`, `discard`, `rest` намет, `item` флакон, наміри `approach`, `hold` якір, `early` схід сонця, `late` равлик, `undo`, `skip`, `menu`, `close`, `left`, `right`, `up`, `down`, `check`, `rotate`, `hint` ліхтар, `revive` серце з плюсом, `arrow` стрілка в тексті, `add-player`, `remove-player` | кнопки й шторки (`scenarioScreen.ts`, `app.ts`, `newGame.ts` — «більше/менше гравців»), наміри (`panels.ts`), стрілка в текстах «Атака 3 → 5», «хто → кого» в журналі (`{icon:arrow}`), дебаг: напрямки області (`arrow`, повернута), верх/низ карти (`up`/`down`), згортання панелей, позначка героя, що має обрати (`hint`), dev-сторінки дошки й моделей |

## Що змінилося в текстах

- `{icon:arrow}` замість «→» у `game.bonus`, `game.itemPrompt`, `game.modifier.line`, `game.ev.attacked`,
  `debug.itemPrompt`, `debug.ev.attacked`, `debug.ev.cardMoved`; `{icon:hint}` замість «•» у `debug.pickHeroTab`.
- `debug.eliteMark` «★» → «Е/E», `debug.marker.obstacle` «▲» → «Перешкода», `debug.marker.coins` «¢{n}» → «Монети {n}»
  (ці підписи малюються на canvas-жетонах, де SVG не вставити).
- Жетони заглушки дошки (`?stub`) і дебаг-дошки: «⚔3» → «(3)», «→ 4» → «Рух 4», «✔ Х» → «[Х]».

## Щоб не повернулося

`tests/ui/icons-no-emoji.test.ts` падає, якщо в `src/` (код без коментарів, CSS, SVG, HTML) або в
`data/i18n/*.json` трапиться емодзі (Extended_Pictographic), дінгбат, символ із блоків Arrows, Misc Technical,
Geometric Shapes, Misc Symbols, Misc Symbols and Arrows, кружечок-маркер «•» чи «¢». Емодзі заборонені й у коментарях.
