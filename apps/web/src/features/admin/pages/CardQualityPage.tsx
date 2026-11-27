// «Administración» → «Tarjetas»: which cards work and which do not, in sums of every student's answers, never who; by
// course, assessment and unit, with the hardest and the suspicious and the list as a CSV file to fix the deck with.
import { useState } from 'react';
import { Download } from 'lucide-react';
import { CARD_QUALITY_LIMITS } from '@qv/schema';
import { ErrorWithRetry, Notice } from '../../../shared/ui/Notice';
import { Reserved } from '../../../shared/ui/Reserved';
import { button } from '../../../shared/ui/styles';
import { saveFile } from '../../account/api/download';
import { useAnkiTree } from '../../catalog/hooks/useAnkiTree';
import { AdminSectionTitle } from '../components/AdminSectionTitle';
import { QualityList } from '../components/cardQuality/QualityList';
import { ScopePicker } from '../components/cardQuality/ScopePicker';
import { scopePickerStrings } from '../components/cardQuality/strings/ScopePicker.strings';
import { useCardQuality } from '../hooks/useCardQuality';
import {
  LONGEST_SUMMARY,
  csvName,
  emptyText,
  qualityCsv,
  qualityRows,
  qualityScope,
  qualitySummary,
} from '../model/cardQuality';
import type { QualityList as ListKind, ScopeChoice } from '../model/cardQuality';
import { cardQualityPageStrings as s } from './strings/CardQualityPage.strings';

const MIN = CARD_QUALITY_LIMITS.minStudents;

export function CardQualityPage() {
  const { catalog, tree } = useAnkiTree();
  const [wanted, setWanted] = useState<ScopeChoice>({ course: '', assessment: '', unit: '' });
  const [list, setList] = useState<ListKind>('hardest');
  const scope = qualityScope(tree, wanted);
  const { query, indexes } = useCardQuality(scope.deck, tree);
  const report = query.data ?? null;
  const ok = report?.status === 'ok' ? report : null;
  const rows = qualityRows(ok?.[list] ?? [], indexes, tree);
  const loading = !tree || (scope.deck !== null && !report);
  const listName = scopePickerStrings.lists[list];

  const download = () => {
    saveFile(
      new Blob([qualityCsv(rows)], { type: 'text/csv;charset=utf-8' }),
      csvName(scope.title, listName),
    );
  };

  return (
    <>
      <AdminSectionTitle title={s.title}>
        <button
          type="button"
          onClick={download}
          disabled={!rows.length}
          className={`${button.base} ${button.secondary}`}
        >
          <Download className="size-4" aria-hidden="true" />
          {s.export}
        </button>
      </AdminSectionTitle>
      <p className="mt-2 text-sm text-muted">{s.intro(MIN)}</p>
      {catalog.isError || query.isError ? (
        <div className="mt-6">
          <ErrorWithRetry
            error={catalog.error ?? query.error}
            onRetry={() => void Promise.all([catalog.refetch(), query.refetch()])}
          />
        </div>
      ) : (
        <>
          <ScopePicker scope={scope} list={list} onScope={setWanted} onList={setList} />
          <Reserved longest={LONGEST_SUMMARY} className="mt-3 text-sm text-muted">
            <p aria-live="polite">{tree && !scope.deck ? s.noCourse : qualitySummary(ok)}</p>
          </Reserved>
          <Reserved longest={[s.explain.hardest, s.explain.suspicious]} className="mt-1 text-sm">
            <p>{s.explain[list]}</p>
          </Reserved>
          {report && !ok ? (
            <div className="mt-3">
              <Notice title={s.unavailable} tone="info" />
            </div>
          ) : (
            <QualityList
              rows={rows}
              loading={loading}
              empty={emptyText(ok, list, MIN)}
              label={listName}
            />
          )}
        </>
      )}
    </>
  );
}
