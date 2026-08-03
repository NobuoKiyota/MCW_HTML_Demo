# Handoff: Blender Whole-Ship Assembly (2026-08-03)

This picks up after `HANDOFF_PARTS_PIPELINE.md` (individual-part GN generation). That
document is still accurate for the per-category batch generator (`Generate Variants`).
This one covers the **Assembly system** built on top of it: joining fuselage + wings
into one coherent ship instead of hand-placing/guessing offsets in the three.js tool.

Everything below is implemented in `fighter_gen_addon.py`, deployed via
`install_addon.ps1` / `update_addon.bat` (restart Blender to pick up changes -- no
manual re-enable needed). Addon version at handoff time: `bl_info` still says `0.11.0`
in the header; bump it if you want to track this phase explicitly.

## What exists now

### Assembly operators (panel: "🔧 Assembly (experimental)")
- `fightergen.assemble_fighter` -- generates a fresh fuselage + main wing (+ sub-wing if
  enabled, + ailerons if enabled), all raycast-attached, all in the `FighterGen_Assembly`
  collection.
- `fightergen.reroll_main_wing` -- keeps the existing fuselage (and sub-wing, if present),
  regenerates only the main wing (+ its aileron if one existed).
- `fightergen.reroll_sub_wing` -- same, but for the sub-wing only.
- Two checkboxes right above the Assemble button (not buried in Advanced):
  `assemble_subwing_enable` (default True), `assemble_aileron_enable` (default False,
  explicitly experimental).

### Attachment philosophy (the whole point of this phase)
Every join is done by **raycasting against the actual evaluated mesh** of the parent
part, in the parent's own local space, instead of a bounding-box guess:
- `sample_hull_offset(fuselage_obj, y, direction)` -- finds the fuselage's real hull
  radius at a given length position. Used to seat the wing root flush against whatever
  silhouette the randomized fuselage happened to produce.
- `sample_wing_trailing_edge(wing_obj, x_local)` -- finds a wing's real trailing-edge
  surface at a given span position. Used to seat an aileron.

**Two raycast direction bugs were found and fixed this session; if you add a third
level of raycast attachment (e.g. weapons mounted on a wing), re-derive the correct
origin/direction from scratch rather than copy-pasting -- both bugs were exactly this
kind of copy-paste-without-re-deriving mistake:**
1. `build_wings_template`'s GN graph negates X internally (see `n_new_x`), so a wing
   object's own local mesh spans **0 to -Span**, not 0 to +Span. The `+X = outward`
   direction only exists after the wing object's own `scale.x = -1` flip. Forgetting
   this sent the aileron to the wrong side of the fuselage.
2. `sample_wing_trailing_edge` must start its ray origin on the far side *past* the
   trailing edge and travel *toward* it, or the ray hits the leading edge first (first
   surface encountered) and never reaches the trailing edge at all. Direction is
   `(0, 1, 0)` (approach from -Y, travel toward +Y), not the more "obvious"
   `(0, -1, 0)`.

### Mirror-link (left/right symmetry)
Wings/sub-wings/ailerons are each a **single object** with a live `MIRROR` modifier
(`mirror_object = fuselage`), not two separately-generated objects. Editing one side
(GN params, Edit Mode, whatever) keeps the other side in sync automatically.

