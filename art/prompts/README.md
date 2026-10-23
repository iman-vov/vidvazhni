# Промпти для концептів «Відважних»

Тут лежать готові до вставлення промпти для ChatGPT — по одному файлу на кожну 3D-модель гри (47 моделей). З картинок, які згенерує ChatGPT, потім у Meshy роблять 3D-моделі.

Джерело всіх текстів — [`docs/design/osnova.md`](../../docs/design/osnova.md), розділи «Арт-пайплайн» і «Промпти для ChatGPT». Стильові блоки A–E, фрази для ракурсів, фраза портрета й описи взято звідти дослівно. Описи, яких у документі не було (лише згадка, що такий предмет потрібен), позначені в таблиці зірочкою ✱.

## Шлях однієї моделі

**Концепт у ChatGPT → 3D у Meshy (Image to 3D, Meshy 7, Multi-View) → ріг і анімації в Meshy → перевірка GLB у three.js.**

## Як генерувати концепти в ChatGPT

1. **Один чат — одна модель.** Так ChatGPT пам'ятає дизайн, і бік та спина виходять тими самими.
2. Відкрити файл моделі (див. таблицю нижче) і вставити блок **`front`**. Він уже містить стильовий блок і опис — копіювати одним натиском. Формат картинки **квадрат 1:1**.
3. Перевірити картинку за списком «Перевірити перед тим, як прийняти» у файлі моделі. Не подобається — попросити виправити в тому самому чаті або згенерувати знову.
4. Коли фронт подобається, **у тому самому чаті** вставити блок **`side`**, потім **`back`**.
5. Для героїв і босів наостанок — блок **`portrait`** (іконка для інтерфейсу; у Meshy він не йде).
6. Зброю, пропси й текстури — кожну в **новому** чаті, лише один блок `front`.

Загальні правила для кожної картинки:

- рівно **один** об'єкт, видно цілком;
- **рівний світло-сірий фон**, без підлоги й декорацій;
- **без тіні** під об'єктом, без тексту й рамки;
- гуманоїди — у **A-позі** (руки на ~45° від тулуба) і з **порожніми руками**: щити, луки, посохи, кийки робимо окремими моделями й кріпимо до кисті в three.js;
- стиль — розфарбована настільна мініатюра: трохи пухкі пропорції, голова ≈ ⅕ зросту, ручний розпис, теплі тони, **без крові**.

> Для чотириногих (пацюк, вовк, Ґудзик) стильовий блок B просить вигляд **пів-оберта спереду** — так у документі, і так і лишаємо. Фрази для боку й спини в них ті самі, що й у гуманоїдів, лише «character» → «creature» і «A-pose» → «pose».

## Куди зберігати

```
art/concepts/<id>/front.png
art/concepts/<id>/side.png
art/concepts/<id>/back.png
art/concepts/<id>/portrait.png   (лише герої й боси)
```

Зброя, пропси й текстури — лише `art/concepts/<id>/front.png`. `<id>` — це id з таблиці (наприклад, `art/concepts/warden/front.png`).

## Що далі в Meshy

1. **Image to 3D** → модель **Meshy 7** → `front.png` як головне зображення, `side.png` і `back.png` — у **Multi-View**.
2. Для гуманоїдів увімкнути **позу спокою (A-pose)**.
3. Ріг: гуманоїди — гуманоїдний скелет; вовк, пацюк і Ґудзик — чотириногий; слиз і привид — без рігу (їх анімує код: гойдання, стискання-розтягування, мерехтіння).
4. Анімації з бібліотеки: idle, walk, attack, hit, death; для заклинателів ще cast.
5. Експорт GLB → перевірка в three.js: розмір, напрямок «вперед», кількість трикутників. Ліміти: герой 8–15 тис., звичайний монстр 5–10 тис., бос до 25 тис.; текстура до 1024 px.

Текстури (`tex-*`) у Meshy не йдуть — вони лягають прямо на шестигранні плити поля.

