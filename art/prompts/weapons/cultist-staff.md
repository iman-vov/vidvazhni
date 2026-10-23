# Посох культиста · `cultist-staff`

**Тип:** зброя · **стильовий блок:** D · **черга:** №25 (Хвиля 3 — монстри в порядку сценаріїв) · **сценарії:** 4, 5

**Куди зберегти:** `art/concepts/cultist-staff/` — `front.png`.

> Опис цього предмета написано окремо: у документі він лише згаданий, але тексту немає.

Новий чат у ChatGPT, вставити один блок, формат 1:1.

## 1. front → `front.png`

```text
Single stylized fantasy game prop for conversion into a 3D model. Painted tabletop-miniature look, hand-painted textures, warm soft even lighting. Three-quarter view from slightly above, centered, whole object visible. Plain light grey background, no cast shadow, no text, no other objects. Square 1:1 image.

A tall dark wooden staff topped with a silver crescent moon, a small violet crystal floating inside the crescent, thin violet ribbons wrapped below it.
```

## Перевірити перед тим, як прийняти

- [ ] Рівно **один** предмет, видно повністю, нічого не обрізано краєм.
- [ ] Рівний світло-сірий фон, **без тіні**, без підставки, руки чи інших предметів.
- [ ] Вид пів-оберта трохи згори.
- [ ] Ручний розпис у тому самому стилі, що й персонажі.
- [ ] Предмет можна природно взяти в кисть: місце хвату чітко видно.

Якщо щось не так — попросити ChatGPT виправити саме це в тому самому чаті («remove the cast shadow», «show the whole object» тощо) або згенерувати знову.

## Meshy

- Image to 3D → модель **Meshy 7**, одне зображення front, без Multi-View.
- Ріг: без рігу.
- Трикутників: до 3 тис. (орієнтир, у документі немає); текстура до 1024 px.
- Кріпиться в three.js до кістки правої кисті моделі `gloom-cultist`.
