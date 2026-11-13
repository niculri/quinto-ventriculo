import type { ReactNode } from 'react';
import { BackButton } from '../../ui/BackButton';
import { answerBar, studyScreen } from '../../ui/styles';

/**
 * Loading or an error where one answers: on a phone that screen has no site bar, so «Volver» is on it, in the place
 * it has on the screen that comes next.
 */
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
