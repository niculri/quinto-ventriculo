import type { Note } from '@qv/schema';
import gradients from './gradients.svg';
import ladder from './ladder.svg';
import membrane from './membrane.svg';

/**
 * A made-up article with every block the converter makes (thumbnails wide and tall, one beside its text, one in a
 * callout, one that goes down below a table, a large plate, a row, tables, callouts) and the characters the articles
 * use (µ ± ≥ ≤ → ↔ ° × ‰ Å, Greek, Ca²⁺, CO₂ and their <sup>/<sub> spelling, «», – —). Test content, not study
 * material.
 */
const html = `<aside class="callout callout-datos"><p class="callout-label">Datos clave</p><ul>
<li>La <strong>bicapa lipídica</strong> deja pasar sola a las moléculas chicas y sin carga (O₂, CO₂); los iones necesitan proteínas.</li>
<li>La <strong>bomba de Na⁺/K⁺</strong> saca 3 Na⁺ y entra 2 K⁺ por cada ATP: es un transporte <strong>activo primario</strong>.</li>
<li>Sus gradientes sostienen el <strong>potencial de reposo</strong> (≈ −70 mV) y el transporte activo secundario.</li>
<li>La <strong>digoxina</strong> la inhibe: sube el Ca²⁺ dentro del miocito y el corazón se contrae con más fuerza.</li>
</ul>
</aside><p>Toda célula vive separada de su entorno por una membrana de unos 5 nm (50 Å). Esa lámina, tan delgada que no se ve con el microscopio óptico, decide qué entra y qué sale, y al hacerlo crea diferencias de concentración que la célula usa como una batería. Este artículo de prueba recorre esa idea de principio a fin, con texto largo, listas, una tabla, una figura y los recuadros de un artículo real, para mirar cómo se lee.</p>
<h2 id="la-membrana-como-barrera">1. La membrana como barrera</h2><p>La bicapa está hecha de fosfolípidos con la cabeza hacia el agua y las colas hacia adentro. El centro es <em>hidrofóbico</em>: una molécula cargada tendría que dejar su capa de agua para cruzarlo, y eso cuesta tanta energía que en la práctica no ocurre. Por eso la bicapa pura es unas mil millones de veces (nueve órdenes de magnitud) más permeable al agua que a un ion como el K⁺.</p><div class="side side-right"><figure class="figure figure-float" style="width:40%"><img src="${membrane}" alt="La bicapa con la bomba de sodio y potasio" width="720" height="380" loading="lazy" decoding="async"><figcaption>Una figura que el apunte pone al costado del texto.</figcaption></figure><p>Que algo cruce depende de tres cosas: el tamaño, la carga y cuánto se disuelve en lípidos. Las moléculas chicas y apolares pasan solas; las grandes o cargadas necesitan una proteína que les abra camino, sea un canal, un transportador o una bomba.</p></div>
<h3 id="que-cruza-solo">Qué cruza solo y qué necesita ayuda</h3><table><thead><tr><th>Molécula</th><th>Ejemplo</th><th>Tamaño</th><th>¿Cruza la bicapa sola?</th><th>Cómo cruza</th></tr></thead><tbody><tr><td>Gas</td><td>O₂, CO₂, N₂</td><td>&lt; 0,3 nm</td><td>Sí, rápido</td><td>Difusión simple</td></tr><tr><td>Polar chica sin carga</td><td>H₂O, urea</td><td>≈ 0,3 nm</td><td>Lento</td><td>Difusión y acuaporinas</td></tr><tr><td>Polar grande</td><td>Glucosa</td><td>≈ 0,9 nm</td><td>No</td><td>Transportador (GLUT)</td></tr><tr><td>Ion</td><td>Na⁺, K⁺, Ca²⁺, Cl⁻</td><td>0,1–0,2 nm</td><td>No</td><td>Canales y bombas</td></tr></tbody></table><p>La tabla deja algo claro: el tamaño importa, pero la carga decide. Un ion de sodio es más chico que una molécula de agua y aun así la bicapa lo detiene casi por completo.</p>
<h2 id="la-bomba-de-sodio-y-potasio">2. La bomba de sodio y potasio</h2><p>La Na⁺/K⁺-ATPasa es una proteína de la membrana plasmática de casi todas las células animales. Tiene una subunidad α, que une los iones y el ATP, y una subunidad β, que la lleva a la membrana y la estabiliza; en algunos tejidos se suma una tercera, γ. Por cada ATP que hidroliza saca tres Na⁺ y entra dos K⁺, siempre contra sus gradientes.</p><figure class="figure"><img src="${membrane}" alt="Esquema de la bomba de sodio y potasio en la membrana plasmática" width="720" height="380" loading="lazy" decoding="async"><figcaption>La bomba de Na⁺/K⁺ saca tres iones de sodio y entra dos de potasio por cada ATP que hidroliza. Esquema propio, sin escala.</figcaption></figure><p>El ciclo tiene pasos que se repiten unas cien veces por segundo:</p><ol>
<li>Con la bomba abierta hacia el citoplasma, se unen 3 Na⁺ y un ATP.</li>
<li>El ATP fosforila a la bomba (ATP → ADP + Pᵢ) y esta cambia de forma: se abre hacia afuera y suelta el Na⁺.</li>
<li>Se unen 2 K⁺ desde el líquido extracelular; la bomba pierde el fosfato y vuelve a abrirse hacia adentro.</li>
<li>Suelta el K⁺ en el citoplasma y queda lista para otra vuelta.</li>
</ol><figure class="figure" style="width:30%"><img src="${ladder}" alt="Los potenciales de equilibrio en una escala vertical" width="360" height="640" loading="lazy" decoding="async"><figcaption>Una figura alta: los potenciales de equilibrio del Na⁺ y del K⁺ y el de reposo, en una escala. Esquema propio.</figcaption></figure><aside class="callout callout-profe"><p class="callout-label">Lo que enfatizó el profe</p><p>Que la bomba mueve más cargas positivas hacia afuera que hacia adentro (3 contra 2): por eso es <strong>electrogénica</strong> y aporta unos pocos milivoltios al potencial de reposo, aunque lo principal lo pone la salida de K⁺ por sus canales.</p></aside><h4>Cuánto gasta</h4><p>En reposo, una neurona dedica a esta bomba una fracción grande de su ATP; en el cuerpo entero se estima entre un quinto y un cuarto del gasto basal a 37 °C. Esa cifra cambia mucho entre tejidos y entre estudios (± 10 % según el método), así que conviene recordarla como orden de magnitud, no como un número exacto.</p>
<h2 id="gradientes-y-potencial">3. Gradientes y potencial de membrana</h2><p>El resultado de la bomba es una célula con mucho K⁺ adentro y mucho Na⁺ afuera. Las concentraciones típicas de una célula de mamífero son estas:</p><table><thead><tr><th>Ion</th><th>Adentro (mM)</th><th>Afuera (mM)</th><th>Relación</th><th>Potencial de equilibrio</th></tr></thead><tbody><tr><td>K⁺</td><td>140</td><td>5</td><td>28 × más adentro</td><td>≈ −89 mV</td></tr><tr><td>Na⁺</td><td>12</td><td>145</td><td>12 × más afuera</td><td>≈ +67 mV</td></tr><tr><td>Ca²⁺</td><td>0,0001</td><td>2,5</td><td>≥ 10 000 × más afuera</td><td>≈ +135 mV</td></tr><tr><td>Cl⁻</td><td>4</td><td>110</td><td>≈ 27 × más afuera</td><td>≈ −88 mV</td></tr></tbody></table><figure class="figure figure-plate" style="width:88%"><img src="${gradients}" alt="Concentraciones de K⁺, Na⁺, Ca²⁺ y Cl⁻ adentro y afuera de la célula" width="1100" height="420" loading="lazy" decoding="async"><figcaption>Una lámina ancha: las mismas concentraciones de la tabla, adentro (azul) y afuera (naranjo). Esquema propio.</figcaption></figure><p>Cada potencial de equilibrio sale de la ecuación de Nernst, E = (RT/zF) · ln([X]ₑ/[X]ᵢ), que a 37 °C se simplifica a unos 61,5 mV por cada década de diferencia para un ion monovalente. El potencial de reposo real (≈ −70 mV) queda cerca del de K⁺ porque, en reposo, la membrana es mucho más permeable al potasio que al sodio.</p><aside class="callout callout-ojo"><p class="callout-label">Ojo</p><p>«Más permeable al K⁺» no significa que el K⁺ cruce la bicapa: cruza por <strong>canales</strong> de fuga que están abiertos en reposo. La bicapa sola sigue siendo casi impermeable a todos los iones: les deja pasar ≤ 10⁻⁹ veces lo que deja pasar de agua.</p></aside><p>Los gradientes también se usan para mover otras moléculas. El cotransportador de Na⁺ y glucosa del intestino aprovecha la entrada de sodio a favor de su gradiente para entrar glucosa en contra del suyo: es transporte <strong>activo secundario</strong>, porque el ATP se gastó antes, en la bomba. El intercambiador Na⁺ ↔ Ca²⁺ del miocito, en cambio, usa esa misma entrada de sodio para sacar calcio.</p><aside class="callout callout-error"><p class="callout-label">Error en la figura de ejemplo</p><p>Una versión anterior del esquema mostraba 2 Na⁺ saliendo y 3 K⁺ entrando. <strong>Lo correcto:</strong> salen 3 Na⁺ y entran 2 K⁺.</p></aside>
<p>Las dos formas de escribir un subíndice o un superíndice se ven iguales: IP₃ e IP<sub>3</sub>, PPᵢ y PP<sub>i</sub>, 10⁴ y 10<sup>4</sup>, Ca²⁺ y Ca<sup>2+</sup>, 10⁻⁹ y 10<sup>−9</sup>; una constante de disociación (K<sub>d</sub>) o 4<sup>3</sup> = 64 combinaciones no cambian el alto de la línea.</p><div class="figure-row"><figure class="figure"><img src="${membrane}" alt="La bicapa con la bomba, otra vez" width="720" height="380" loading="lazy" decoding="async"><figcaption>Una fila de figuras: a la misma altura.</figcaption></figure><figure class="figure"><img src="${gradients}" alt="Las concentraciones, otra vez" width="1100" height="420" loading="lazy" decoding="async"><figcaption>La segunda figura de la fila.</figcaption></figure></div>
<h2 id="cuando-la-bomba-falla">4. Cuando la bomba se inhibe</h2><p>Si la bomba se frena, el Na⁺ se acumula adentro y el gradiente de sodio se achica. Lo primero que cambia no es el potencial de reposo, que depende sobre todo del K⁺, sino todo lo que usa la entrada de sodio como fuente de energía.</p><aside class="callout callout-clinica"><p class="callout-label">Relevancia clínica</p><figure class="figure figure-float" style="width:38%"><img src="${membrane}" alt="La bomba en la membrana, otra vez" width="720" height="380" loading="lazy" decoding="async"><figcaption>Una figura dentro de un recuadro.</figcaption></figure><p>La <strong>digoxina</strong> se une a la subunidad α y bloquea la bomba del miocito. Con más Na⁺ adentro, el intercambiador Na⁺ ↔ Ca²⁺ saca menos calcio, el Ca²⁺ del retículo sarcoplasmático aumenta y cada latido es más fuerte. Su margen terapéutico es estrecho: la hipopotasemia (K⁺ &lt; 3,5 mM) aumenta su efecto, porque el K⁺ compite con ella por el mismo sitio.</p></aside><aside class="callout callout-libro"><p class="callout-label">Extras del libro</p><p>Las isoformas de la subunidad α (α1 a α4) tienen distinta afinidad por la digoxina y se reparten de forma diferente entre tejidos; la α2 y la α3 predominan en el músculo y el sistema nervioso.</p></aside>
<h3 id="como-se-mide">Cómo se mide</h3><p>Medir la bomba no es directo.</p><figure class="figure"><img src="${membrane}" alt="La bomba en la membrana, para medirla" width="720" height="380" loading="lazy" decoding="async"><figcaption>Una figura con poco texto al lado antes de una tabla: baja junto al texto que sigue a la tabla.</figcaption></figure><p>Se usan dos técnicas.</p><table><thead><tr><th>Técnica</th><th>Qué mide</th></tr></thead><tbody><tr><td>Rubidio radiactivo</td><td>La entrada de K⁺ (el Rb⁺ lo imita)</td></tr><tr><td>Fijación de voltaje</td><td>La corriente de la bomba, unos pA por célula</td></tr></tbody></table><p>La primera técnica cuenta cuánto rubidio entra a la célula en un tiempo dado: como la bomba no distingue bien entre el K⁺ y el Rb⁺, la entrada de rubidio que desaparece con ouabaína es la que hace la bomba. La segunda mide directamente la corriente que genera, porque cada vuelta saca una carga positiva neta; esa corriente es pequeña, del orden de picoamperes, y hay que separarla de la de los canales.</p><p>Las dos dan resultados parecidos y muestran que la actividad de la bomba sube cuando aumenta el Na⁺ de adentro: la bomba responde a la carga de sodio que tiene que sacar, y por eso se acelera después de un tren de potenciales de acción. Ese ajuste es lo que mantiene los gradientes estables aunque la célula esté muy activa.</p>
<h3 id="notacion">Notación de este artículo</h3><p>Las letras griegas nombran subunidades e isoformas (α, β, γ, δ, κ); los superíndices dan la carga (Ca²⁺, Cl⁻) y los subíndices, el número de átomos o el compartimento (CO₂, [X]ᵢ). Las medidas usan el sistema internacional: µm, nm, mM, mV y °C. Una concentración de 1 ‰ es una parte por mil, y una flecha → indica el sentido de una reacción; la doble ↔, un intercambio en ambos sentidos.</p>
<section class="note-summary"><h2 id="resumen">Resumen</h2><ul>
<li>La bicapa frena a los iones; los mueven canales, transportadores y bombas.</li>
<li>La bomba de Na⁺/K⁺ saca 3 Na⁺ y entra 2 K⁺ por ATP, contra sus gradientes, y es electrogénica.</li>
<li>Sus gradientes sostienen el potencial de reposo (≈ −70 mV, cerca del de K⁺) y el transporte activo secundario.</li>
<li>Inhibirla con digoxina sube el Ca²⁺ del miocito y la fuerza de contracción.</li>
</ul>
</section>`;

