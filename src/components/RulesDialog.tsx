import { Button, Dialog, Glyph, useStrings } from './ui';

export function RulesDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStrings();
  return (
    <Dialog open={open} onClose={onClose} title={s.rules} labelledBy="rules-title" className="dialog--rules">
      <div className="rules">
        <div className="rules__legend">
          {(['red', 'blue', 'neutral', 'assassin'] as const).map((id) => (
            <span key={id} className={`legend-chip legend-chip--${id}`}>
              <Glyph identity={id} size={14} />
              {s.identity[id]}
            </span>
          ))}
        </div>
        {s.rulesBody.map(([title, body]) => (
          <section key={title} className="rules__section">
            <h3>{title}</h3>
            <p>{body}</p>
          </section>
        ))}
        <section className="rules__section">
          <h3>{s.spymaster} / {s.operative}</h3>
          <p>{s.roleExplainSpy}</p>
          <p>{s.roleExplainOp}</p>
          <p>{s.roleExplainHost}</p>
          <p>{s.minPlayers}</p>
        </section>
      </div>
      <div className="dialog__actions">
        <Button variant="primary" onClick={onClose}>
          {s.close}
        </Button>
      </div>
    </Dialog>
  );
}
