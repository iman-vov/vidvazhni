# QA — tex-cobblestone

- Фінал: concepts/tex-cobblestone/front.png, 1024×1024 PNG.
- Створено вбудованим image_gen, один світлий варіант. Генератор повернув 1254×1254; виконано лише технічне зменшення до 1024×1024, без домальовування чи виправлення швів.
- Діагностика: concepts/_qa/tex-cobblestone-2x2.png, 2048×2048, чотири точні копії фіналу без проміжків.
- 2×2 оглянуто через view_image: так. Видимих прямих стиків, розривів каменів або перепадів освітлення на межах не виявлено. Природна повторюваність малюнка є. Невирішених проблем не виявлено.
- Чекліст: строго згори; квадрат; рівне освітлення; без перспективи, окремих предметів, тексту, рамки й сірого поля. Повна заливка квадрата — за погодженим винятком. Світлий стилізований ручний розпис.

## Використаний промпт

```text
Seamless tileable hand-painted stylized game texture, viewed straight from above, no perspective, even flat lighting, no shadows, no objects, square 1:1.

Grey cobblestone dungeon floor.

Output 1024×1024. Flat albedo material artwork fills the ENTIRE square edge to edge, no background margin, no frame, no isolated slab. Light welcoming adventure fantasy mood; clean readable rounded cobblestones painted by hand like painted tabletop miniature scenery, simple broad brush color patches, warm light grey stone with restrained subtle warm/cool variation and narrow muted grey joints. No realism, grain, dirt noise, dramatic shading, cast shadows, ambient occlusion, vignette, text, objects, moss or decoration. Uniform flat illumination and consistent material scale everywhere. Truly seamless periodic pattern: left/right and top/bottom stone shapes, joints and colors must continue exactly across opposite boundaries, with cropped stones wrapping correctly. Only one final light texture.
```

