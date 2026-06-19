import type { ChatSession } from '../types';

type Props = {
  sessions: ChatSession[];
  currentId: string;
  onNew: () => void;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onClose?: () => void;
};

export default function Sidebar({ sessions, currentId, onNew, onSelect, onDelete, onClose }: Props) {
  return (
    <aside className="sidebar">
      <div className="sidebar__brand">
        <span className="sidebar__logo">D</span>
        <span className="sidebar__name">DataGPT</span>
        {onClose && (
          <button className="sidebar__close" aria-label="Close menu" onClick={onClose}>
            ×
          </button>
        )}
      </div>

      <button className="btn btn--primary btn--block" onClick={onNew}>
        <span>+</span> New chat
      </button>

      <div className="sidebar__section-label">Sessions</div>

      <ul className="sidebar__list">
        {sessions.map((s) => {
          const active = s.id === currentId;
          return (
            <li key={s.id} className={`sidebar__item ${active ? 'is-active' : ''}`}>
              <button className="sidebar__item-label" onClick={() => onSelect(s.id)}>
                <span className="sidebar__title">{s.title || 'Untitled'}</span>
                <span className="sidebar__count">{s.messages.length}</span>
              </button>
              <button
                className="sidebar__delete"
                aria-label="Delete session"
                onClick={() => onDelete(s.id)}
                title="Delete session"
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>

      <footer className="sidebar__footer">
        <a href="https://github.com/FathimaManal/DATAGPT" target="_blank" rel="noreferrer">
          github ↗
        </a>
      </footer>
    </aside>
  );
}
