import { useState } from 'react';
import type { Liability } from '../engine/types';
import { Icon } from '../components/icons';
import { useToast } from '../components/feedback';
import { Badge, Card, Field, Num } from '../components/ui';
import { inr, pct, uid } from '../lib/format';
import { useStore } from '../store';

/** Loans you are paying. They feed the EMI and affordability maths on Goals, so they live there. */
export function LoansCard() {
  const { state, dispatch } = useStore();
  const { toast } = useToast();
  const [editingLoan, setEditingLoan] = useState<Liability | null>(null);

  return (
      <Card title="Loans you are paying" sub="Their EMIs count against what you can afford for each goal"
        right={<button className="btn small" onClick={() => setEditingLoan({ id: uid(), name: '', outstanding: 0, rate: 10, emi: 0 })}><Icon name="plus" size={16} />Add loan</button>}>
        {editingLoan && <LoanForm initial={editingLoan} onClose={() => setEditingLoan(null)} />}
        {state.liabilities.length === 0 ? <p className="sub">None recorded.</p> : (
          <div className="table-wrap">
            <table className="table num cards">
              <thead><tr><th>Loan</th><th className="r">Outstanding</th><th className="r">Rate</th><th className="r">EMI</th><th /></tr></thead>
              <tbody>
                {state.liabilities.map((l) => (
                  <tr key={l.id}>
                    <td className="title">{l.name} {l.rate > 10 && <Badge tone="watch">! costly</Badge>}</td>
                    <td data-label="Outstanding" className="r">{inr(l.outstanding)}</td><td data-label="Rate" className="r">{pct(l.rate)}</td><td data-label="EMI" className="r">{inr(l.emi)}</td>
                    <td className="actions"><div className="row-actions"><button className="btn small" onClick={() => setEditingLoan(l)}><Icon name="pencil" size={16} />Edit</button><button className="btn icon small ghost danger" aria-label={`Delete ${l.name}`} title="Delete" onClick={() => { dispatch({ type: 'deleteLiability', id: l.id }); toast(`${l.name} deleted`, { undo: () => dispatch({ type: 'upsertLiability', liability: l }) }); }}><Icon name="trash" size={18} /><span className="icon-label">Delete</span></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
  );
}

function LoanForm({ initial, onClose }: { initial: Liability; onClose: () => void }) {
  const { dispatch } = useStore();
  const { toast } = useToast();
  const [l, setL] = useState(initial);
  return (
    <div className="stack" role="group" aria-label="Loan details" style={{ marginBottom: 14 }}>
      <div className="form-grid">
        <Field label="Name" required><input value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} placeholder="Car loan, credit card..." /></Field>
        <Num label="Outstanding (₹)" value={l.outstanding} onChange={(n) => setL({ ...l, outstanding: n })} min={0} />
        <Num label="Interest rate (%)" value={l.rate} onChange={(n) => setL({ ...l, rate: n })} min={0} />
        <Num label="Monthly EMI (₹)" value={l.emi} onChange={(n) => setL({ ...l, emi: n })} min={0} />
      </div>
      <div className="form-actions" style={{ marginTop: 0 }}>
        <button className="btn primary" disabled={!l.name} onClick={() => { dispatch({ type: 'upsertLiability', liability: l }); toast(`${l.name} saved`); onClose(); }}>Save loan</button>
        <button className="btn" onClick={onClose}>Cancel</button>
        {!l.name && <span className="why" role="status">Enter a name to save.</span>}
      </div>
    </div>
  );
}