**Critical ordering rule, found via a real bug (see conversation, not reproduced in
git history): finishing modifiers (Remesh/Solidify/Bend/Twist/Taper) must be added to
the object BEFORE the Mirror modifier.** Twist and Taper compute their deform range
from the object's own bounding box; if that box is computed post-Mirror, it isn't
centered on the true mirror plane (the object's own root offset skews it), so the two
mirrored halves get twisted/tapered by different amounts and end up visibly lopsided.
`_generate_wing_pair` now calls `add_optional_modifiers(wing, s, rng, 'X')` *before*
adding the `MirrorToLeft` modifier -- keep it in that order if you touch this function.

### Fuselage silhouette control
- `fuselage_archetype` enum: `RANDOM` (default), `ORGANIC` (old random-walk N-point
  profile), `WEDGE`, `CYLINDER`, `TRAPEZOID`, `DIAMOND`. The four new ones use a small
  *fixed* set of straight-line (`VECTOR` handle) control points with light jitter,
  specifically because cranking up point count/smoothness on the old ORGANIC mode made
  shapes look like "an unripe vegetable" (direct user feedback) -- more random points
  with smooth handles just accumulates noise, it doesn't read as more detailed.
- `VerticalPinch` (fuselage GN input, `fuse_vpinch_min/max` settings): asymmetric
  top/bottom cross-section scaling via `sign(local Z)`, so the hull can read as
  "flat belly, domed back" (or the reverse) instead of a perfectly even radial ellipse
  -- user specifically asked to break the "4-way even" symmetric-tube look.
- Wing `RootThickness`/`TipThickness` (replacing a hardcoded root-biased curve): linear
  taper control, independently reversible, for a less "flat/cheap" wing cross-section.

### Twist/Taper (SimpleDeform, defaults ON)
`use_twist`/`use_taper` + `twist_angle_min/max`/`taper_factor_min/max`, randomized
*per variant* (unlike `use_bend`, which is still a single fixed value applied uniformly
-- that inconsistency is pre-existing, not something introduced this session, and
hasn't been unified). These are what the user meant by "edge-sharp/pointed" shapes;
tested safe up to Taper=-0.9/Twist=90° without mesh breakage.

### Sub-wing (canard) tuning
`_generate_sub_wing` calls the shared `_generate_wing_pair` with
`size_scale=assemble_subwing_scale` (default **0.32**, was 0.5 -- lowered because 0.5
read as "a second full wing," not a small canard) and `sweep_floor_frac=0.6` (forces
Sweep to at least 60% of `wing_sweep_max` regardless of the random draw). Without the
floor, a low-sweep random draw made the sub-wing sit near-parallel to the main wing,
which read as two redundant overlapping blades instead of a distinct forward element.
If you add more "child" parts off the main wing/sub-wing later, this
size_scale + sweep_floor_frac pattern is the reusable knob, not new independent
min/max sliders (see "Simplify" note below).

## Known-imperfect / not fully solved

- **[SOLVED] Aileron attachment robustness (2026-08-03 Update)**: Upgraded `sample_wing_trailing_edge` with Z-offset retries and added multi-point trailing-edge sampling (5 points) with full 3D orthonormal basis fitting (Tangents + Surface Normals -> Rotation Matrix). Verified 100% stable across 10/10 extreme trials (Twist 90°, Taper -0.8, Sweep/Dihedral) via `test_aileron_robustness.py`.
- **[SOLVED] Tail + Canopy Raycast-Assembly Integration (2026-08-03 Update)**: Added `_generate_tail_assembly` and `_generate_canopy_assembly` with raycast attachment against the fuselage hull. Added UI toggles (`assemble_tail_enable`, `assemble_canopy_enable`) and individual reroll operators (`fightergen.reroll_tail`, `fightergen.reroll_canopy`). Verified 100% stable across 10/10 full ship assembly trials via `test_full_assembly.py`.
- **Drone-type (non-fighter-jet) archetype is not started.** User explicitly deferred
  this until fighter connections (wing/sub-wing/tail/nose) are done; asked to sequence
  it after, not in parallel.
- **"Individual gacha" (pick from a pre-generated library instead of always generating
  fresh) is only partially addressed** -- `Reroll Main Wing Only` / `Reroll Sub Wing
  Only` / `Reroll Tail Only` / `Reroll Canopy Only` let you keep parts and reroll another *within Assembly*, but there's no way yet to pull a specific previously-exported GLB from the batch-generated library into an Assembly slot.

## Working conventions established this session (keep following these)

- **Axis convention** (do not deviate): part "length"/"forward" = local **+Y**; local
  **Z** = up. Wings/tails use X (or Z for tails) = span, Y = chord, Z (or X) = thickness.
  This is required for `export_yup=True` glTF export to match the three.js tool's
  Z-forward convention.
- **Simplify, don't add sliders.** The user explicitly asked to collapse most
  fine-grained random-range sliders behind a single "Advanced Parameters" disclosure
  triangle (`s.show_advanced`, default closed) because they're rarely touched --
  fine-tuning happens by hand-editing the generated object directly in Blender, not by
  re-rolling with adjusted ranges. When adding a new part/feature, default it to a
  sensible always-works behavior (see `RANDOM` archetype/weapon-type defaults, Twist/
  Taper defaulting ON) rather than adding a new user-facing slider set. Toggles that
  meaningfully change output (Include Sub-Wing, Include Aileron, Include Tail, Include Canopy) go in the *always visible* Assembly box, not inside Advanced.
- **Verify by rendering, not by reading the node graph.** Every feature in this session
  was validated with a small headless-Blender test script
  (`blender --background --python test_xxx.py`) that generates variants and renders
  them to `previews/*.png`, then visually inspected. Do this before declaring a GN
  change correct.
- **`Z:` drive fsync quirk**: if `Write`/`Edit` tools fail with `EUNKNOWN: unknown
  error, fsync` on a path under `Z:\...`, copy the file to local disk, edit there, copy
  back. This is an environment quirk, not a code issue.
- Blender version: **stay on 3.6**. 5.2 breaks the addon (Geometry Nodes Python API
  changed in Blender 4.0: `group.inputs.new()` -> `group.interface.new_socket()`,
  `GeometryNodeTransform` split into separate nodes). Confirmed empirically, not
  worth re-testing unless deliberately porting.

## Suggested next steps, in the order the user has asked for so far

1. Start the drone-type (non-fighter) archetype as a parallel assembly mode, not a variant of the fighter one.
2. If picked back up, re-read this file plus `HANDOFF_PARTS_PIPELINE.md` and
   `../../CLAUDE.md`'s "Critical rules" section.