export const sampleNote: Note = {
  id: 'AP-XX-C0-01',
  slug: 'articulo-de-prueba',
  courseId: 'prueba',
  assessmentId: 'certamen-0',
  kind: 'lecture',
  title: 'La bomba de sodio y potasio',
  position: 1,
  updatedAt: '2026-11-12T12:00:00.000Z',
  code: 'QV-XX-C0-01',
  version: 1,
  publishedAt: '2026-11-12T12:00:00.000Z',
  header: {
    number: '1',
    lecturer: 'Prof. de prueba',
    institution: 'Universidad de prueba',
    term: 'spring',
    year: 2026,
  },
  sources: ['Artículo de prueba para mirar cómo se leen los artículos.'],
  html,
  toc: [
    { anchor: 'la-membrana-como-barrera', title: '1. La membrana como barrera', level: 2 },
    { anchor: 'que-cruza-solo', title: 'Qué cruza solo y qué necesita ayuda', level: 3 },
    { anchor: 'la-bomba-de-sodio-y-potasio', title: '2. La bomba de sodio y potasio', level: 2 },
    { anchor: 'gradientes-y-potencial', title: '3. Gradientes y potencial de membrana', level: 2 },
    { anchor: 'cuando-la-bomba-falla', title: '4. Cuando la bomba se inhibe', level: 2 },
    { anchor: 'como-se-mide', title: 'Cómo se mide', level: 3 },
    { anchor: 'notacion', title: 'Notación de este artículo', level: 3 },
    { anchor: 'resumen', title: 'Resumen', level: 2 },
  ],
};
