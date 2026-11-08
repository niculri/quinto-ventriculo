import { keys } from '../../ui/keys';
const STEPS = [
  {
    title: 'Entra con tu cuenta de la U',
    text: 'Usa «Entrar con Google» y elige tu cuenta @ug.uchile.cl. No hay contraseñas nuevas que recordar.',
  },
  {
    title: 'Elige semestre y ramo',
    text: 'En el inicio están los semestres y sus ramos. Cada ramo con material tiene sus certámenes y, dentro, sus clases y seminarios.',
  },
  {
    title: 'Lee, busca y estudia',
    text: `Busca con ${keys('Ctrl+K')} desde cualquier página. En los ramos con tarjetas, «Estudiar» te muestra las que tocan hoy, y tu avance se guarda solo.`,
  },
];

/** The three usage steps. Shown on the public landing page and on the help page. */
export function HowToUse() {
  return (
    <ol className="grid gap-6 md:grid-cols-3">
      {STEPS.map((s, i) => (
        <li key={s.title} className="rounded-xl border border-border bg-surface p-6">
          <span className="flex size-8 items-center justify-center rounded-full bg-brand text-sm font-semibold text-white dark:text-[#0a1316]">
            {i + 1}
          </span>
          <h3 className="mt-4 font-semibold">{s.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
