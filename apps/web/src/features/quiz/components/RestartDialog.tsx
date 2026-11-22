// «¿Reiniciar la ronda?»: «Reiniciar» takes the focus; Escape, «Cancelar» or a click outside close it.
import { useEffect, useRef } from 'react';
import { restartDialogStrings as s } from './strings/RestartDialog.strings';

export function RestartDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const yesRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    yesRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="quiz-dlg-velo" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div
        className="dlg"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="quiz-restart-title"
        aria-describedby="quiz-restart-text"
      >
        <h2 id="quiz-restart-title">{s.restart.title}</h2>
        <p id="quiz-restart-text">{s.restart.text}</p>
        <div className="acciones">
          <button ref={yesRef} type="button" className="btn" onClick={onConfirm}>
            {s.restart.yes}
          </button>
          <button type="button" className="btn2" onClick={onCancel}>
            {s.restart.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
