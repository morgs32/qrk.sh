# Screenshot hover blue and surrounding bands

Researched 2026-10-28 from the user's supplied PNG and primary CSS specifications.
The PNG is the color evidence; application source is used only to identify the
current hover styling. The investigation informed the color match below; the
user subsequently requested translucent blue halos over the real backgrounds.
The current treatment and its best-fit opacity derivation are recorded below.

## Color-managed CSS sample

Use **`#1F9BFC`**, RGB(31,155,252), for the strongest sampled band in CSS sRGB.
The original PNG embeds an ICC profile with description `Display`; its raw
RGB samples must not be treated directly as CSS hex colors. A copy was converted
with the installed ColorSync sRGB profile:

```sh
sips --matchTo '/System/Library/ColorSync/Profiles/sRGB Profile.icc' original.png --out reference-srgb.png
```

The converted sample at x=85,y=80 is `#1F9BFC`. The neighboring bands at x=60 and
x=110 become `#39A7F8` and `#A7D6F5`. Their counts remain 3900,3900,3744; geometry
is unchanged. [Converted reference](/tmp/qrk-hover-reference-srgb.png).

The raw strongest band is `#2B9DF9`, RGB(43,157,249), **in the embedded Display
profile**, not in sRGB. That earlier raw sample is retained below as evidence,
not as the final CSS color. [Original PNG](/var/folders/5w/pbjzxh114jd6swz5wdmm3b4r0000gn/T/codex-clipboard-6b5bd502-cc71-4092-8b0b-4c5226988c9b.png).

The parent investigation decoded the PNG as 164×163 RGBA. All stored alpha
values are 255. Its off-grid row y=80 has the following horizontal runs; the
same band structure appears at y=10,40,65,100 and other sampled rows. These
values are raw Display-profile RGB samples:

- x=0…19: left background `#E5E5E5`.
- x=20: magnification-grid line `#D8D8D8`; x=21…45 returns to `#E5E5E5`.
- x=46: transition pixel `#87BADC`; x=47…71 is a flat `#40A9F5` band.
- x=72: grid line `#3195E2`; x=73…97 is the flat strongest blue `#2B9DF9`.
- x=98: transition pixel `#68B9F5`; x=99: grid line `#9FC9E5`.
- x=100…123: flat light-blue band `#A9D6F4`.
- x=124: transition pixel `#D0E6F4`; x=125: grid line `#E9E9E9`.
- x=126…150: right background `#F6F6F6`; x=151: grid line `#E9E9E9`.

The strongest blue and light-blue colors occur 3900 and 3744 times respectively
in the image. These run lengths and counts are measured raster evidence. The
regular approximately 26-screen-pixel grid pitch indicates magnified source
pixel cells; the 25-pixel flat runs must not be interpreted as 25px CSS borders
or shadows. The screenshot alone does not provide the original zoom level or
device-pixel ratio. [Original PNG](/var/folders/5w/pbjzxh114jd6swz5wdmm3b4r0000gn/T/codex-clipboard-6b5bd502-cc71-4092-8b0b-4c5226988c9b.png).

## Does this show a shadow on either side?

There are visibly different neighboring bands on both sides of the strongest
blue: raw Display-profile `#40A9F5` to its left and `#A9D6F4` to its right
(sRGB `#39A7F8` and `#A7D6F5` after conversion). That is observable.
Calling them two CSS shadows, or prescribing their opacity/spread as an exact
reconstruction, is not justified by the PNG alone.

