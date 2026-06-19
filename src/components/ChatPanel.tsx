import { useEffect, useRef, useState } from 'react';
import type { Dataset, Message } from '../types';
import ResultsTable from './ResultsTable';

type Props = {
  dataset: Dataset;
  messages: Message[];
  loading: boolean;
  onSend: (nl: string) => void;
};

const SUGGESTIONS_SAMPLE = [
  'What is the average salary by department?',
  'Who earns the most?',
  'How many people are in Engineering?',
  'List employees ranked by salary, highest first.',
];

const SUGGESTIONS_CSV = [
  'Show me the first 5 rows.',
  'How many rows are in the table?',
  'What are the distinct values in each column?',
];

export default function ChatPanel({ dataset, messages, loading, onSend }: Props) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, loading]);

  const submit = () => {
    const v = input.trim();
    if (!v || loading) return;
    onSend(v);
    setInput('');
  };

  const suggestions = dataset.origin === 'sample' ? SUGGESTIONS_SAMPLE : SUGGESTIONS_CSV;

  return (
    <section className="chat">
      <div className="chat__scroll" ref={scrollRef}>
        {messages.length === 0 && (
          <div className="chat__empty">
            <div className="chat__empty-title">Ask anything about your data</div>
            <div className="chat__empty-sub">Try one of these:</div>
            <div className="chat__suggestions">
              {suggestions.map((s) => (
                <button key={s} className="chip" onClick={() => onSend(s)} disabled={loading}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <article key={m.id} className="msg">
            <div className="msg__user">
              <div className="msg__avatar msg__avatar--user">you</div>
              <div className="msg__body">{m.nlQuery}</div>
            </div>

            <div className="msg__system">
              <div className="msg__avatar msg__avatar--system">dg</div>
              <div className="msg__body">
                {m.pending && <div className="thinking">Thinking…</div>}

                {!m.pending && m.sql && (
                  <>
                    <div className="msg__label">Generated SQL</div>
                    <pre className="code">{m.sql}</pre>
                  </>
                )}

                {!m.pending && m.error && <div className="msg__error">{m.error}</div>}

                {!m.pending && !m.error && m.columns && m.columns.length > 0 && (
                  <>
                    <div className="msg__label">
                      Results <span className="muted">· {m.rowCount ?? m.rows?.length ?? 0} rows</span>
                    </div>
                    {m.rows && m.rows.length > 0 ? (
                      <ResultsTable columns={m.columns} rows={m.rows} />
                    ) : (
                      <div className="msg__empty">Query ran successfully but returned no rows.</div>
                    )}
                  </>
                )}

                {!m.pending && !m.error && (!m.columns || m.columns.length === 0) && m.sql && (
                  <div className="msg__success">
                    Query executed successfully · {m.rowCount ?? 0} row(s) affected
                  </div>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>

      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          className="composer__input"
          placeholder="Ask something about your data…"
          rows={2}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          disabled={loading}
        />
        <button type="submit" className="btn btn--primary" disabled={loading || !input.trim()}>
          {loading ? '…' : 'Send'}
        </button>
      </form>
    </section>
  );
}
