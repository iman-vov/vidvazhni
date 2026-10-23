# QA: tex-forest-floor

- Фінал: concepts/tex-forest-floor/front.png, 1024×1024 PNG.
- Вбудований image_gen; один світлий варіант. Генератор повернув 1254×1254; виконано лише масштабування до 1024×1024, без домальовування чи виправлення швів.
- 2×2: concepts/_qa/tex-forest-floor-2x2.png, 2048×2048; чотири точні копії фіналу без проміжків. Оглянуто через view_image.
- Видимих швів на горизонтальному й вертикальному стиках під час огляду не виявлено. Повторення мотивів природно читається; невирішених проблем не виявлено.
- Строго згори, квадрат на весь кадр, без рамки, тексту, перспективи й сірого поля. Мох, коріння й листя намальовано як матеріал поверхні. Рівне освітлення, без падаючих тіней.

## Використаний промпт

```text
Seamless tileable hand-painted stylized game texture, viewed straight from above, no perspective, even flat lighting, no shadows, no objects, square 1:1.

Forest floor with moss, roots and fallen leaves.

Create a 1024×1024 opaque square flat albedo texture filling the ENTIRE canvas edge to edge. Warm, bright welcoming adventure fantasy mood, clean simplified painted shapes and broad brushwork like hand-painted tabletop terrain; no realism or noisy microdetail. Soft warm earth browns, fresh moss greens, warm ochre fallen leaves, and gently winding roots integrated into the ground material. Leaves and roots are painted surface motifs, no separate props. Balanced small-to-medium scale all-over distribution, no central focal motif. Truly seamless periodic texture: opposite edges must match exactly in colors and continuing motifs horizontally and vertically, with no visible boundary when repeated 2×2. Uniform flat lighting across the entire square; no cast shadows, ambient occlusion, directional highlights or vignette. Strict orthographic overhead view, no horizon, no perspective, no isolated tile, no borders, no gray background, no text, no frame, no objects or scene.
```