The samples show flat bands with narrow transition pixels, rather than a broad,
progressive color falloff. This supports a hard stroke with adjacent flat
coverage/halo or antialiasing as a better description of the sampled raster
than a soft Gaussian glow. CSS blurred shadows approximate a Gaussian filter;
zero-blur spread shadows instead produce hard expanded/inset edges. A small
blur sampled at the unknown original scale cannot be conclusively excluded.
[CSS shadow blur](https://www.w3.org/TR/css-backgrounds-3/#shadow-blur),
[CSS shadow geometry](https://www.w3.org/TR/css-backgrounds-3/#shadow-shape).

Opaque PNG pixels do not prove that the original layers were opaque. Alpha
compositing combines source color, source opacity, and backdrop. Without those
original inputs, multiple different CSS colors and opacities can produce the
same flattened output. The different left/right background colors also prevent
assuming a symmetric halo from the observed band colors. [CSS source-over
compositing](https://www.w3.org/TR/compositing-1/#simplealphacompositing).

## Opacity fit from the larger reference

The follow-up reference is a 366×212 RGBA image with a gray outside backdrop
RGB(229,229,229) and a light inside backdrop RGB(246,246,246). The image's
strongest band is RGB(32,155,252), within one red-channel unit of the implemented
core RGB(31,155,252). Samples from its original PNG and the color-managed sRGB
BMP agree at the inspected points. [Larger reference](/var/folders/5w/pbjzxh114jd6swz5wdmm3b4r0000gn/T/codex-clipboard-a179d478-dff9-4a88-8690-37857c2148fd.png),
[sRGB working copy](/tmp/qrk-halo-opacity-reference-srgb.bmp).

The bands differ by orientation. At y=120, the vertical outside band x=64…65 is
RGB(57,167,248), and the inside band x=68…69 is RGB(168,214,245). Along the
horizontal edge at x=150…300, the outside band y=64…65 is RGB(90,179,243), and
the inside band y=68…69 is RGB(121,194,246). Therefore one exact shared opacity
cannot explain the entire raster. Effective per-edge fits are approximately
87%/36% outside/inside vertically and 70%/58% horizontally. These differences
can include raster coverage or rendering effects; the original CSS layers are
not uniquely recoverable.

The earlier approximation fitted both straight edges rather than choosing one
orientation arbitrarily. The parent investigation sampled 860 outside pixels:
columns x=64,65 over y=74…211 plus rows y=64,65 over x=74…365. It sampled the
corresponding 860 inside pixels at columns x=68,69 and rows y=68,69 over those
same ranges. These omit the rounded corner and text.

For each side, RGB least squares fits the source-over model
`P = alpha * C + (1 - alpha) * B`, using the current core `C=(31,155,252)` and
the measured backdrop `B`. The resulting alpha is 0.7512 outside and 0.5093
inside, initially rounded to **75% outside and 50% inside**. The user superseded
that raster fit with one shared **50% opacity** for both halos, then chose
**30% for both** to soften the emphasis, then chose **15% inside while retaining
30% outside**. The fitted values above are retained
only as historical analysis. The fit itself
is a best fit to the sampled straight-edge coverage, not an exact recovery of
the reference's original opacity. [Source-over model](https://www.w3.org/TR/compositing-1/#simplealphacompositing).

## Current implemented treatment

The shared drawer/Wall hover pseudo-element keeps the opaque color-managed
1px core `#1F9BFC`. It uses that same blue at 30% alpha for the outer halo and 15% for the
inset halo, allowing their apparent lightness to follow the actual
background instead of painting the previously selected flat `#A7D6F5` color.
The outer and inset halos retain zero offset, zero blur, and 1px spread.
[Current hover decoration](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css:121).

```css
/* User-selected alpha values; raster coverage does not define the treatment. */
border: 1px solid #1f9bfc;
box-shadow:
  0 0 0 1px rgb(31 155 252 / 30%),
  inset 0 0 0 1px rgb(31 155 252 / 15%);
```

The 1px border and halo widths remain the selected implementation geometry,
not CSS dimensions recovered from either screenshot. No movement or diffuse
glow is added. Existing hitboxes, layout, Placement gaps, and hover motion stay
unchanged. The native drag preview overrides `box-shadow: none`, preserving its
existing 2px dark edge without the hover halos. The running preview currently
serves the `preview-navbar-gap` worktree; the primary checkout contains the same
shared hover treatment. [Drag preview override](/Users/morgs32/GitHub/qrk.sh/apps/app/modules/bricks.css:146).

## Verification and remaining work

The original backdrop experiment below verified the earlier 75% outer / 50%
inner treatment. These historical pixels do not claim to measure the final
equal-alpha design. A subsequent live check confirmed 50% for both shadows.
The next live check confirmed 30% for both halos with the opaque core unchanged.
The latest user choice keeps the outer halo at 30% and reduces only the inside
halo to 15%. The parent verified the current hovered decoration computes an
opaque 1px RGB(31,155,252) border with `rgba(31,155,252,.3)` outside and
`rgba(31,155,252,.15)` inset, both zero-offset/zero-blur with 1px spread.
Formatting and diff checks pass in both checkouts.
[Latest hover](/tmp/qrk-inner-halo-15.png).
The following bullets document the original backdrop experiment only:


- The hovered pseudo-element computes an opaque 1px border in RGB(31,155,252),
  an outer 1px-spread shadow in `rgba(31,155,252,0.75)`, and an inset shadow
  with the same geometry in `rgba(31,155,252,0.5)`.
- A controlled backdrop comparison confirms that the halo composites with the
  actual outside color. Color-managed samples, ordered outside → outer halo →
  core → inner halo → inside, were:
  - White outside: RGB(255,255,255), RGB(92,181,254), RGB(31,155,252),
    RGB(147,205,254), RGB(255,255,255).
  - Gray outside: RGB(229,229,229), RGB(84,174,247), RGB(31,155,252),
    RGB(147,205,254), RGB(255,255,255).
- Changing only the outside backdrop changed the outer halo while preserving
  the opaque core and the inset halo over its unchanged white interior. The
  temporary runtime test override was removed afterwards.
- Targeted CSS formatting and diff checks pass in both the primary checkout
  and active worktree.

[Verified translucent hover screenshot](/tmp/qrk-translucent-hover-halos.png).

Remaining work: None.
