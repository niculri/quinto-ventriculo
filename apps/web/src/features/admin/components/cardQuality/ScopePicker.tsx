// What «Tarjetas» looks at: the course, the assessment (or the whole course), the unit (or the whole assessment) and
// which of the two lists.
import { Select } from '../../../../shared/ui/Select';
import type { QualityList, QualityScope, ScopeChoice } from '../../model/cardQuality';
import { scopePickerStrings as s } from './strings/ScopePicker.strings';

export function ScopePicker({
  scope,
  list,
  onScope,
  onList,
}: {
  scope: QualityScope;
  list: QualityList;
  onScope: (choice: ScopeChoice) => void;
  onList: (list: QualityList) => void;
}) {
  const none = !scope.courses.length;
  return (
    <div className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Select
        label={s.course}
        value={scope.choice.course}
        options={scope.courses}
        onChange={(course) => onScope({ course, assessment: '', unit: '' })}
        disabled={none}
      />
      <Select
        label={s.assessment}
        value={scope.choice.assessment}
        options={scope.assessments}
        onChange={(assessment) => onScope({ ...scope.choice, assessment, unit: '' })}
        disabled={none}
      />
      <Select
        label={s.unit}
        value={scope.choice.unit}
        options={scope.units}
        onChange={(unit) => onScope({ ...scope.choice, unit })}
        disabled={!scope.choice.assessment}
      />
      <Select
        label={s.list}
        value={list}
        options={[
          { value: 'hardest', label: s.lists.hardest },
          { value: 'suspicious', label: s.lists.suspicious },
        ]}
        onChange={onList}
      />
    </div>
  );
}
