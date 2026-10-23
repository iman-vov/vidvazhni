# Болотяний слиз · `bog-slime`

**Тип:** монстр · **стильовий блок:** C · **черга:** №22 (Хвиля 3 — монстри в порядку сценаріїв) · **сценарії:** 3

**Куди зберегти:** `art/concepts/bog-slime/` — `front.png`, `side.png`, `back.png`.

Окремий чат у ChatGPT для цієї моделі. Формат 1:1.

## 1. front → `front.png`

```text
Stylized fantasy game creature concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted textures, warm soft even lighting. Single creature, whole body visible, centered, front view, neutral resting pose. Plain light grey background, no cast shadow, no text, no frame, no other objects. Square 1:1 image.

A wobbly blob of murky green translucent swamp slime with bits of reeds inside and two big round eyes, cute but gross.
```

## 2. side → `side.png`

У **тому самому чаті**, лише коли фронт уже подобається.

```text
Show exactly the same creature with identical design, colors, proportions and pose, seen from the left side. Same background and lighting.
```

## 3. back → `back.png`

```text
Show exactly the same creature with identical design, colors, proportions and pose, seen from behind. Same background and lighting.
```

## Перевірити перед тим, як прийняти

- [ ] Рівно **одна** істота, видно цілу, нічого не обрізано краєм.
- [ ] Рівний світло-сірий фон, **без тіні**, без тексту й рамки.
- [ ] Нейтральна спокійна поза, вид спереду.
- [ ] Ріг не потрібен: анімує код, тож форма має бути простою й цілісною, без тонких відокремлених шматків.
- [ ] Бік і спина — **той самий** дизайн: ті самі кольори, одяг, пропорції й поза, що на фронті.

Якщо щось не так — попросити ChatGPT виправити саме це в тому самому чаті («remove the cast shadow», «plain light grey background» тощо) або згенерувати знову.

## Meshy

- Image to 3D → модель **Meshy 7**, front головне; side і back — у Multi-View.
- Ріг: без рігу.
- Анімації робить код: гойдання, стискання-розтягування, мерехтіння.
- Трикутників: 5–10 тис.; текстура до 1024 px.
