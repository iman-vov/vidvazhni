# Кинджал Пройди · `rogue-dagger`

**Тип:** зброя · **стильовий блок:** D · **черга:** №11 (Хвиля 2 — решта героїв)

**Куди зберегти:** `art/concepts/rogue-dagger/` — `front.png`.

> Опис цього предмета написано окремо: у документі він лише згаданий, але тексту немає.

> Одна модель, кріпиться двічі — у ліву й праву руку (карта «Подвійний кинджал»). Кинджали в піхвах на поясі лишаються частиною персонажа.

Новий чат у ChatGPT, вставити один блок, формат 1:1.

## 1. front → `front.png`

```text
Single stylized fantasy game prop for conversion into a 3D model. Painted tabletop-miniature look, hand-painted textures, warm soft even lighting. Three-quarter view from slightly above, centered, whole object visible. Plain light grey background, no cast shadow, no text, no other objects. Square 1:1 image.

A short slightly curved dagger with a dark steel blade, a charcoal leather wrapped grip and a small violet gem in the pommel.
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
- Кріпиться в three.js до кісток обох кистей моделі `rogue`.
