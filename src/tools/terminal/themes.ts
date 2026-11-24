import type { ITheme } from '@xterm/xterm';

export interface TerminalTheme {
  id: string;
  name: string;
  colors: ITheme & { background: string; foreground: string };
}

type Ansi = [string, string, string, string, string, string, string, string];

function theme(
  id: string,
  name: string,
  base: { background: string; foreground: string; cursor: string; selection: string },
  normal: Ansi,
  bright: Ansi,
): TerminalTheme {
  const [black, red, green, yellow, blue, magenta, cyan, white] = normal;
  const [brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite] =
    bright;
  return {
    id,
    name,
    colors: {
      background: base.background,
      foreground: base.foreground,
      cursor: base.cursor,
      cursorAccent: base.background,
      selectionBackground: base.selection,
      black, red, green, yellow, blue, magenta, cyan, white,
      brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite,
    },
  };
}

export const themes: TerminalTheme[] = [
  theme(
    'midnight',
    'Midnight',
    { background: '#0f1115', foreground: '#d7dae0', cursor: '#d7dae0', selection: '#2b3550' },
    ['#1b1f27', '#f07178', '#4ac07a', '#e0af4f', '#4f8cff', '#c792ea', '#56c8d8', '#d7dae0'],
    ['#5c6370', '#ff8b92', '#6fdc9a', '#f5c56e', '#7aa8ff', '#d9a9f5', '#7fdfe9', '#ffffff'],
  ),
  theme(
    'tokyo-night',
    'Tokyo Night',
    { background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5', selection: '#283457' },
    ['#15161e', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#a9b1d6'],
    ['#414868', '#f7768e', '#9ece6a', '#e0af68', '#7aa2f7', '#bb9af7', '#7dcfff', '#c0caf5'],
  ),
  theme(
    'dracula',
    'Dracula',
    { background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selection: '#44475a' },
    ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2'],
    ['#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'],
  ),
  theme(
    'catppuccin-mocha',
    'Catppuccin Mocha',
    { background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc', selection: '#585b70' },
    ['#45475a', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#bac2de'],
    ['#585b70', '#f38ba8', '#a6e3a1', '#f9e2af', '#89b4fa', '#f5c2e7', '#94e2d5', '#a6adc8'],
  ),
  theme(
    'one-dark',
    'One Dark',
    { background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', selection: '#3e4451' },
    ['#3f4451', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#abb2bf'],
    ['#5c6370', '#e06c75', '#98c379', '#e5c07b', '#61afef', '#c678dd', '#56b6c2', '#ffffff'],
  ),
  theme(
    'nord',
    'Nord',
    { background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', selection: '#434c5e' },
    ['#3b4252', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#88c0d0', '#e5e9f0'],
    ['#4c566a', '#bf616a', '#a3be8c', '#ebcb8b', '#81a1c1', '#b48ead', '#8fbcbb', '#eceff4'],
  ),
  theme(
    'gruvbox-dark',
    'Gruvbox Dark',
    { background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', selection: '#504945' },
    ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984'],
    ['#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2'],
  ),
  theme(
    'solarized-light',
    'Solarized Light',
    { background: '#fdf6e3', foreground: '#657b83', cursor: '#586e75', selection: '#eee8d5' },
    ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5'],
    ['#002b36', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'],
  ),
  theme(
    'github-light',
    'GitHub Light',
    { background: '#ffffff', foreground: '#24292f', cursor: '#044289', selection: '#b6d7ff' },
    ['#24292e', '#cf222e', '#116329', '#4d2d00', '#0969da', '#8250df', '#1b7c83', '#6e7781'],
    ['#57606a', '#a40e26', '#1a7f37', '#633c01', '#218bff', '#a475f9', '#3192aa', '#8c959f'],
  ),
];

const STORAGE_KEY = 'web-tool.terminal.theme';

export function loadTheme(): TerminalTheme {
  try {
    const id = localStorage.getItem(STORAGE_KEY);
    return themes.find((t) => t.id === id) ?? themes[0];
  } catch {
    return themes[0];
  }
}

export function saveTheme(theme: TerminalTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme.id);
  } catch {
    // Không lưu được (vd. chế độ riêng tư) thì chỉ áp dụng cho phiên hiện tại
  }
}
