import { useState } from 'react';
import type { SubmitPromptRequest } from '../../shared/api';

type SubmitPromptProps = {
  onSubmit: (
    draft: SubmitPromptRequest
  ) => Promise<{ ok: boolean; message: string }>;
};

type Note = { kind: 'ok' | 'err'; text: string } | null;

/** "Got a divisive question?" - community prompt submissions for the mod queue. */
export const SubmitPrompt = ({ onSubmit }: SubmitPromptProps) => {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const [sending, setSending] = useState(false);
  const [note, setNote] = useState<Note>(null);

  if (!open) {
    return (
      <button className="rtr-btn rtr-btn--ghost" onClick={() => setOpen(true)}>
        Got a divisive question? Submit it
      </button>
    );
  }

  const send = async () => {
    setSending(true);
    setNote(null);
    const result = await onSubmit({
      question: question.trim(),
      left: left.trim(),
      right: right.trim(),
    });
    setSending(false);
    setNote({ kind: result.ok ? 'ok' : 'err', text: result.message });
    if (result.ok) {
      setQuestion('');
      setLeft('');
      setRight('');
    }
  };

  const ready =
    question.trim().length > 0 &&
    left.trim().length > 0 &&
    right.trim().length > 0;

  return (
    <section className="rtr-card rtr-card--flat">
      <span className="rtr-kicker">Letters to the Editor</span>
      <p className="rtr-hint">
        Pitch tomorrow’s room: a question plus the two ends of its spectrum.
        Mods review every submission.
      </p>
      <label className="rtr-field">
        <span className="rtr-field-label">The question (max 140)</span>
        <input
          className="rtr-input"
          maxLength={140}
          placeholder="e.g. Pineapple on pizza"
          value={question}
          onChange={(e) => setQuestion(e.currentTarget.value)}
        />
      </label>
      <label className="rtr-field">
        <span className="rtr-field-label">Label for 0 (max 40)</span>
        <input
          className="rtr-input"
          maxLength={40}
          placeholder="e.g. A crime against Italy"
          value={left}
          onChange={(e) => setLeft(e.currentTarget.value)}
        />
      </label>
      <label className="rtr-field">
        <span className="rtr-field-label">Label for 100 (max 40)</span>
        <input
          className="rtr-input"
          maxLength={40}
          placeholder="e.g. A tropical masterpiece"
          value={right}
          onChange={(e) => setRight(e.currentTarget.value)}
        />
      </label>
      <button
        className="rtr-btn"
        disabled={!ready || sending}
        onClick={() => void send()}
      >
        {sending ? 'Sending…' : 'Send to the mods'}
      </button>
      {note ? (
        <p className={`rtr-form-note rtr-form-note--${note.kind}`}>
          {note.text}
        </p>
      ) : null}
    </section>
  );
};
