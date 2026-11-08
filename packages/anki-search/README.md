# @qv/anki-search

La sintaxis de búsqueda de Anki 25.9 sobre tarjetas en memoria, para el explorador («Browse») de la web. Es
un paquete puro (sin base de datos ni dependencias): el parser es una copia, combinador por combinador, del
de Anki (`rslib/src/search/parser.rs`), y la evaluación sigue el SQL que Anki escribe para cada término
(`sqlwriter.rs`).

```ts
import { compileSearch, parseSearch, searchNeeds, searchTerm, SearchError } from '@qv/anki-search';

const node = parseSearch('deck:"() Medicina UCH::1° Semestre" -is:suspended vértebra'); // o SearchError
const { ratedDays, introducedDays } = searchNeeds(node); // qué respuestas hay que traer
const match = compileSearch(node, { decks, noteTypes, timing, learnAheadSecs, answers, firstAnswerMs });
const found = cards.filter(match);

searchTerm('deck', '() Medicina UCH::1° Semestre'); // → "deck:() Medicina UCH::1° Semestre" (con comillas)
```

- `parseSearch` lanza `SearchError` (con `kind` y un mensaje en español) para lo que Anki rechaza, para las
  expresiones regulares inválidas y para lo que no está disponible aquí.
- `compileSearch` resuelve una vez mazos, tipos de nota, campos y respuestas; el predicado solo lee la
  tarjeta. El texto derivado de los campos (unidos, en minúsculas ASCII, sin acentos) se guarda en un
  `WeakMap` por el arreglo `fields`, así que la segunda búsqueda sobre las mismas tarjetas es más rápida:
  con 50 000 tarjetas, una búsqueda de texto tarda unos 5 ms.

## Prueba contra Anki real

`test/golden/search.json` tiene 393 búsquedas (45 inválidas) y 35 términos de la barra lateral, con lo que
encontró Anki 25.9.5 en una colección de prueba. La prueba exige las mismas tarjetas (o error donde Anki da
error). Para rehacerlo (también deja el JSON con el formato de Prettier):

```bash
python3 packages/anki-search/scripts/anki_search.py \
    packages/anki-search/test/golden/search.json
```

## Lo que es igual a Anki aunque sorprenda

- Texto suelto y `campo:valor` usan `LIKE` de SQLite: sin distinguir mayúsculas **solo en ASCII** («ÁRBOL»
  encuentra «Árbol», pero «árbol» no). `nc:` quita los acentos. `*:valor` (todos los campos) y los nombres
  de mazo, etiqueta, tipo de nota y plantilla sí ignoran mayúsculas en Unicode.
- AND gana a OR: `a or b c` es `a or (b c)`. Solo el espacio y el espacio ideográfico separan términos (un
  tabulador no). `- a` busca el texto «-» y «a».
- Un nombre de campo con comodín que calza con campos seguidos (`fr*:x` con «Frente» y «Frase») compara el
  valor con esos campos unidos por `\x1f`: `fr*:x` no encuentra nada y `"fr*:x*"` sí.
- `prop:s`, `prop:d` y `prop:r` comparan en f32 como Anki (`prop:s=2.31` no encuentra una estabilidad de
  2,31) y una tarjeta sin estado FSRS no calza ni con `prop:s>5` ni con `-prop:s>5` (NULL de SQL).
- `prop:due` de una tarjeta en aprendizaje del día: `trunc((due − nextDayAt) / 86400)`. `prop:r` sin
  `decay` usa 0,5 (FSRS-5) y, sin `lastReview`, los días desde `due − ivl`.
- `tag:re:…` también calza si la expresión calza con el texto vacío (Anki separa « a b » por espacios).

## Diferencias con Anki

- Los campos llegan en **texto plano** (sin HTML); Anki busca en el HTML guardado. Una búsqueda que calce
  con etiquetas o entidades (`&nbsp;`) puede dar distinto. No existe la opción de excluir campos de la
  búsqueda, y «Ignorar acentos en la búsqueda» se toma apagada (como viene en Anki).
- Se normaliza la búsqueda a NFC y se asume que los campos ya vienen en NFC (Anki los guarda así).
- `added:N` usa la creación de la nota (`createdMs`); Anki usa el id de la tarjeta, que es el mismo instante
  salvo en tarjetas generadas después (un cloze nuevo en una nota vieja).
- `is:buried-manually` e `is:buried-sibling` son `is:buried`: la tarjeta solo dice «buried».
- `deck:filtered` no encuentra nada (no hay mazos filtrados) y `deck:current` da error (no hay mazo actual).
- No disponibles (error «… no está disponible aquí», después de las mismas validaciones de Anki): `nid:`,
  `cid:`, `did:`, `mid:`, `dupe:`, `edited:`, `resched:`, `preset:`, `has-cd:`, `prop:ease`, `prop:pos`,
  `prop:rated`, `prop:resched`, `prop:cdn:` y `prop:cds:`.
- `rated:` e `introduced:` dependen de `answers` y `firstAnswerMs` (solo respuestas con botón 1–4, como
  cuenta Anki; las reprogramaciones manuales no).
- Las expresiones regulares se traducen de Rust a JavaScript: `\w \d \s \b` en Unicode, `.` sin salto de
  línea, banderas `i m s` también a mitad (con grupos modificadores), `(?P<n>…)`, clases POSIX y `\x{…}`.
  `(?x)`, `(?U)`, `(?-u)`, clases anidadas y operaciones entre clases (`&&`, `--`) dan error. Lo que
  JavaScript acepta y Rust no (lookaround, referencias atrás) funciona aquí. Una expresión inválida es error
  al parsear (en Anki, al ejecutar).
- `prop:r` usa `Math.pow` en vez del `powf` de f32: puede diferir en el último bit, lo que solo cambia el
  resultado si la recuperabilidad cae justo en el límite.
- Los nombres se comparan sin mayúsculas con `toUpperCase().toLowerCase()`, una aproximación al plegado
  Unicode de Anki (`unicase`).
- `searchTerm('card', …)` con un nombre de plantilla hecho solo de dígitos se lee como `card:N` (igual que
  en Anki).
