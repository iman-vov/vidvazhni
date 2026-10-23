# Конвеєр моделей: від Meshy до гри

Одна команда перетворює сирий файл з Meshy (≈30 МБ, текстури PNG 2K/4K) на три легкі GLB для трьох рівнів графіки:

```bash
npm run models warden
```

Без аргументів команда обробляє всі `art/meshy-source/<id>/<id>.glb`. Окремі рівні можна зібрати так: `npm run models warden --tiers=low,medium`. Blender для цього не потрібен; він знадобиться лише тоді, коли модель перевищує бюджет трикутників.

## Три рівні

| Рівень | Файл | Текстури (WebP) | Меш | Кому | Як потрапляє в кеш PWA |
|---|---|---|---|---|---|
| low | `assets/models/<id>/<id>.low.glb` | ≤ 512 px, зброя й пропи ≤ 256 | спрощений до ≈50% трикутників | слабкі планшети й телефони | precache: гра працює офлайн одразу після першого відкриття |
| medium | `assets/models/<id>/<id>.glb` | ≤ 1024 px, зброя й пропи ≤ 512 | як у джерелі | iPad, флагманські Android, старі ноутбуки | `prefetchModels()` при старті кладе весь рівень у runtime-кеш |
| high | `assets/models/<id>/<id>.hq.glb` | роздільність джерела, до 4096 px | як у джерелі | ПК, Steam Machine | так само, як medium |

У всіх трьох однакові назви кліпів і кісток, однакові виправлення кліпів і стиснення meshopt. Сирий файл Meshy лишається поза git (`art/meshy-source/` у `.gitignore`), а всі три GLB комітяться.

## Як додати нову модель

