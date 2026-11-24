// An assessment's gymkana from its URL: the catalog, its deck, its stations (from the card index) and the round and
// choices the student saved.
import { useQuery } from '@tanstack/react-query';
import { useApi } from '../../../shared/hooks/useApi';
import { caQuizId, gymkanaDeck } from '../../catalog/model/gymkana';
import { descendants } from '../../catalog/model/tree';
import { useAnkiTree } from '../../catalog/hooks/useAnkiTree';
import { cardIndexQuery } from '../../cards/api/queries';
import { useAssessmentSection } from '../../courses/hooks/useAssessmentSection';
import { useQuizRepository } from '../../quiz/api/context';
import { savedQuizQuery } from '../../quiz/api/queries';
import { CA_SECTION } from '../model/saving';
import { gymkanaStations } from '../model/stations';

export function useGymkana() {
  const section = useAssessmentSection();
  const { tree } = useAnkiTree();
  const { assessment } = section;
  const node = tree && assessment ? gymkanaDeck(tree, assessment.id) : null;
  const ref = assessment?.cardIndex ? { id: assessment.id, hash: assessment.cardIndex.hash } : null;
  const api = useApi();
  const index = useQuery({
    ...cardIndexQuery(api, ref ?? { id: '', hash: '' }),
    enabled: !!ref && !!node,
  });
  const quizId = node ? caQuizId(node.id) : null;
  const saved = useQuery(savedQuizQuery(useQuizRepository(), quizId));
  const data =
    index.data && node
      ? gymkanaStations(index.data, new Set(descendants(node).map((n) => n.id)), node.id)
      : null;
  return {
    ...section,
    node,
    quizId,
    data,
    saved: saved.data?.[CA_SECTION] ?? null,
    savedReady: saved.isSuccess,
    error: index.error ?? saved.error,
    retry: () => {
      if (index.isError) void index.refetch();
      if (saved.isError) void saved.refetch();
    },
  };
}