Усі ці налаштування для кожної моделі зібрані в [`manifest.json`](manifest.json): стильовий блок, файли концептів, Multi-View, поза, тип рігу, анімації, ліміт трикутників, до якої кисті якої моделі кріпиться зброя. Ліміти трикутників для зброї й пропсів — орієнтир (`"estimate": true`), у документі їх немає. Назву кістки кисті (`LeftHand` / `RightHand`) треба звірити з GLB від Meshy.

## Черга виробництва

Порядок з документа: спершу Вартовий, Лучниця, пацюк і гремлін (потрібні для Ф2), потім решта героїв, потім монстри в порядку сценаріїв, боси останніми. Зброя йде одразу за своїм власником. Пропси й текстури документ не впорядковує — їх можна робити будь-коли, паралельно.

1. **Потрібні для Ф2:** `warden`, `warden-shield`, `wind-archer`, `wind-archer-bow`, `cellar-rat`, `gremlin`, `gremlin-slingshot`.
2. **Решта героїв:** `herbalist`, `herbalist-staff`, `rogue`, `rogue-dagger`, `elementalist`, `tinker`, `tinker-wrench`, `tinker-button`.
3. **Монстри в порядку сценаріїв:** `thornling`, `grey-wolf`, `bandit-brute`, `bandit-club`, `bandit-crossbow`, `crossbow`, `bog-slime`, `stone-sentinel`, `gloom-cultist`, `cultist-staff`, `shadow-wraith`.
4. **Боси:** `bog-miller`, `flour-sack`, `shadowhand`.
5. **Пропси й текстури, можна будь-коли паралельно:** `barrel`, `crate`, `chest`, `dungeon-door`, `floor-lever`, `brazier`, `rune-stone`, `bear-trap`, `thorn-bush`, `mill-wheel`, `tavern-table`, `lantern-shard`, `tex-cobblestone`, `tex-tavern-planks`, `tex-forest-floor`, `tex-shallow-water`, `tex-swamp-mud`, `tex-cave-rock`.

## Чекліст усіх моделей

У колонку «статус» можна ставити ✅ (концепт готовий) або 🧊 (3D готове). ✱ — опис написано окремо, у документі тексту не було.

