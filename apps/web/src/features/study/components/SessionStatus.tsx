// What a screen reader hears with every card: «Tarjeta N de esta sesión», or its answer.
import { studyStrings } from '../strings';

export function SessionStatus({
  shown,
  revealed,
  turn,
}: {
  shown: boolean;
  revealed: boolean;
  turn: number;
}) {
  return (
    <p role="status" className="sr-only">
      {shown ? studyStrings.turn(revealed, turn) : ''}
    </p>
  );
}
