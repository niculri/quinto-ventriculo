// What a screen reader hears with every card: «Tarjeta N de esta sesión», or its answer.
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
      {shown ? `${revealed ? 'Respuesta de la tarjeta' : 'Tarjeta'} ${turn} de esta sesión` : ''}
    </p>
  );
}
