# Meshy, партія 3: 6 монстрів, 2 боси, 4 предмети монстрів

Дата: 2026-10-24. Рецепт — з [meshy-batch-2.md](meshy-batch-2.md). Ліміт: 330 нових кредитів.

**Підсумок:** усі 12 моделей згенеровано, зроблено remesh, гуманоїдів ріговано й анімовано, усе прогнано через `npm run models` (три рівні в `assets/models/<id>/`). Безкоштовні повтори не знадобились: дефектів на кшталт дірок у rogue не було. Тріщини після Remesh закрито скриптом.

## Кредити

| Модель | Тип | Кредити |
|---|---|---|
| `bandit-brute`, `bandit-crossbow`, `stone-sentinel`, `gloom-cultist`, `bog-slime`, `shadow-wraith` | Meshy 7.1, модель 20 + текстура 10 | 6 × 30 = 180 |
| `bog-miller`, `shadowhand` | Meshy 7.1 | 2 × 30 = 60 |
| `bandit-club`, `crossbow`, `cultist-staff`, `flour-sack` | Meshy 6 Lite, модель 10 + текстура 10 | 4 × 20 = 80 |
| Remesh ×12, Rig ×6, анімації | | 0 |
| **Разом** | | **320** з 330 |

Баланс: **1 630 → 1 310** (місячні 1 380 → 1 060, постійні 250). Ціни на кнопках збіглися з очікуваними (30 / 10 / 10), вікон оплати чи згоди не було.

## Налаштування

- Meshy 7.1, Multi-view, **Main = front, Left = side, Back = back** для всіх восьми. Пози side і back я звірив із фронтом: збігаються в усіх, зокрема в `shadowhand` (низький кремезний варіант за рішенням користувача) і `bog-miller` (жорно на лівому передпліччі в усіх ракурсах).
- Resolution Standard, Texture 2K, Private. **Pose A-Pose** — для гуманоїдів; для `bog-slime` і `shadow-wraith` вимкнено (їх рігу немає, анімуються кодом).
- Предмети: Meshy 6 Lite, один вигляд, Pose вимкнено.
- Remesh (Fixed, Triangle): монстри 7 000, `bog-miller` 20 000, `shadowhand` 18 000, предмети 3 000 / 2 900.
- Риг Humanoid з висотою за дизайном (див. таблицю). У всіх шести гуманоїдів Meshy ставив маркер паху на пояс. Я опускав його до промежини (у ряси культиста — ще й коліна), і **всі шість ригів пройшли з першого разу**.

## Моделі

| Модель | Трикутники (medium) | Риг, кістки | Висота | Кліпи (Meshy → у грі) |
|---|---|---|---|---|
| `bandit-brute` | 7 281 | Humanoid, 66 | 1,75 | Idle 1, Walking, Running, **Right-hand Sword Slash** (attack, удар дубиною правою), Hit Reaction, Dead |
| `bandit-crossbow` | 7 254 | Humanoid, 52 | 1,75 | Idle 1, Walking, Running, **Archery Shot** (attack), Hit Reaction, Dead |
| `stone-sentinel` | 7 270 | Humanoid, 58 | 2,0 (ширина 2,25) | Idle 1, Walking, Running, Attack, Hit Reaction, Dead |
| `gloom-cultist` | 7 279 | Humanoid, 65 | 1,7 | Idle 1, Walking, Running, Attack, **Mage Spell Cast** (cast), Hit Reaction, Dead |
| `bog-slime` | 7 270 | — | 1,41 (ширина 1,9) | — (анімація кодом) |
| `shadow-wraith` | 7 290 | — | 1,9 | — (анімація кодом) |
| `bog-miller` | 20 806 | Humanoid, 69 | 2,4 | Idle 1, Walking, Running, Attack, Hit Reaction, Dead |
| `shadowhand` | 18 643 | Humanoid, 67 | 1,8 | Idle 1, Walking, Running, **Charged Spell Cast** (attack), **Mage Spell Cast** (cast), Hit Reaction, Dead |
| `bandit-club` | 3 100 | — | ≈1,9 (нормування Meshy) | — |
| `crossbow` | 2 984 | — | ≈1,9 | — |
| `cultist-staff` | 3 030 | — | ≈1,9 | — |
| `flour-sack` | 3 032 | — | ≈1,9 | — |

Розміри після `npm run models` (low / medium / high): монстри ≈0,65 / 1,1 / 2,3 МБ, слиз і привид 0,2 / 0,4 / 1,2, боси 0,9 / 1,4–1,6 / 2,5–3,1, предмети 0,1 / 0,25 / 1,4–1,9 МБ.

