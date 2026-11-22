// «Ver apunte» and «Preguntas» under the answer buttons: apart from them and as tall as a finger, so that a touch
// meant for «Otra vez» or «Bien» never opens the article; their room is always there.

import type { ReactNode } from 'react';
import { BookOpen, ListChecks } from 'lucide-react';
import type { CardMaterial } from '../model/material';
import { materialRowStrings } from './strings/MaterialRow.strings';

const ROW_LINK =
  'inline-flex h-9 items-center gap-1.5 rounded-lg px-3 hover:bg-surface-2 hover:text-ink';

export function MaterialRow({
  material,
  revealed,
  children,
}: {
  material: CardMaterial | null;
  revealed: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="mt-3 flex h-9 justify-center gap-2 text-sm text-muted">
      {revealed && material ? (
        <>
          <MaterialLink href={material.notePath} className={ROW_LINK}>
            <BookOpen className="size-4" aria-hidden="true" /> {materialRowStrings.material.note}
          </MaterialLink>
          {children}
          {material.quizPath ? (
            <MaterialLink href={material.quizPath} className={ROW_LINK}>
              <ListChecks className="size-4" aria-hidden="true" />{' '}
              {materialRowStrings.material.quiz}
            </MaterialLink>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

// Focus does not stay on the link: back here, Enter has to answer, not open it again.
export function MaterialLink({
  href,
  className = 'inline-flex items-center gap-1 hover:text-ink hover:underline',
  children,
}: {
  href: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.currentTarget.blur()}
      className={className}
    >
      {children}
    </a>
  );
}
