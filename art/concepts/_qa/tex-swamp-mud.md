# QA · tex-swamp-mud

- Фінал: `C:\Braves\art\concepts\tex-swamp-mud\front.png`, 1024×1024 PNG.
- Генератор: вбудований image_gen; один світлий фінальний варіант. Запитано 1024×1024; фактичний вихід 1254×1254 зменшено до 1024×1024. Малюнок і шви програмно не виправлялися.
- 2×2: точні копії фінального файла без проміжків, 2048×2048, `tex-swamp-mud-2x2.png`; оглянуто через view_image після зменшення фіналу.
- Результат: помітних горизонтальних/вертикальних швів або розривів кольору не виявлено. Повтор малюнка розпізнається, як у будь-якої повторюваної текстури.
- Стиль/композиція: матеріал заповнює весь квадрат; ручний розпис, теплий болотний бруд, оливкові калюжі й намальований очерет; без рамки, сірого поля, перспективної плитки чи тексту. Невирішених проблем під час візуальної перевірки не виявлено.

## Використаний промпт

```text
Seamless tileable hand-painted stylized game texture, viewed straight from above, no perspective, even flat lighting, no shadows, no objects, square 1:1.

Dark swamp mud with puddles and reeds.

Use case: stylized-concept. Asset: flat game terrain albedo texture, 1024×1024 pixels. Fill the entire square edge to edge with material; no grey background, border, margin, isolated tile, raised slab or presentation scene. Bright welcoming adventure fantasy mood, warm painterly tabletop-game style with simple clean painted patches and readable shapes, not photographic, not gritty. Preserve the swamp material: warm earthy brown mud with locally darker wet patches, muted olive-green shallow puddles, sparse small reeds painted flat into the surface. Reeds are part of the flat surface pattern, never upright objects. Uniform flat diffuse illumination; no cast shadows, dramatic highlights, vignette, directional lighting, perspective, horizon, text, props or characters. Seamless periodic pattern: exactly match opposite edges in both axes, including colors and painted contours; no central composition or edge framing. Make the pattern flow naturally across all four borders.
```

