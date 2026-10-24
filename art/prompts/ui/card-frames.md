# Рамки карт героїв: кольори й промпт для ChatGPT

Кожен із шести героїв має **один свій колір**. Цим кольором малюються рамка карти, плашка з назвою, сорочка карти, кільце активної фігури на полі, обвідка портрета і шторка «Передай планшет».

Кольори підібрано так, щоб:
- не зливатися з тремя кулями стихій (вогонь — помаранчевий, земля — бурий, вітер — блідо-блакитний);
- не зливатися з золотом інтерфейсу;
- розрізнятися не лише відтінком, а й яскравістю. Тому мідь Майстра темна, а мед Травниці світлий.

| Герой | id | Колір | HEX | Матеріал і мотив |
|---|---|---|---|---|
| Вартовий | `warden` | сталево-синій | `#3B6FB6` | полірована сталь, гербовий щит, заклепки |
| Лучниця Вітру | `wind-archer` | смарагдовий | `#2FA36B` | смарагдова тканина, листя, пір'я, вигин лука |
| Травниця | `herbalist` | медово-вохристий | `#E0B040` | світле дерево, сушені трави, квітучий терен, льон |
| Пройда | `rogue` | фіалковий | `#7E4FC4` | фіолетовий оксамит, графіт, нічні дахи, місяць |
| Стихійник | `elementalist` | малиново-червоний | `#C23B4E` | темний камінь, чотири кристали (вогонь, лід, вітер, земля) |
| Майстер | `tinker` | темна мідь | `#A65E2E` | мідь і латунь, шестерні, креслення, заклепки |

Ці HEX також ідуть у дані героїв (`data/heroes/<id>.json`, поле `color`), щоб гра брала колір саме героя, а не номер гравця.

## Промпт (вставити в ChatGPT одним повідомленням)

```
Design sheet for a cozy fantasy tabletop adventure game (family co-op, Gloomhaven-like), for an iPad. Show SIX ability cards side by side in one row, plus below each one its CARD BACK. Same layout on every card, only the colour and decoration differ.

Card layout (portrait card, 2.5:3.5): card name in a banner at the top; a large initiative number in a round medallion in the centre; a TOP action area above the medallion and a BOTTOM action area below it, each with a short line of placeholder text and simple icons (attack, move, heal, range); small corner marks for "lost" and "experience". Keep text areas plain and readable (light parchment inside), all decoration lives in the frame.

Each hero has ONE signature colour used for the frame, the name banner and the card back:
1. Warden — steel blue #3B6FB6: polished steel frame, heraldic shield on the back, rivets.
2. Wind Archer — emerald green #2FA36B: emerald cloth, leaves and feathers, bow curve on the back.
3. Herbalist — honey ochre #E0B040: light wood, dried herbs, flowering blackthorn, linen; sprig on the back.
4. Rogue — violet #7E4FC4: violet velvet, graphite, night rooftops and a crescent moon on the back.
5. Elementalist — crimson #C23B4E: dark stone frame set with four small crystals (orange fire, pale-blue ice, white-teal wind, brown earth); crystal rosette on the back.
6. Tinker — dark copper #A65E2E: copper and brass, gears, blueprint lines; a gear emblem on the back.

Style: warm hand-painted fantasy, parchment inside the card, thin gold inner line on every frame so they belong to one set. Light, friendly, not dark or gritty. The six colours must be clearly distinguishable from each other at a glance, also by brightness. Plain neutral background, no text other than placeholder labels "Назва карти", "Атака 3", "Рух 2". No device frame, no hands.
```

Результат класти в `art/ui-mockups/card-frames/` (як і інші екрани).
