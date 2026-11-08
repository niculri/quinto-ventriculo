# Avisos

El Quinto Ventrículo · © 2026 Nico Ulriksen · GNU Affero General Public License, versión 3 o posterior
(AGPL-3.0-or-later; el texto está en `LICENSE`). Se entrega sin ninguna garantía, en la medida en que lo permita la
ley (secciones 15 y 16 de la licencia). El material de estudio que muestra el sitio no es parte de este código ni
tiene esta licencia.

## Anki

Partes del código están adaptadas de Anki (https://github.com/ankitects/anki), © Ankitects Pty Ltd y
colaboradores, AGPL-3.0-or-later, y se modificaron para El Quinto Ventrículo en 2026: el planificador
(`packages/srs`), la búsqueda (`packages/anki-search`), las plantillas, cloze e Image Occlusion
(`packages/anki-render`, `apps/web/src/features/decks/`), la sesión de estudio
(`apps/web/src/features/study/session.ts`) y la página de opciones de Anki. Cada archivo adaptado lo dice en su
encabezado (`SPDX-License-Identifier`). Algunos textos en español vienen de las traducciones de Anki, que según su
LICENSE son una mezcla de BSD y dominio público.

## FSRS

`packages/srs/src/fsrs.ts` usa ts-fsrs (https://github.com/open-spaced-repetition/ts-fsrs, MIT, © Open Spaced
Repetition; su licencia va con el paquete y en `/third-party-licenses.txt`) y sigue a fsrs-rs
(https://github.com/open-spaced-repetition/fsrs-rs) en cómo completa los parámetros de versiones anteriores. El
aviso de fsrs-rs:

```
BSD 3-Clause License

Copyright (c) 2023, Open Spaced Repetition

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this
   list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

3. Neither the name of the copyright holder nor the names of its
   contributors may be used to endorse or promote products derived from
   this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
```
