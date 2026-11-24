import { useState } from 'react';
import { tools } from './tools/index.ts';

export function App() {
  const [activeId, setActiveId] = useState(tools[0].id);
  // Tool đã mở được giữ mount (chỉ ẩn đi) để không mất trạng thái, vd. phiên terminal.
  const [opened, setOpened] = useState(() => new Set([tools[0].id]));

  const select = (id: string) => {
    setActiveId(id);
    setOpened((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">Web Tool</div>
        <nav>
          {tools.map((tool) => (
            <button
              key={tool.id}
              className={`nav-item${tool.id === activeId ? ' is-active' : ''}`}
              title={tool.description}
              onClick={() => select(tool.id)}
            >
              <span className="nav-icon">{tool.icon}</span>
              {tool.name}
            </button>
          ))}
        </nav>
      </aside>
      <main className="content">
        {tools
          .filter((tool) => opened.has(tool.id))
          .map((tool) => (
            <section key={tool.id} className="tool-pane" hidden={tool.id !== activeId}>
              <tool.component active={tool.id === activeId} />
            </section>
          ))}
      </main>
    </div>
  );
}
