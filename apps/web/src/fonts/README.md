# Inter, our subset

`inter-roman.woff2` and `inter-italic.woff2` are Inter 4 (SIL Open Font License 1.1, `inter-OFL.txt`), cut from the
variable fonts of Google Fonts (`Inter[opsz,wght].ttf`, `Inter-Italic[opsz,wght].ttf`) with fontTools: the optical
size fixed at 14 (text), the weight axis kept, and only the characters below.

```sh
fonttools varLib.instancer "Inter[opsz,wght].ttf" opsz=14 -o inter.ttf
pyftsubset inter.ttf --flavor=woff2 --output-file=inter-roman.woff2 \
  --layout-features=calt,case,ccmp,cv05,cv08,dnom,frac,locl,numr,pnum,ss07,subs,sups,tnum,kern,mark,mkmk \
  --unicodes=U+0000,U+0020-007E,U+00A0-00AC,U+00AE-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,\
U+0300-0304,U+0308,U+0391-03A1,U+03A3-03A9,U+03B1-03C9,U+1D62,U+2000-200B,U+2010-2027,U+202F-2055,U+2057,U+205F,\
U+2070-2071,U+2074-208E,U+2090-209C,U+20AC,U+2122,U+2190-2199,U+2212,U+221A,U+221E,U+2248,U+2260,U+2264-2265,\
U+2713,U+2717
```

The same with `Inter-Italic[opsz,wght].ttf` gives `inter-italic.woff2`. The list is Latin-1, basic Greek, punctuation,
superscripts and subscripts (⁰–⁹ ⁺ ⁻ ₀–₉ ᵢ), arrows, ± × ≈ ≠ ≤ ≥ √ ∞ − and ✓ ✗: everything the articles use. A
character added to the articles has to be in this list (and in the `unicode-range` of `fonts.css`), or it falls back
to another font. Inter has no ✕ (the converter writes ×) nor ⇌.
