# QA — tex-cave-rock

- Дата: 2026-10-23.
- Фінал: concepts/tex-cave-rock/front.png, 1024×1024 PNG.
- Вбудований image_gen; один світлий фінальний варіант. Генератор повернув 1254×1254; виконано лише технічне зменшення до 1024×1024, без домальовування чи програмного виправлення швів.
- Діагностика: concepts/_qa/tex-cave-rock-2x2.png, 2048×2048, чотири точні копії фіналу без проміжків.
- Оглянуто через view_image: так, початковий та фінальний 2×2.
- Помітних горизонтальних/вертикальних швів або стрибків освітлення не виявлено. Повторюваність мотиву природно видима. Невирішених проблем не виявлено.
- Згори, без перспективи, предметів, тексту, рамки та сірого поля. Матеріал заповнює квадрат; локально темні тріщини є намальованою деталлю каменю.

## Використаний промпт

```text
Use case: stylized-concept. Asset: seamless repeating game terrain texture, 1024×1024 pixels.
Seamless tileable hand-painted stylized game texture, viewed straight from above, no perspective, even flat lighting, no shadows, no objects, square 1:1.
Rough dark cave rock with faint violet crystals.
Style lock: clean hand-painted tabletop fantasy miniature material, simplified broad painted shapes, welcoming light adventure mood. Preserve cave rock character with moderately dark warm gray and muted slate rock, readable lighter painted facets, sparse faint violet crystal mineral inclusions embedded flush in the rock, never separate objects. Flat diffuse albedo only, no directional lighting, no cast shadows, no deep black crevices, no glow bloom, no realistic noise. Entire square filled edge to edge by continuous material, no gray background, margins, border, isolated slab or perspective tile. Truly seamless in BOTH axes: opposite boundaries must join precisely, continuous rock contours and mineral marks wrapping across left/right and top/bottom edges. Irregular natural rock surface, no brick courses or obvious grid. No text, props or scenery. One final light version.
```

