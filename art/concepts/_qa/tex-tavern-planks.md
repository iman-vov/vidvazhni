# QA: tex-tavern-planks

- Дата: 2026-10-23.
- Фінал: `concepts/tex-tavern-planks/front.png`, 1024×1024 PNG.
- Створено вбудованим image_gen. Вихід генератора 1254×1254 зменшено до 1024×1024 лише для потрібного розміру; малюнок та стики програмно не виправлялися.
- Оглянуто через view_image діагностику 2×2 точних копій без проміжків, спочатку оригіналу, потім фіналу. Фінальний QA-файл: `concepts/_qa/tex-tavern-planks-2x2.png`, 2048×2048.
- Помітних швів на стиках по обох осях не виявлено. Повторюваність сучків закономірна для тайла; невирішених проблем не виявлено.
- Строго згори, плоске рівне освітлення, теплий світлий ручний розпис, без окремих предметів, тексту, рамки чи сірого поля. Матеріал заповнює весь квадрат.

## Використаний промпт

```text
Seamless tileable hand-painted stylized game texture, viewed straight from above, no perspective, even flat lighting, no shadows, no objects, square 1:1.

Old wooden floor planks of a tavern cellar.

Create a 1024×1024 opaque texture. The material fills the ENTIRE square edge to edge: no background, no border, no framed slab, no perspective tile. Light warm adventurous fantasy mood, clean broad hand-painted color shapes like painted tabletop miniature scenery, stylized rather than photorealistic. Old honey-brown timber boards with restrained painted wood grain and occasional simple knots, readable board joints, no excessive scratches or gritty noise. Boards run vertically, consistent widths; opposite edges match exactly in color, board spacing and wood grain so the image repeats seamlessly in BOTH axes. No directional lighting, no vignette, no cast shadows, no text, no nails or separate objects. Only one final light version.
```
