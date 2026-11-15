// The home page below its greeting: a reserved space while it loads, then all its sections at once.

import type { Catalog } from '@qv/schema';
import { Skeleton } from '../../../shared/ui/Loading';
import { ErrorWithRetry } from '../../../shared/ui/Notice';
import { useHomeBody } from '../hooks/useHomeBody';
import { Sections } from './Sections';

export function HomeBody({ catalog }: { catalog: Catalog | undefined }) {
  const { prefs, plan, rounds, reserved, box, ready } = useHomeBody(catalog);
  if (plan.isError)
    return <ErrorWithRetry error={plan.error} onRetry={() => void plan.refetch()} />;
  if (!ready) {
    return (
      <div style={{ minHeight: reserved }} className="flow-root" aria-busy="true">
        <Skeleton className="mt-6 h-40 sm:mt-8" />
        <Skeleton className="mt-6 h-56 sm:mt-8" />
      </div>
    );
  }
  return (
    <div ref={box} className="flow-root">
      <Sections catalog={catalog!} prefs={prefs!} plan={plan.data!} rounds={rounds.data ?? []} />
    </div>
  );
}
