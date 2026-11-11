import { useEffect, useRef, useState } from 'react';
import { isResumable, resumeLine } from '@qv/quiz';
import type { Preferences, Round } from '@qv/quiz';
import type { QuizDetail, QuizSectionSummary } from '@qv/schema';
import { Play } from 'lucide-react';
import { button, card } from '../../ui/styles';
import { Switch } from '../../ui/Switch';
import { Html } from './Figures';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
/** As the title of the other pages. */
const TITLE = 'font-serif text-3xl font-semibold tracking-tight';
/** A name that may bring HTML, for a screen reader. */
const plainText = (html: string) =>
  new DOMParser().parseFromString(html, 'text/html').body.textContent ?? '';

/**
 * The cover of a section: the tabs (when the test has several), the description, the round saved halfway («Continuar» /
 * «Descartar»), «Comenzar» with the groups to practice and their switches, as an assessment's page in Anki; below, the mode,
 * discreet, the notice and the list.
 */
export function Cover({
  quiz,
  section,
  round,
  preferences,
  onChoose,
  onStart,
  onResume,
  onDiscard,
  onTab,
  focusTab = false,
  heading = null,
}: {
  quiz: QuizDetail;
  section: QuizSectionSummary;
  round: Round | null;
  preferences: Preferences;
  onChoose: (p: Preferences) => void;
  onStart: (p: Preferences) => void;
  onResume: () => void;
  onDiscard: () => void;
  onTab: (sectionId: string) => void;
  /** Arriving from another tab: the focus on this one (the arrows go on). */
  focusTab?: boolean;
  /** A heading of the page instead of the test's own (an assessment's only test is its «Tests»). */
  heading?: string | null;
}) {
  const sections = quiz.sections;
  const active = sections.findIndex((s) => s.id === section.id);
  const chosen = section.groups
    .filter((g) => preferences.groups.includes(g.id))
    .reduce((t, g) => t + g.questionCount, 0);

  // «Descartar» asks once more (4 s), as the skill's page: there is no confirm() in an artifact.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  useEffect(() => {
    if (focusTab) tabRefs.current[active]?.focus({ preventScroll: true });
  }, [focusTab, active]);
  const toggle = (id: string, on: boolean) =>
    onChoose({
      ...preferences,
      groups: section.groups
        .map((g) => g.id)
        .filter((g) => (g === id ? on : preferences.groups.includes(g))),
    });

  const resumable = isResumable(round);
  const total = sections.reduce((t, s) => t + s.questionCount, 0);

  return (
    <section className="wrap wide portada" aria-labelledby="quiz-title">
      {quiz.kicker ? <Html as="p" className="kicker" html={quiz.kicker} /> : null}
      {/* The standalone page's heading, if the manifest kept it; if not, the test's name. */}
      {heading ? (
        <h1 id="quiz-title" className={TITLE}>
          {heading}
        </h1>
      ) : quiz.heading ? (
        <Html as="h1" id="quiz-title" html={quiz.heading} className={TITLE} />
      ) : (
        <h1 id="quiz-title" className={TITLE}>
          {quiz.title}
        </h1>
      )}
      <p className="mt-1 text-[var(--muted)]">
        Test de práctica · {plural(total, 'pregunta', 'preguntas')}
      </p>
      {sections.length > 1 ? (
        <div className="tabs" role="tablist" aria-label="Secciones del test">
          {sections.map((s, i) => (
            <button
              key={s.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              className="tab"
              aria-selected={i === active}
              tabIndex={i === active ? 0 : -1}
              onClick={() => onTab(s.id)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
                e.preventDefault();
                const j =
                  (active + (e.key === 'ArrowRight' ? 1 : sections.length - 1)) % sections.length;
                onTab(sections[j]!.id);
              }}
            >
              <Html className="tn" html={s.name} />{' '}
              <span className="tc">{plural(s.questionCount, 'pregunta', 'preguntas')}</span>
            </button>
          ))}
        </div>
      ) : null}
      {section.description ? (
        <Html as="p" className="mt-4 text-sm text-[var(--muted)]" html={section.description} />
      ) : null}
      {resumable ? (
        <div
          role="region"
          aria-label="Ronda a medias"
          className={`${card} mt-4 flex flex-wrap items-center justify-between gap-3 p-4`}
        >
          <div className="min-w-0 text-sm">
            <b className="block font-medium">Tienes una ronda a medias</b>
            <span className="text-[var(--muted)]">{resumeLine(round)}</span>
          </div>
          <div className="flex flex-none gap-2">
            <button type="button" className={`${button.base} ${button.primary}`} onClick={onResume}>
              Continuar
            </button>
            <button
              type="button"
              className={`${button.base} ${button.secondary}`}
              onClick={() => {
                if (!armed) return setArmed(true);
                setArmed(false);
                onDiscard();
              }}
            >
              {armed ? '¿Seguro? Descartar' : 'Descartar'}
            </button>
          </div>
        </div>
      ) : null}

      <form
        className={`${card} mt-6 p-4 sm:p-6`}
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen) onStart(preferences);
        }}
      >
        <div className="flex flex-wrap items-center gap-4">
          <button
            type="submit"
            disabled={!chosen}
            className={`${button.base} ${button.primary} flex-1 py-3 text-base disabled:opacity-50 sm:flex-none sm:px-10`}
          >
            <Play className="size-4" aria-hidden="true" /> Comenzar
          </button>
          <span className="font-medium max-sm:basis-full">
            {chosen ? `${plural(chosen, 'pregunta', 'preguntas')} en total` : 'Elige al menos uno'}
          </span>
        </div>

        {section.groups.length > 1 ? (
          <div className="mt-8">
            <fieldset>
              <legend className="float-left w-full text-sm text-[var(--muted)]">
                {section.groupsTitle}
              </legend>
              <ul className="clear-both pt-2 divide-y divide-[var(--border)] text-sm">
                {section.groups.map((g) => (
                  <li key={g.id}>
                    <label className="flex cursor-pointer items-center gap-4 py-2.5">
                      <span className="min-w-0 flex-1">
                        <Html className="block font-medium" html={g.name} />
                        {g.topic ? (
                          <Html className="block text-xs text-[var(--muted)]" html={g.topic} />
                        ) : null}
                        <span className="block text-xs text-[var(--muted)] sm:hidden">
                          {plural(g.questionCount, 'pregunta', 'preguntas')}
                        </span>
                      </span>
                      <span className="hidden flex-none text-[var(--muted)] tabular-nums sm:block">
                        {plural(g.questionCount, 'pregunta', 'preguntas')}
                      </span>
                      <Switch
                        label={plainText(g.name)}
                        checked={preferences.groups.includes(g.id)}
                        onChange={(on) => toggle(g.id, on)}
                      />
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          </div>
        ) : null}
      </form>

      {/* How the questions come out: it counts, but nobody comes for it. */}
      <div
        role="group"
        aria-label="Modo"
        className={`${card} mt-4 grid gap-x-8 gap-y-2 px-4 py-3 text-sm sm:grid-cols-2`}
      >
        <label
          className="flex cursor-pointer items-center justify-between gap-3"
          title="Apagado: salen en el orden original, útil para reconocerlas."
        >
          Mezclar orden de preguntas
          <Switch
            label="Mezclar orden de preguntas"
            checked={preferences.shuffle}
            onChange={(on) => onChoose({ ...preferences, shuffle: on })}
          />
        </label>
        {section.hasChoices ? (
          <label
            className="flex cursor-pointer items-center justify-between gap-3"
            title="Evita memorizar la posición de la correcta."
          >
            Mezclar orden de alternativas
            <Switch
              label="Mezclar orden de alternativas"
              checked={preferences.shuffleOptions}
              onChange={(on) => onChoose({ ...preferences, shuffleOptions: on })}
            />
          </label>
        ) : null}
      </div>

      {section.notice ? <Html as="p" className="aviso" html={section.notice} /> : null}
      {section.listing?.items.length ? (
        <details className="listado">
          <summary>
            <Html html={section.listing.title} />
          </summary>
          <ul>
            {section.listing.items.map((item, i) =>
              typeof item === 'string' ? (
                <li key={i}>
                  <Html html={item} />
                </li>
              ) : (
                <li key={i} className="lsub">
                  <details>
                    <summary>
                      <Html html={item.title} />
                    </summary>
                    <ul>
                      {item.items.map((x, j) => (
                        <li key={j}>
                          <Html html={x} />
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ),
            )}
          </ul>
        </details>
      ) : null}
    </section>
  );
}
