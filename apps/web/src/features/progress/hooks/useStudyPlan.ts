// The simple plan (units turned on, an assessment's settings, the median answer) and its changes, shown at once.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { StudyPlan } from '@qv/study';
import { useStudyRepository } from '../api/context';
import { studyKeys, studyPlanQuery } from '../api/queries';
import type { AssessmentSetting } from '../api/repository';

export function useStudyPlan() {
  const study = useStudyRepository();
  return useQuery(studyPlanQuery(study));
}

const PLAN_CHANGE = ['study', 'plan-change'] as const;

// Shown at once and saved behind; with several changes on their way the plan is read again only after the last one,
// or the switches of the others would jump back for a moment.
function usePlanChange<T>(
  save: (value: T) => Promise<void>,
  apply: (p: StudyPlan, v: T) => StudyPlan,
) {
  const client = useQueryClient();
  const alone = () => client.isMutating({ mutationKey: PLAN_CHANGE }) === 1;
  return useMutation({
    mutationKey: PLAN_CHANGE,
    mutationFn: save,
    onMutate: async (value: T) => {
      await client.cancelQueries({ queryKey: studyKeys.plan });
      const before = client.getQueryData<StudyPlan>(studyKeys.plan);
      if (before) client.setQueryData(studyKeys.plan, apply(before, value));
      return { before };
    },
    onError: (_e, _v, context) => {
      if (context?.before && alone()) client.setQueryData(studyKeys.plan, context.before);
    },
    onSettled: () => (alone() ? client.invalidateQueries({ queryKey: studyKeys.plan }) : undefined),
  });
}

export function useSetActivation() {
  const study = useStudyRepository();
  return usePlanChange<{ deckId: string; active: boolean }>(
    ({ deckId, active }) => study.setDeckActivation(deckId, active),
    (plan, a) => ({
      ...plan,
      activations: [...plan.activations.filter((x) => x.deckId !== a.deckId), a],
    }),
  );
}

export function useSaveAssessmentSetting() {
  const study = useStudyRepository();
  return usePlanChange<AssessmentSetting>(
    (setting) => study.saveAssessmentSetting(setting),
    (plan, s) => ({
      ...plan,
      assessments: [...plan.assessments.filter((x) => x.deckId !== s.deckId), s],
    }),
  );
}
