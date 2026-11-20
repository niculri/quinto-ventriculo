// The study and account repositories of the tests, in memory.
import { LEGAL_VERSIONS } from '@qv/schema';
import { localAccountRepository } from '../../features/account/api/repository';
import type { AccountRepository } from '../../features/account/api/repository';
import { localStudyRepository } from '../../features/progress/api/repository';
import type { StudyRepository } from '../../features/progress/api/repository';
import { SESSION_ANA } from '../fixtures/session';

export function fullAnkiStudy(): StudyRepository {
  const study = localStudyRepository(null, {
    fullAnki: true,
    fourButtons: true,
    welcomeSeen: true,
  });
  void study.setDeckActivation('5', true);
  return study;
}

export function acceptedAccount(email = SESSION_ANA.user.email): AccountRepository {
  return localAccountRepository({
    email,
    initial: {
      accepted: {
        terms: LEGAL_VERSIONS.terms.version,
        privacy: LEGAL_VERSIONS.privacy.version,
        acceptedAt: '2026-11-08T12:00:00.000Z',
      },
    },
  });
}