1. **Згенерувати в Meshy** за рецептом з [пілоту Вартового](meshy-pilot.md#налаштування-meshy): Image to 3D (Meshy 7.1, Multi-view front+back, Resolution Standard, Texture 2K, A-Pose) → Remesh (Fixed, Triangle, ціль за бюджетом з `art/prompts/manifest.json`) → Rig → анімації → Download: glb, Skeleton template Mixamo, Animation All Added, Single file.
   - Персонажам з ригом потрібні **шість кліпів**: idle (пресет «Idle 1», бо «Idle» падає), Walking і Running (додаються з ригом), Attack, Hit Reaction, Dead. Магам додатково кліп із «Cast» або «Spell» у назві.
   - Зброю та пропи завантажувати без ригу й анімацій.
   - Texture Resolution у Meshy лишати 2K або більше: з цих текстур збирається рівень high.
2. **Покласти сирий файл** у `art/meshy-source/<id>/<id>.glb`, де `<id>` береться з маніфесту.
3. **Запустити** `npm run models <id>`. Скрипт запише три файли й надрукує по рядку на рівень (розмір, трикутники, текстури), таблицю та попередження:
   - `over the … budget`: трикутників більше за бюджет. Скрипт не спрощує medium і high; треба повторити Remesh у Meshy з меншою ціллю або зменшити модель у Blender.
   - `missing clips`: бракує кліпу з маніфесту. Варто довантажити анімацію в Meshy.
   - `matches no game clip name`: Meshy дав кліп з незнайомою назвою. Треба або перейменувати його в Meshy, або додати шаблон у `CLIP_PATTERNS` у `tools/optimize-models.mjs`.
4. **Перевірити**:
   - `npx vitest run tests/models`: для кожного рівня файл читається, у персонажа з ригом є шість кліпів, текстури не більші за ліміт рівня, трикутники вкладаються в бюджет, у low їх менше, ніж у medium, назви кліпів і вузлів однакові в усіх рівнях, кістки з `attachTo` існують у скелеті власника. Окремо перевіряється, що рівні low і medium усього складу разом важать до 60 МБ.
   - Подивитися модель в оглядачі: `npm run dev`, далі `http://localhost:5173/vidvazhni/dev/models.html?model=<id>`. Оглядач показує модель на клаптику дошки з тим самим світлом і нахилом камери, що в грі, і по черзі програє кліпи. Параметри:
     - `&quality=low|medium|high`: який рівень показати (за замовчуванням рівень пристрою);
     - `&compare=low` (або `medium`, `high`): ліворуч інший рівень, що грає ті самі кліпи;
     - `&compare=raw`: ліворуч сирий файл Meshy (лише idle);
     - `&view=close`: камера зблизька спереду;
     - `&clip=attack`: програвати лише цей кліп;
     - `&hand=right`: жовтий брусок на кістці руки (перевіряє прикріплення);
     - `&weapon=<id>`: прикріпити модель зброї;
     - `&env=1`: додати карту оточення (див. «Відкриті питання»).
5. **Закомітити** `assets/models/<id>/` (усі три файли). Проміжні `<id>-1k.glb` з Blender більше не потрібні.

## Що робить скрипт

`tools/optimize-models.mjs` працює на glTF-Transform 4.5, meshoptimizer і sharp. Спільні кроки виконуються один раз, далі документ клонується для кожного рівня.

| Крок | Що відбувається |
|---|---|
| Кліпи | Назви нормалізуються: `Idle_02` → `idle`, `Walking` → `walk`, `Running` → `run`, `Attack` → `attack`, `Hit_Reaction` → `hit`, `Dead` → `death`, `Cast…`/`Spell…` → `cast`. Другий кліп того самого типу отримує назву `attack2`. |
| Root motion | У всіх кліпах, крім `walk` і `run`, кістка `mixamorig:Hips` тримає X/Z першого ключа. Вертикаль лишається, тож присідання й падіння на місці, але `hit` більше не зсуває героя на 0,8 м убік, а `attack` не робить випаду на 0,34 м. |
| Анімації | `resample` прибирає зайві ключі (у Вартового було 30 fps, лишилось 14 тис. ключів на 6 кліпів). |
| Меш | `dedup`, `prune`, `weld`, далі `meshopt` (reorder + quantize + `EXT_meshopt_compression`). Позиції та нормалі квантуються до 16 біт, UV до 16 біт, ваги до 8 біт. |
| Спрощення (low) | `simplifyWithAttributes` з meshoptimizer: ціль 50% трикутників, межа похибки 1% радіуса меша. Він враховує нормалі й UV і може зводити вершини через UV-шви (`Permissive`). Звичайний `simplify` з glTF-Transform бачить лише позиції; на розрізаних UV-острівцях Meshy він зупинявся на 75%. Ваги скіну належать вершинам, тож вершини, що лишилися, зберігають кістки й ваги. |
| Текстури | Ліміт за рівнем і типом (таблиця вище). Формат WebP (якість 85, нормалі 90). Альфа-канал прибирається, якщо його ніхто не читає. Одноколірна текстура замінюється множником матеріалу. |
| Метадані | У `scene.extras.vidvazhni` записуються `id`, `kind`, `clips` і `attachTo` з маніфесту. GLTFLoader кладе їх у `scene.userData`, і `attachWeapon` бере звідти кістки. |

### Чому WebP, а не KTX2

- **WebP** читають і Safari на iPad (з iOS 14), і Chrome на Android; three.js підтримує його через `EXT_texture_webp` без додаткових декодерів. Скрипту вистачає `sharp` з npm без зовнішніх програм.
- **KTX2/Basis** зменшив би відеопамʼять: WebP на GPU розпаковується в RGBA, тобто ≈5,6 МБ на текстуру 1024² з mip-рівнями. На унікальну модель героя це ≈4 МБ у low, ≈17 МБ у medium і ≈134 МБ у high (2048² + 2048² + 4096²); копії однієї моделі ділять текстури. Але KTX2 потребує `toktx` (KTX-Software) поза npm, транскодер Basis у WASM у збірці та перевірки на обох планшетах. Для рівня high на ПК відеопамʼяті вистачає; повернутися до KTX2 варто, якщо medium на планшетах упреться в памʼять.

## Розміри

| Модель | Трикутники (low / medium / high) | Текстури (low / medium / high) | Сирий файл | low | medium | high |
|---|---|---|---|---|---|---|
| `warden` | 6 213 / 12 426 / 12 426 | 3 × 512² / 3 × 1024² / 2048², 2048², 4096² | 28,11 МБ | **0,82 МБ** | **1,48 МБ** | **3,26 МБ** |

Таблицю оновлюйте за виводом `npm run models` (він друкує такий самий рядок).

**Оцінка для всього складу** (за маніфестом: 9 героїв, 11 монстрів, 2 боси, 9 одиниць зброї, 13 пропів; розміри відносно Вартового):

| Рівень | Оцінка | Бюджет |
|---|---|---|
| low (precache, перше завантаження) | ≈ 20 МБ | ≤ 60 МБ разом з рештою ресурсів без озвучки |
| medium | ≈ 38 МБ | ≤ 60 МБ |
| high | ≈ 85 МБ | без ліміту; на ПК інтернет і диск не обмежують |

Розмір git: три рівні ≈ 140 МБ на весь склад. Окремі файли далекі від ліміту GitHub у 100 МБ, але репозиторій ростиме з кожною перегенерацією. Якщо моделі часто перероблятимуть, варто налаштувати Git LFS для `assets/models/**/*.glb`.

## Рівень графіки (`src/render/quality.ts`)

```ts
import { getGraphicsQuality, setGraphicsQuality, onGraphicsQualityChange, rendererPreset } from './render/quality';

getGraphicsQuality();          // 'low' | 'medium' | 'high': збережений вибір або автовизначення
setGraphicsQuality('high');    // зберігає в localStorage (vidvazhni.graphicsQuality) і сповіщає підписників
setGraphicsQuality(null);      // забути вибір і повернутися до автовизначення
```

| Пресет | Pixel ratio | Згладжування | Тіні | Карта тіні |
|---|---|---|---|---|
| low | 1 | ні | немає | — |
| medium | ≤ 1,5 | так | лише від героїв | 1024 |
| high | ≤ 2 | так | від усіх моделей | 2048 |

`render/board.ts` застосовує пресет під час створення рендерера, а при зміні рівня одразу оновлює pixel ratio й тіні. Згладжування WebGL задається лише при створенні контексту, тож воно зміниться на наступній дошці. `loadModel` вмикає `castShadow` за пресетом і типом моделі (`castsShadow`).

**Автовизначення** (`detectGraphicsQuality`) працює з рядком GPU з `WEBGL_debug_renderer_info`, `MAX_TEXTURE_SIZE`, `hardwareConcurrency`, `deviceMemory` і `maxTouchPoints`:

- програмний рендер (SwiftShader, llvmpipe) → low;
- без сенсорного екрана й з немобільним GPU (ПК, ноутбук, Steam Machine) → high. Винятки: старі Intel HD/UHD, менше 4 ядер або текстури менше 8192 px → medium. Intel Iris Xe (сімейний ПК) отримує high;
- iPad/iPhone (Apple GPU із сенсором або iOS у user agent) → medium. WebKit не показує точний GPU, а A16 і новіші тягнуть medium;
- Android із флагманським GPU (Adreno 7xx/8xx, Mali-G77/G78/G7xx/G9xx, Immortalis, Xclipse) і ≥ 8 ГБ → medium;
- усе інше, зокрема невідомі сенсорні пристрої → low. Сюди потрапляє цільовий Android-планшет середнього класу (30 fps).

Гравець завжди може змінити рівень у налаштуваннях; UI для цього ще не зроблено.

## Завантаження в грі (`src/render/models.ts`)

```ts
import { loadModel, attachWeapon, prefetchModels } from './render/models';

void prefetchModels();                          // при старті: весь поточний рівень у runtime-кеш (для low нічого не робить)
const warden = await loadModel('warden');       // рівень за getGraphicsQuality(); { quality: 'high' } задає явно
scene.add(warden.scene);                        // ступні на y = 0, обличчя в +Z
warden.play('walk');                            // crossFade 0,2 с за замовчуванням
warden.play('attack');                          // один раз, далі сам повертається в idle
warden.play('death');                           // один раз, тримає останній кадр
warden.update(dt);                              // щокадру, поки грає кліп
await attachWeapon(warden, 'warden-shield');    // той самий рівень, кістки з manifest attachTo.bones
```

- Якщо потрібного рівня немає, `loadModel` бере medium, потім low. `warden.quality` показує, що завантажено.
- GLB підключаються через `import.meta.glob(..., { query: '?url' })`, і Vite кладе їх у `dist/assets` з хешем. Workbox (`vite.config.ts`) робить precache лише для `*.low-*.glb`; решта `.glb` йде через маршрут CacheFirst з кешем `vidvazhni-models`. `prefetchModels` наповнює цей кеш і видаляє з нього файли інших рівнів. Перевірено на збірці з service worker: у precache лише `warden.low`; після `prefetchModels('high')` у кеші лежить `warden.hq`, після `'medium'` лише `warden`, після `'low'` кеш порожній.
- У `attachTo.bones` маніфесту записані імена з GLB (`mixamorig:LeftHand`). GLTFLoader прибирає з імен `:`, тож у сцені кістка зветься `mixamorigLeftHand`; `findBone` приймає обидва варіанти.
- Положення зброї в долоні доведеться підбирати для кожної моделі окремо: `attachWeapon(model, id, { position, rotation, scale })`.

## Відкриті питання

- **Хто викликає `prefetchModels()` при старті.** Функція готова, але `main.ts` поза межами цієї роботи; виклик треба додати туди, а також після `setGraphicsQuality` у майбутньому UI налаштувань.
- **Метал темний без карти оточення.** Дошка має лише hemisphere + directional світло, а броня Meshy металева (metallic до 1), тож вона виглядає майже чорною. З `RoomEnvironment` через PMREM (`&env=1` в оглядачі) Вартовий виглядає як у Blender: `pipeline/04-without-and-with-env-map.jpg`.
- **Модель на дошці.** `board.ts` поки не дає додати обʼєкт у сцену й рендерить лише на вимогу, а мікшеру потрібен цикл кадрів, поки грає кліп. Тіні вже налаштовані (сонце накриває дошку, плити приймають тінь), але кидати їх поки нічому: фішки тіні не кидають.
- **Масштаб.** Вартовий має зріст 1,70 м, а гекс 2 одиниці від кута до кута; масштаб героя на дошці ще не обрано (`&scale=` в оглядачі).
- `modelFile` у маніфесті вказує на `assets/models/<id>.glb`, а конвеєр пише `assets/models/<id>/<id>.glb`.

## Знімки

- `pipeline/01-raw-vs-optimized.jpg`: ліворуч сирий файл (28 МБ), праворуч medium (1,5 МБ), однакове світло.
- `pipeline/02-game-view.jpg`: ракурс камери гри.
- `pipeline/03-attack-hit-death.jpg`: attack, hit і death залишаються на своєму гексі; у правій руці жовтий маркер кістки.
- `pipeline/04-without-and-with-env-map.jpg`: світло дошки зараз і з картою оточення.
- `pipeline/05-low-vs-medium.jpg`: ліворуч low (6 213 трикутників, 512²), праворуч medium в idle, attack і death. Скінінг без розривів, силует той самий, текстура мʼякша.
- `pipeline/06-low-vs-high-game-view.jpg`: у ракурсі гри ліворуч low, праворуч high.
