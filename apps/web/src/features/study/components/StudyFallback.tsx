// Loading or an error on a study screen: a phone has no site bar there, so «Volver» is on it, where the next screen
// has it.

import type { ReactNode } from 'react';
import { BackButton } from '../../../shared/ui/BackButton';
import { answerBar, studyScreen } from '../../../shared/ui/styles';

export function StudyFallback({
  back,
  label,
  children,
}: {
  back: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className={studyScreen}>
      <div className={`${answerBar} min-h-11 pb-2`}>
        <BackButton to={back} label={label} className="justify-self-start" />
      </div>
      {children}
    </div>
  );
}