- **Бос `bog-miller`** без кліпу cast (за маніфестом він melee, тож так і має бути). `npm run models` попереджає про це, але це не помилка.
- **`shadowhand`:** обидва кліпи чар мали в назві «spell/cast», тож конвеєр зробив би з них `cast` і `cast2` без `attack`. У сирому файлі (цієї партії) Charged Spell Cast перейменовано на `Attack_Charged`, тепер кліпи: attack + cast.
- `slime` і `wraith` не мають рігу й кліпів, як і передбачено маніфестом.
- Арбалетної анімації в бібліотеці Meshy немає (пошук «crossbow», «rifle», «shoot»). Узяв Archery Shot, як у лучниці, тож у грі постріл, імовірно, теж треба довертати на ~−60°, як у `wind-archer`.

## Тріщини після Remesh

Тим самим скриптом, що й у партії 2 (`fillholes.mjs` у спільній теці нотаток), але **лише для сирих файлів цієї партії**. Перед заповненням скрипт перевіряв, що `<id>.glb` збігається з оригіналом Meshy `<id>.meshy.glb`.

| Модель | Тріщин до → після |
|---|---|
| `bandit-brute` | 9 → 1 |
| `bandit-crossbow` | 5 → 2 |
| `stone-sentinel` | 20 → 11 (кам'яні блоки, поодинокі ребра між ними) |
| `gloom-cultist` | 2 → 1 |
| `bog-slime` | 4 → 0 |
| `shadow-wraith` | 8 → 2 |
| `bog-miller` | 22 → 4 |
| `shadowhand` | 12 → 3 |
| 4 предмети | 0 |

## Перевірка

- У переглядачі Meshy всі вісім істот без дефектів (`meshy-batch-3/*-meshy.png`).
- У переглядачі гри `dev/models.html`: `bog-miller` (attack), `shadowhand` (cast), `gloom-cultist` з посохом у руці, `stone-sentinel` (idle) — `meshy-batch-3/*-viewer.jpg`. Кліпи грають, моделі стоять на гексі.
- **Blender не використовував:** ним зараз працюють інші сесії, а після інциденту в партії 2 я його не чіпаю. Look у Blender для партії 3 не зроблено.

## Що далі

- Атака арбалетника: перевірити напрям Archery Shot у грі або підібрати інший кліп.
- Масштаб предметів (`attachWeapon(..., { scale })`): Meshy нормує їх до ≈1,9.
- `stone-sentinel`: 10 відкритих ребер між блоками — глянути в Blender, коли він буде вільний.

## Rogue v2 (новий концепт)

Користувач вирішив спростити концепт rogue під Meshy: коротка накидка, відкрита спереду, без поясних торбинок і звислих ремінців, кинджали плоско на стегнах. Нова генерація — **30 кредитів** понад ліміт партії (затверджено окремо). Баланс після неї — **1 280**.

- Meshy 7.1, Multi-view (front + side як Left + back), Standard, Texture 2K, A-Pose, Private. Модель вийшла чистою з першого разу: талія й накидка без отворів спереду й з обох боків (`meshy-batch-3/rogue-v2-meshy.png`), тож Free Retry не знадобився.
- Remesh 12 000 → 12 403 трикутники, **9 тріщин до 4 см** (у старої моделі було 18, до 7,8 см). Після скрипта лишилася одна, 1,8 см.
- Humanoid, 1,7 м; маркер паху опущено з пояса. Кліпи: Idle 1, Walking, Running, Thrust Slash (attack), Hit Reaction, Dead.
- Сирі файли: `art/meshy-source/rogue/rogue.glb` (новий, з заповненими тріщинами) і `rogue.meshy.glb` (оригінал Meshy). Стару модель збережено як `rogue.old.glb` (з жорстким кріпленням від сесії Blender) і `rogue.old.meshy.glb`.
- `npm run models rogue`: 6 205 / 12 411 / 12 411 трикутників, 0,73 / 1,21 / 2,39 МБ (`meshy-batch-3/rogue-v2-viewer.jpg`).
- **Піхви кинджалів на стегнах** скінені до тканини/ніг, як і в старій моделі. Можливо, їм ще потрібне жорстке кріплення за рецептом [fixes/rigid-accessories.md](fixes/rigid-accessories.md).

## Зброя в межах бюджету

Пресет Remesh 3K лишив дев'ять предметів на 1–4 % понад бюджет 3 000, і `tests/models` падав. Сирі файли предметів (Blender їх не правив) зменшено до 2 960 трикутників через meshoptimizer: нормалі й UV враховано як атрибути, тріщин немає. Потім `npm run models` для цих дев'яти. `tests/models`: усі тести проходять (коміт `8fff332`).
