import { useEffect, useMemo, useState } from 'react';
import { fetchSample, pingHealth, runQuery } from './api';
import type { ChatSession, Dataset, Message } from './types';
import Sidebar from './components/Sidebar';
import SourcePicker from './components/SourcePicker';
import ChatPanel from './components/ChatPanel';

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function newSession(): ChatSession {
  return { id: uuid(), title: 'New Chat', messages: [], createdAt: Date.now() };
}

export default function App() {
  const [sessions, setSessions] = useState<ChatSession[]>(() => [newSession()]);
  const [currentId, setCurrentId] = useState<string>(() => sessions[0].id);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);

  const current = useMemo(
    () => sessions.find((s) => s.id === currentId) ?? sessions[0],
    [sessions, currentId],
  );

  useEffect(() => {
    pingHealth();
  }, []);

  const loadSample = async () => {
    setDatasetLoading(true);
    setDatasetError(null);
    try {
      const data = await fetchSample();
      setDataset({
        tableName: data.table_name,
        columns: data.columns,
        rows: data.rows,
        origin: 'sample',
      });
    } catch (e: any) {
      setDatasetError(e.message ?? 'Failed to load sample data');
    } finally {
      setDatasetLoading(false);
    }
  };

  const loadCsv = (data: Dataset) => {
    setDataset(data);
    setDatasetError(null);
  };

  const handleNewChat = () => {
    const s = newSession();
    setSessions((prev) => [s, ...prev]);
    setCurrentId(s.id);
  };

  const handleSelectSession = (id: string) => setCurrentId(id);

  const handleDeleteSession = (id: string) => {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== id);
      if (next.length === 0) {
        const s = newSession();
        setCurrentId(s.id);
        return [s];
      }
      if (id === currentId) setCurrentId(next[0].id);
      return next;
    });
  };

  const handleSend = async (nl: string) => {
    if (!dataset || !nl.trim() || queryLoading) return;
    const msgId = uuid();
    const pending: Message = { id: msgId, nlQuery: nl, pending: true };

    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== currentId) return s;
        const title = s.messages.length === 0 ? nl.slice(0, 40) : s.title;
        return { ...s, title, messages: [...s.messages, pending] };
      }),
    );

    setQueryLoading(true);
    try {
      const res = await runQuery({
        tableName: dataset.tableName,
        columns: dataset.columns,
        rows: dataset.rows,
        nlQuery: nl,
      });
      setSessions((prev) =>
        prev.map((s) =>
          s.id !== currentId
            ? s
            : {
                ...s,
                messages: s.messages.map((m) =>
                  m.id !== msgId
                    ? m
                    : {
                        ...m,
                        pending: false,
                        sql: res.sql,
                        columns: res.columns,
                        rows: res.rows,
                        rowCount: res.row_count,
                        error: res.error ?? undefined,
                      },
                ),
              },
        ),
      );
    } catch (e: any) {
      setSessions((prev) =>
        prev.map((s) =>
          s.id !== currentId
            ? s
            : {
                ...s,
                messages: s.messages.map((m) =>
                  m.id !== msgId ? m : { ...m, pending: false, error: e.message ?? 'Request failed' },
                ),
              },
        ),
      );
    } finally {
      setQueryLoading(false);
    }
  };

  return (
    <div className="app">
      <Sidebar
        sessions={sessions}
        currentId={currentId}
        onNew={handleNewChat}
        onSelect={handleSelectSession}
        onDelete={handleDeleteSession}
      />
      <main className="main">
        <header className="header">
          <div>
            <h1>DataGPT</h1>
            <p className="subtitle">Chat your way through data — ask questions, get SQL + answers.</p>
          </div>
        </header>

        <SourcePicker
          dataset={dataset}
          loading={datasetLoading}
          error={datasetError}
          onUseSample={loadSample}
          onLoadCsv={loadCsv}
        />

        {dataset && (
          <ChatPanel
            dataset={dataset}
            messages={current.messages}
            onSend={handleSend}
            loading={queryLoading}
          />
        )}
      </main>
    </div>
  );
}
