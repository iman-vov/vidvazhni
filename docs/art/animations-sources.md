# Джерела анімацій

Звідки беруться кліпи фігур і які ліцензії в джерел, які ми переглядали. Перш ніж додавати чужий кліп, впишіть сюди джерело й ліцензію.

## Використано

| Фігура | Кліп у грі | Джерело | Ліцензія |
|---|---|---|---|
| герої й людиноподібні монстри | idle, walk, run, attack, hit, death | бібліотека анімацій Meshy, накладена на риг Meshy | ліцензія Meshy Premium (приватна, комерційна) |
| `bandit-crossbow` | attack | Meshy `Gun_Hold_Left_Turn`, перші 1,2 с (стійка до повороту), накладено на риг бандита в Meshy; користувач вивантажив `Meshy_AI_Masked_Trailblazer_All_Animations.glb` 2026-10-28. Під час атаки бандит повертається на +60°, бо стійка цілиться ≈62° праворуч | ліцензія Meshy Premium |
| `cellar-rat`, `grey-wolf`, `tinker-button`, `mountain-ram` | walk | Meshy Quadruped, кліп Walking | ліцензія Meshy Premium |
| ті самі чотирилапі | idle, attack, hit, death | ключі вручну в Blender ([quadruped-animations.md](quadruped-animations.md)) | наші |

## Переглянуто для пострілу з арбалета (2026-10-28)

| Джерело | Що є | Ліцензія | Висновок |
|---|---|---|---|
| [Бібліотека анімацій Meshy](https://docs.meshy.ai/en/api/animation-library) | 586 кліпів, усі для двоногих. Арбалета немає. Є `Gun_Hold_Left_Turn` (приклад біля плеча, зброя у двох руках, з кадру ≈68 стійка), `Rifle_Aim_Turn_Right`, `Rifle_Turn_Left`, `Walk_Forward_While_Shooting`, `Standing_Reload`, `Kneeling_Reload`, `Archery_Shot` | Meshy Premium | `Gun_Hold_Left_Turn` найкраще передає прицілювання з арбалета |
| [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) / [2](https://quaternius.com/packs/universalanimationlibrary2.html) | 120+ і 130+ кліпів, власний гуманоїдний риг; серед бойових кліпів «gun» — пістолетні пози з витягнутими руками | CC0 | приклада біля плеча немає; для арбалета гірше за Meshy |
| [Mixamo](https://www.mixamo.com/) | Firing Rifle, Rifle Aiming Idle та подібні | ліцензія Adobe/Mixamo (безкоштовно, і в комерційних проєктах) | доступ потребує входу в Adobe; не перевірено, бо Chrome-розширення не змогло керувати браузером |
| [Kenney](https://kenney.nl/assets) | анімовані персонажі з простими кліпами | CC0 | детально не перевіряли: прості персонажі з іншими пропорціями |

## Переглянуто для бігу чотирилапих (2026-10-28)

| Джерело | Що є | Ліцензія | Висновок |
|---|---|---|---|
| Meshy Quadruped | лише Walking | Meshy Premium | бігу немає |
| [Quaternius Ultimate Animated Animals](https://quaternius.com/packs/ultimateanimatedanimals.html) | 12 тварин, Gallop, Walk, Attack, Death тощо | CC0 | у кожної тварини свій скелет, тож переносити на риг Meshy Quadruped треба вручну по кістках, а довжина кроку не збіглася б з нашими пропорціями. Галоп ключуємо в Blender з траєкторій лап (див. [gait/README.md](gait/README.md)) |
| [OpenGameArt: Animated Animales Low Poly](https://opengameart.org/content/animated-animales-low-poly) | вовк, пес, кіт тощо від Quaternius | CC0 | та сама проблема зі скелетом |
| Платні або некомерційні набори (CGTrader, Superhive, Unreal Marketplace) | вовки й собаки з риссю та галопом | платні, некомерційні або без чіткої ліцензії | не використовуємо |
