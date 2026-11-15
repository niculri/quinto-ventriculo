// «Listo por hoy» of the simple mode: why nothing is left, what comes tomorrow and where to go.
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { BookOpen, PartyPopper } from 'lucide-react';
import { paths } from '../../../shared/lib/paths';
import { button } from '../../../shared/ui/styles';
import { ancestry, descendants, hasPage } from '../../catalog/model/tree';
import type { CourseDeckNode } from '../../catalog/model/tree';
import { catchUpText } from '@qv/study';
import type { CongratsInfo } from '@qv/study';

export function DoneToday({
  info,
  node,
  deckPath,
  hasSeen,
  summary,
}: {
  info: CongratsInfo;
  node: CourseDeckNode;
  deckPath: string;
  hasSeen: (assessmentId: string) => boolean;
  summary: ReactNode;
}) {
  const choosePath = node.depth <= 2 ? paths.course(node.ref.course) : deckPath;
  const assessment = ancestry(node).find((n): n is CourseDeckNode => n.depth === 3 && hasPage(n));
  const tomorrow = info.dueTomorrow ? (
    <p>
      Mañana: {info.dueTomorrow} {info.dueTomorrow === 1 ? 'tarjeta' : 'tarjetas'} de repaso.
    </p>
  ) : null;
  if (info.extrasOff) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <BookOpen className="size-10 text-brand" aria-hidden="true" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">Las extras están apagadas</h1>
        <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
          <p>
            Son tarjetas con más detalle. Para estudiarlas, enciende «Incluir extras»
            {assessment ? ` en ${assessment.label}` : ''}.
          </p>
          {tomorrow}
        </div>
        <Link
          to={assessment ? paths.deck(assessment.ref) : deckPath}
          className={`${button.base} ${button.primary} mt-8`}
        >
          {assessment ? `Ir a ${assessment.label}` : 'Volver al mazo'}
        </Link>
      </div>
    );
  }
  if (info.nothingActive) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
        <BookOpen className="size-10 text-brand" aria-hidden="true" />
        <h1 className="mt-4 font-serif text-2xl font-semibold">Todavía no activas esta materia</h1>
        <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
          <p>
            Cada semana o clase parte desactivada. Activa lo que estás viendo en clases y empezarán
            a salir sus tarjetas nuevas.
          </p>
          {info.learnMessage ? <p>{info.learnMessage}</p> : null}
          {tomorrow}
        </div>
        <Link to={choosePath} className={`${button.base} ${button.primary} mt-8`}>
          Elegir qué estudiar
        </Link>
      </div>
    );
  }
  const reviews = (
    node.depth <= 2
      ? descendants(node).filter((n): n is CourseDeckNode => n.depth === 3 && hasPage(n))
      : assessment
        ? [assessment]
        : []
  ).filter((a) => hasSeen(a.id));
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center">
      <PartyPopper className="size-10 text-brand" aria-hidden="true" />
      <h1 className="mt-4 font-serif text-2xl font-semibold">Listo por hoy</h1>
      {summary}
      <div className="mt-4 max-w-xl space-y-3 text-sm text-muted">
        {info.learnMessage ? <p>{info.learnMessage}</p> : null}
        {info.exam?.roseTo ? (
          <p>Para llegar a la fecha, ahora son {info.exam.roseTo} al día.</p>
        ) : null}
        {info.exam?.catchUp ? <p>{catchUpText(info.exam.catchUp)}</p> : null}
        {info.newLimitReached && info.exam?.finalReview ? (
          <p>Estás en los días de repaso final: no salen tarjetas nuevas.</p>
        ) : (info.newLimitReached || info.buried) && info.exam?.lastNewDay ? (
          <p>Ya viste tus tarjetas nuevas de hoy. Mañana empieza el repaso final: no salen más.</p>
        ) : info.newLimitReached && info.exam?.computed ? (
          <p>Ya viste tus tarjetas nuevas de hoy. Mañana salen más.</p>
        ) : info.newLimitReached ? (
          <p>
            Ya viste tus tarjetas nuevas de hoy. Mañana salen más
            {assessment ? (
              <>
                , o puedes subir el número en{' '}
                <Link to={paths.deck(assessment.ref)} className="text-brand hover:underline">
                  {assessment.label}
                </Link>
              </>
            ) : null}
            .
          </p>
        ) : null}
        {info.buried && !info.exam?.lastNewDay ? (
          <p>Las tarjetas que saltaste y las de la misma nota que una de hoy salen desde mañana.</p>
        ) : null}
        {tomorrow}
        {info.inactiveNew > 0 ? (
          <p>
            Hay más materia sin activar.{' '}
            <Link to={choosePath} className="text-brand hover:underline">
              Elegir qué estudiar
            </Link>
          </p>
        ) : null}
      </div>
      <div className="mt-8 flex flex-col items-center gap-3">
        <Link to={deckPath} className={`${button.base} ${button.primary}`}>
          Volver al mazo
        </Link>
        {reviews.map((a) => (
          <Link
            key={a.id}
            to={paths.deckReview(a.ref)}
            className={`${button.base} ${button.secondary}`}
          >
            {reviews.length > 1
              ? `Repasar ${a.label}, sin cambiar fechas`
              : 'Repasar igual, sin cambiar fechas'}
          </Link>
        ))}
      </div>
    </div>
  );
}
