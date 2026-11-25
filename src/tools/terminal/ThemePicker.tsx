import { useState } from 'react';
import { type TerminalTheme, themes } from './themes.ts';

function Swatch({ theme }: { theme: TerminalTheme }) {
  const { background, foreground, red, green, blue, magenta } = theme.colors;
  return (
    <span className="swatch" style={{ background, borderColor: foreground }}>
      {[red, green, blue, magenta].map((color, i) => (
        <span key={i} style={{ background: color }} />
      ))}
    </span>
  );
}

interface Props {
  value: TerminalTheme;
  onChange: (theme: TerminalTheme) => void;
}

export function ThemePicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="theme-picker">
      <button className="theme-button" title="Đổi theme màu" onClick={() => setOpen((v) => !v)}>
        <Swatch theme={value} />
        <span className="theme-name">{value.name}</span>
      </button>
      {open && (
        <>
          <div className="theme-backdrop" onClick={() => setOpen(false)} />
          <div className="theme-menu">
            {themes.map((theme) => (
              <button
                key={theme.id}
                className={`theme-option${theme.id === value.id ? ' is-active' : ''}`}
                onClick={() => {
                  onChange(theme);
                  setOpen(false);
                }}
              >
                <Swatch theme={theme} />
                {theme.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
