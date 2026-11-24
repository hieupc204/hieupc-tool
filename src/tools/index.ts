import type { ComponentType } from 'react';
import { TerminalTool } from './terminal/TerminalTool.tsx';

export interface ToolDefinition {
  id: string;
  name: string;
  /** Ký hiệu ngắn hiển thị ở sidebar */
  icon: string;
  description: string;
  /** `active` = tool đang được hiển thị (tool vẫn được giữ mount khi ẩn) */
  component: ComponentType<{ active: boolean }>;
}

// Thêm tool mới: tạo thư mục trong src/tools/<ten-tool>/ rồi khai báo vào đây.
export const tools: ToolDefinition[] = [
  {
    id: 'terminal',
    name: 'Terminal',
    icon: '>_',
    description: 'Kết nối shell trên máy và gõ lệnh ngay trong trình duyệt',
    component: TerminalTool,
  },
];
