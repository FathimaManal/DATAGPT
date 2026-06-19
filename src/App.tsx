import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchSample, pingHealth, runQuery } from './api';
import type { ChatSession, Dataset, Message } from './types';
import Sidebar from './components/Sidebar';
import SourcePicker from './components/SourcePicker';
import ChatPanel from './components/ChatPanel';

const STORAGE_KEY = 'datagpt.sessions.v1';
const CURRENT_KEY = 'datagpt.currentId.v1';

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function newSession(): ChatSession {
  return { id: uuid(), title: 'New Chat', messages: [], createdAt: Date.now() };
}

function loadInitialSessions(): { sessions: ChatSession[]; currentId: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const savedId = localStorage.getItem(CURRENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as ChatSession[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validId = parsed.find((s) => s.id === savedId)?.id ?? parsed[0].id;
        return { sessions: parsed, currentId: validId };
      }
    }
  } catch {
    /* fall through to defaults */
  }
  const s = newSession();
  return { sessions: [s], currentId: s.id };
}

export default function App() {
  const initial = useRef(loadInitialSessions()).current;
  const [sessions, setSessions] = useState<ChatSession[]>(initial.sessions);
  const [currentId, setCurrentId] = useState<string>(initial.currentId);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [datasetError, setDatasetError] = useState<string | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const current = useMemo(
    () => sessions.find((s) => s.id === currentId) ?? sessions[0],
    [sessions, currentId],
  );

  useEffect(() => {
    pingHealth();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
    } catch {
      /* storage full or disabled — ignore */
    }
  }, [sessions]);

  useEffect(() => {
    try {
      localStorage.setItem(CURRENT_KEY, currentId);
    } catch {
      /* ignore */
    }
  }, [currentId]);

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
    setSidebarOpen(false);
  };

  const handleSelectSession = (id: string) => {
    setCurrentId(id);
    setSidebarOpen(false);
  };

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
    <div className={`app ${sidebarOpen ? 'is-sidebar-open' : ''}`}>
      <Sidebar
        sessions={sessions}
        currentId={currentId}
        onNew={handleNewChat}
        onSelect={handleSelectSession}
        onDelete={handleDeleteSession}
        onClose={() => setSidebarOpen(false)}
      />
      {sidebarOpen && <div className="backdrop" onClick={() => setSidebarOpen(false)} />}
      <main className="main">
        <header className="header">
          <button
            className="header__menu"
            aria-label="Open menu"
            onClick={() => setSidebarOpen(true)}
          >
            <span></span>
            <span></span>
            <span></span>
          </button>
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