| № | id | назва | тип | блок | статус |
|---|---|---|---|---|---|
| 1 | [`warden`](heroes/warden.md) | Вартовий | герой | A | |
| 2 | [`warden-shield`](weapons/warden-shield.md) | Щит-двері Вартового | зброя | D | |
| 3 | [`wind-archer`](heroes/wind-archer.md) | Лучниця Вітру | герой | A | |
| 4 | [`wind-archer-bow`](weapons/wind-archer-bow.md) | Лук Лучниці | зброя | D | |
| 5 | [`cellar-rat`](monsters/cellar-rat.md) | Пацюк-злодюжка | монстр | B | |
| 6 | [`gremlin`](monsters/gremlin.md) | Гремлін-пакостник | монстр | A | |
| 7 | [`gremlin-slingshot`](weapons/gremlin-slingshot.md) | Рогатка гремліна ✱ | зброя | D | |
| 8 | [`herbalist`](heroes/herbalist.md) | Травниця | герой | A | |
| 9 | [`herbalist-staff`](weapons/herbalist-staff.md) | Терновий посох Травниці | зброя | D | |
| 10 | [`rogue`](heroes/rogue.md) | Пройда | герой | A | |
| 11 | [`rogue-dagger`](weapons/rogue-dagger.md) | Кинджал Пройди ✱ | зброя | D | |
| 12 | [`elementalist`](heroes/elementalist.md) | Стихійник | герой | A | |
| 13 | [`tinker`](heroes/tinker.md) | Майстер | герой | A | |
| 14 | [`tinker-wrench`](weapons/tinker-wrench.md) | Гайковий ключ Майстра | зброя | D | |
| 15 | [`tinker-button`](heroes/tinker-button.md) | Ґудзик | герой (виклик) | B | |
| 16 | [`thornling`](monsters/thornling.md) | Терновик | монстр | A | |
| 17 | [`grey-wolf`](monsters/grey-wolf.md) | Сірий вовк | монстр | B | |
| 18 | [`bandit-brute`](monsters/bandit-brute.md) | Розбійник-громило | монстр | A | |
| 19 | [`bandit-club`](weapons/bandit-club.md) | Кийок розбійника ✱ | зброя | D | |
| 20 | [`bandit-crossbow`](monsters/bandit-crossbow.md) | Розбійник-арбалетник | монстр | A | |
| 21 | [`crossbow`](weapons/crossbow.md) | Арбалет розбійника ✱ | зброя | D | |
| 22 | [`bog-slime`](monsters/bog-slime.md) | Болотяний слиз | монстр | C | |
| 23 | [`stone-sentinel`](monsters/stone-sentinel.md) | Кам'яний вартовий | монстр | A | |
| 24 | [`gloom-cultist`](monsters/gloom-cultist.md) | Культист Мороку | монстр | A | |
| 25 | [`cultist-staff`](weapons/cultist-staff.md) | Посох культиста ✱ | зброя | D | |
| 26 | [`shadow-wraith`](monsters/shadow-wraith.md) | Тіньовий привид | монстр | C | |
| 27 | [`bog-miller`](bosses/bog-miller.md) | Мірошник-Болотяник | бос | A | |
| 28 | [`flour-sack`](weapons/flour-sack.md) | Мішок Мірошника ✱ | зброя | D | |
| 29 | [`shadowhand`](bosses/shadowhand.md) | Тінерук | бос | A | |
| 30 | [`barrel`](props/barrel.md) | Бочка | пропс | D | |
| 31 | [`crate`](props/crate.md) | Ящик | пропс | D | |
| 32 | [`chest`](props/chest.md) | Скриня | пропс | D | |
| 33 | [`dungeon-door`](props/dungeon-door.md) | Двері | пропс | D | |
| 34 | [`floor-lever`](props/floor-lever.md) | Важіль | пропс | D | |
| 35 | [`brazier`](props/brazier.md) | Жаровня | пропс | D | |
| 36 | [`rune-stone`](props/rune-stone.md) | Рунний камінь | пропс | D | |
| 37 | [`bear-trap`](props/bear-trap.md) | Капкан | пропс | D | |
| 38 | [`thorn-bush`](props/thorn-bush.md) | Тернові зарості | пропс | D | |
| 39 | [`mill-wheel`](props/mill-wheel.md) | Мельничне колесо | пропс | D | |
| 40 | [`tavern-table`](props/tavern-table.md) | Стіл корчми | пропс | D | |
| 41 | [`lantern-shard`](props/lantern-shard.md) | Уламок Ліхтаря ✱ | пропс | D | |
| 42 | [`tex-cobblestone`](textures/tex-cobblestone.md) | Бруківка підземелля | текстура | E | |
| 43 | [`tex-tavern-planks`](textures/tex-tavern-planks.md) | Дошки льоху корчми | текстура | E | |
| 44 | [`tex-forest-floor`](textures/tex-forest-floor.md) | Лісова підстилка | текстура | E | |
| 45 | [`tex-shallow-water`](textures/tex-shallow-water.md) | Мілка вода | текстура | E | |
| 46 | [`tex-swamp-mud`](textures/tex-swamp-mud.md) | Болото | текстура | E | |
| 47 | [`tex-cave-rock`](textures/tex-cave-rock.md) | Камінь печери | текстура | E | |

## Для ChatGPT

Якщо ти — ChatGPT і тобі показали цю папку: бери промпт лише з файлу потрібної моделі й генеруй рівно те, що в ньому написано, квадратом 1:1. Не додавай фон, підлогу, тіні, текст, другий об'єкт чи зброю в руках персонажа. Бік, спину й портрет малюй лише у тому самому чаті, де вже є затверджений фронт, і тримай дизайн ідентичним.
