# Зброя в руках: чекліст по фігурах

Кожен рядок я позначав лише після того, як сам переглянув контакт-лист фігури: idle 30 %, attack 35 % і 55 %, walk 50 %; спереду, з правого і з лівого боку. Лист знімається так: `dev/models.html?sheet=1&model=<id>&weapon=<зброя,…>`. Перелік фігур — усі моделі з кліпами в `assets/models` плюс монстри з `data/monsters`.

✅ — перевірено, виглядає правдоподібно. «—» — зброї немає за задумом (маніфест, `items: []`), перевірено лише, що руки порожні і нічого не висить.

| Фігура | Тип | Зброя | idle | attack | walk | масштаб | Лист | Примітка |
|---|---|---|---|---|---|---|---|---|
| warden | герой | щит (ліва), меч (права) | ✅ | ✅ | ✅ | ✅ | [warden.jpg](warden.jpg) | Меч новий, з Blender. Атака — удар щитом, меч іде слідом |
| wind-archer | герой | лук (ліва) | ✅ | ✅ | ✅ | ✅ | [wind-archer.jpg](wind-archer.jpg) | Лук проходить крізь кулак; на пострілі вертикальний, тятива до лучниці |
| herbalist | герой | посох (права) | ✅ | ✅ | ✅ | ✅ | [herbalist.jpg](herbalist.jpg) | |
| rogue | герой | кинджали (обидві) | ✅ | ✅ | ✅ | ✅ | [rogue.jpg](rogue.jpg) | Руків'я в кулаці, клинок з боку великого пальця. На 55 % атаки долоні розкриті (кидок у кліпі) |
| elementalist | герой | — | — | ✅ | ✅ | — | [elementalist.jpg](elementalist.jpg) | Магія з рук, предметів немає |
| tinker | герой | гайковий ключ (права) | ✅ | ✅ | ✅ | ✅ | [tinker.jpg](tinker.jpg) | |
| tinker-button | виклик | — | — | ✅ | ✅ | — | [tinker-button.jpg](tinker-button.jpg) | Пес-автоматон, рук немає |
| bandit-brute | монстр | дубина (права) | ✅ | ✅ | ✅ | ✅ | [bandit-brute.jpg](bandit-brute.jpg) | Була біля руки й за середину; тепер за кінець руків'я |
| bandit-crossbow | монстр | арбалет (ліва) | ✅ | ✅ | ✅ | ✅ | [bandit-crossbow.jpg](bandit-crossbow.jpg) | Ліва рука на цівці, приклад біля щоки, доворот атаки −60°. Арбалетного кліпу в Meshy немає |
| gremlin | монстр | рогатка (ліва) | ✅ | ✅ | ✅ | ✅ | [gremlin.jpg](gremlin.jpg) | Атака в кліпі — кидок, тож рогатка йде над головою |
| gloom-cultist | монстр | посох (права) | ✅ | ✅ | ✅ | ✅ | [gloom-cultist.jpg](gloom-cultist.jpg) | |
| cellar-rat | монстр | — | — | ✅ | ✅ | — | [cellar-rat.jpg](cellar-rat.jpg) | Звір |
| grey-wolf | монстр | — | — | ✅ | ✅ | — | [grey-wolf.jpg](grey-wolf.jpg) | Звір |
| thornling | монстр | — | — | ✅ | ✅ | — | [thornling.jpg](thornling.jpg) | Б'є руками-гілками |
| stone-sentinel | монстр | — | — | ✅ | ✅ | — | [stone-sentinel.jpg](stone-sentinel.jpg) | Кам'яні кулаки |
| mountain-ram | монстр | — | — | ✅ | ✅ | — | [mountain-ram.jpg](mountain-ram.jpg) | Звір |
| night-moth | монстр | — | — | ✅ | ✅ | — | [night-moth.jpg](night-moth.jpg) | Метелик |
| bog-slime | монстр | — | — | — | — | — | немає | Без рігу і кліпів, анімація кодом; рук немає |
| shadow-wraith | монстр | — | — | — | — | — | немає | Без рігу і кліпів, анімація кодом; рук немає |
| bog-miller | бос | мішок борошна (права) | ✅ | ✅ | ✅ | ✅ | [bog-miller.jpg](bog-miller.jpg) | Висить за зав'язку, б'є мішком |
| shadowhand | бос | — | — | ✅ | ✅ | — | [shadowhand.jpg](shadowhand.jpg) | Заклинач, порожні руки |
| hammerfist | бос | — (молот-кулак у моделі) | ✅ | ✅ | ✅ | ✅ | [hammerfist.jpg](hammerfist.jpg) | Кам'яний кулак — частина моделі |

Не залишилось жодного рядка без перевірки.
