# NPC identity-reference audit

Audit date: 2026-10-24. Identity sources take priority over prose in `prompts/ui/npc-portraits.md`; the latter is only a story-portrait pose, crop, palette, and rendering brief.

| NPC | Approved identity sources | Status / allowed interpretation |
| --- | --- | --- |
| `marta` | `ui-mockups/camp/assets/marta.png` | Sole identity source. Reuse its face, scarf, curls, blouse, and apron. Token only. |
| `bruno` | `docs/art/meshy-batch-3/bog-miller-meshy.png` (primary); `concepts/bog-miller/front.png`, `concepts/bog-miller/portrait.png`; `assets/models/bog-miller/bog-miller.glb` | Bruno is the cleaned Bog Miller: preserve the 3D face, light-brown hair, broad/chunky proportions, and apron cut. No moustache or bald redesign. Remove only swamp/cursed attributes. |
| `bog-miller` | `docs/art/meshy-batch-3/bog-miller-meshy.png` (primary); `concepts/bog-miller/front.png`, `concepts/bog-miller/portrait.png`; `assets/models/bog-miller/bog-miller.glb` | Approved transformed miller. Preserve millstone on left forearm, flour-sack apron, reeds/lilies, chunky silhouette, light hair and facial identity. |
| `shadowhand` | `docs/art/meshy-batch-3/shadowhand-meshy.png` (primary); `concepts/shadowhand/front.png`, `concepts/shadowhand/portrait.png`; `assets/models/shadowhand/shadowhand.glb` | Approved identity is low and pudgy, with painted grey hair, violet trim, short cloak, large face and gold chest orb. `concepts/_qa/shadowhand-views.md` explicitly supersedes the old tall/thin prose. |
| `lumo` | Newly designed per user clarification; style refs: `bruno.png`, `bog-miller.png`, `shadowhand.png`. | No pre-existing approved identity source. Shadowhand supplies subtle eye/hair family resemblance only. |
| `lina` | Newly designed per user clarification; shared repaired NPC style references. | No pre-existing approved identity source. Theo must retain her freckles and compatible face shape. |
| `theo` | Newly designed per user clarification; `lina.png` is the family reference. | No pre-existing approved identity source. Retains Lina's freckles and compatible face shape. |
| `heron` | Newly designed per user clarification; shared repaired NPC style references. | No pre-existing approved identity source. |

## Existing generated files

- `marta-token.png` is a close crop of `camp/assets/marta.png`; it preserves identity and excludes the lantern.
- `bruno.png` and `bruno-token.png` now use the approved 3D identity. The earlier invented assets are preserved in `history/rejected-identity/` and are not referenced by a manifest.

## Source evidence

- `docs/design/story.md`: old names map to `marta`, `miller` (Bruno), `lina`, `theo`, and `lumo` (Shadowhand's earlier name).
- `concepts/_qa/bog-miller-views.md`: approved Bog Miller UI portrait keeps the same face, leaves, flowers, and apron.
- `concepts/_qa/shadowhand-views.md`: approved Shadowhand UI portrait keeps the compact body, grey hair, violet trim, short cloak, and chest orb.
