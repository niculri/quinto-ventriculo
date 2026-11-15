// «Seguir» on the home page: tests half done and the last note opened, each a card that takes back to it.

import { ArrowRight, BookOpen, ListChecks } from 'lucide-react';
import { Link } from 'react-router';
import type { Catalog } from '@qv/schema';
import { linkCard } from '../../../shared/ui/styles';
import { lastNote } from '../../notes/api/lastNote';
import { followItems } from '../model/follow';
import type { OpenRound } from '../model/follow';
import { homeStrings as s } from '../strings';

export function Follow({ catalog, rounds }: { catalog: Catalog; rounds: readonly OpenRound[] }) {
  const items = followItems(catalog, rounds, lastNote());
  if (!items.length) return null;
  return (
    <section className="mt-6 sm:mt-8" aria-labelledby="follow">
      <h2 id="follow" className="font-serif text-xl font-semibold">
        {s.follow.title}
      </h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.key} className="min-w-0">
            <Link to={it.to} className={`${linkCard} group flex items-center gap-3 p-4`}>
              <span className="flex size-10 flex-none items-center justify-center rounded-lg bg-brand-soft text-brand">
                {it.kind === 'quiz' ? (
                  <ListChecks className="size-5" aria-hidden="true" />
                ) : (
                  <BookOpen className="size-5" aria-hidden="true" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{it.title}</span>
                <span className="block truncate text-sm text-muted">{it.detail}</span>
              </span>
              <ArrowRight
                className="size-4 flex-none text-muted transition group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
