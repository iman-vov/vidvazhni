# Пацюк-злодюжка · `cellar-rat`

**Тип:** монстр · **стильовий блок:** B · **черга:** №5 (Хвиля 1 — потрібні для Ф2) · **сценарії:** 1

**Куди зберегти:** `art/concepts/cellar-rat/` — `front.png`, `side.png`, `back.png`.

Окремий чат у ChatGPT для цієї моделі. Формат 1:1.

## 1. front → `front.png`

```text
Stylized fantasy game creature concept for conversion into a 3D model. Painted tabletop-miniature look, hand-painted textures, warm soft even lighting. Single creature, whole body visible, centered, three-quarter front view, standing on all four legs in a neutral standing pose, tail relaxed. Plain light grey background, no cast shadow, no text, no frame, no other objects. Square 1:1 image.

A plump grey cellar rat with a tiny stolen coin purse tied around its neck, mischievous eyes, wisps of grey mist in its fur.
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

- [ ] Рівно **одна** істота, видно все тіло, нічого не обрізано краєм.
- [ ] Рівний світло-сірий фон, **без тіні**, без тексту, рамки й підлоги.
- [ ] Стоїть на **всіх чотирьох лапах** у спокійній позі (не стрибає, не біжить), хвіст розслаблений, лапи не перекривають одна одну сильно.
- [ ] Вид пів-оберта спереду, як у блоці B.
- [ ] Ручний розпис, теплі тони; без крові й ран.
- [ ] Бік і спина — **той самий** дизайн: ті самі кольори, одяг, пропорції й поза, що на фронті.

Якщо щось не так — попросити ChatGPT виправити саме це в тому самому чаті («remove the cast shadow», «all four paws on the ground» тощо) або згенерувати знову.

## Meshy

- Image to 3D → модель **Meshy 7**, front головне; side і back — у Multi-View.
- Ріг: чотириногий скелет.
- Анімації з бібліотеки Meshy: idle, walk, attack, hit, death.
- Трикутників: 5–10 тис.; текстура до 1024 px.
