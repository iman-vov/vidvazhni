# QA · tex-shallow-water

- Дата: 2026-10-23.
- Фінал: concepts/tex-shallow-water/front.png, PNG 1024×1024.
- Вбудований image_gen; один світлий варіант. Генератор повернув 1254×1254; виконано лише зменшення до 1024×1024, без домальовування чи виправлення швів фільтрами.
- Повнокадрова плоска текстура: строго згори, без перспективи, рамки, сірого поля, тексту й окремих предметів; камінці є частиною дна під водою. Світла бірюзова вода, теплі камінці, ручний розпис, рівне освітлення.
- 2×2: чотири точні копії фіналу без проміжків, 2048×2048, concepts/_qa/tex-shallow-water-2x2.png. Оглянуто через view_image після збереження фіналу. Видимих вертикальних/горизонтальних швів та розриву в центральному перехресті не помічено. Повторення мотиву при тайлінгу закономірно помітне; інших невирішених проблем не виявлено.
- README.md і REVIEW.md не змінювались.

## Використаний промпт

```text
Seamless tileable hand-painted stylized game texture, viewed straight from above, no perspective, even flat lighting, no shadows, no objects, square 1:1.

Shallow clear water over pebbles.

Create one final 1024×1024 image. Full-bleed flat material texture covering the ENTIRE square, with no background field, frame, margin, isolated tile, or perspective slab. Bright welcoming adventure fantasy, clean readable hand-painted color shapes like painted tabletop terrain, not realism. Clear pale turquoise shallow water with softly painted warm rounded pebbles visible beneath it, subtle gentle ripple marks, evenly distributed detail and brightness. No cast shadows, dramatic lighting, photorealism, foam, shore, plants, floating objects, text, or watermark. Truly seamless periodic texture: opposite left/right and top/bottom edges must join continuously with matching colors and painted features. Avoid large central motif and edge darkening. Single texture only, not a 2x2 preview.
```

