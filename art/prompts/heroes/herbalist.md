# Травниця · `herbalist`

**Тип:** герой · **стильовий блок:** A · **черга:** №8 (Хвиля 2 — решта героїв)

**Куди зберегти:** `art/concepts/herbalist/` — `front.png`, `side.png`, `back.png`, `portrait.png`.

Окремий чат у ChatGPT для цієї моделі. Формат 1:1.

## 1. front → `front.png`

```text
Stylized fantasy game character concept for conversion into a 3D model. Painted tabletop-miniature look: slightly chunky proportions, head about one fifth of body height, large hands, hand-painted textures, warm soft even lighting. Single character, full body, centered, front view, standing in a relaxed A-pose with arms angled down about 45 degrees away from the body, legs slightly apart, empty open hands. Plain light grey background, no cast shadow, no text, no frame, no other objects. Square 1:1 image.

A warm village herbalist woman in her thirties in a moss-green dress with an ochre apron full of small pouches, a wreath of wildflowers in her hair, a satchel of herbs at her hip, a kind smile. Color accents: warm green and ochre.
```

## 2. side → `side.png`

У **тому самому чаті**, лише коли фронт уже подобається.

```text
Show exactly the same character with identical design, colors, proportions and A-pose, seen from the left side. Same background and lighting.
```

## 3. back → `back.png`

```text
Show exactly the same character with identical design, colors, proportions and A-pose, seen from behind. Same background and lighting.
```

## 4. portrait → `portrait.png`

Там само, після бокового й заднього вигляду. Для іконки в інтерфейсі, у Meshy не йде.

```text
Portrait bust of exactly the same character, same style and colors, facing slightly to the side, soft neutral background, square 1:1, for a game UI icon.
```

## Перевірити перед тим, як прийняти

- [ ] Рівно **один** персонаж, видно все тіло від маківки до ступнів, нічого не обрізано краєм.
- [ ] Рівний світло-сірий фон, **без тіні** під ногами, без тексту, рамки, підлоги чи декорацій.
- [ ] **A-поза**: руки опущені десь на 45° від тулуба, долоні не торкаються тіла, ноги трохи розставлені.
- [ ] **Порожні руки** — нічого не тримає (ні зброї, ні щита, ні посоха): предмети робимо окремими моделями.
- [ ] Пропорції мініатюри: трохи пухкі, голова ≈ ⅕ зросту, великі кисті; не чібі й не реалізм.
- [ ] Ручний розпис, теплі м'які тони; без крові й ран.
- [ ] Вид строго спереду (не пів-оберта).
- [ ] Бік і спина — **той самий** дизайн: ті самі кольори, одяг, пропорції й поза, що на фронті.

Якщо щось не так — попросити ChatGPT виправити саме це в тому самому чаті («remove the cast shadow», «make both hands empty», «arms in A-pose, 45 degrees from the body» тощо) або згенерувати знову.

## Meshy

- Image to 3D → модель **Meshy 7**, front головне; side і back — у Multi-View.
- Увімкнути позу спокою (A-pose) для персонажа.
- Ріг: гуманоїдний скелет.
- Анімації з бібліотеки Meshy: idle, walk, attack, hit, cast, death.
- Трикутників: 8–15 тис.; текстура до 1024 px.
