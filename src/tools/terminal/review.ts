import { request } from './repos.ts';

export interface ChangedFile {
  path: string;
  oldPath?: string;
  /** Chữ cái trạng thái của git; `?` = file mới chưa git add */
  status: string;
  /** null = file nhị phân hoặc không đếm được */
  additions: number | null;
  deletions: number | null;
  /** Đổi mỗi khi nội dung file trên đĩa đổi */
  version: string;
}

export interface Review {
  root: string;
  /** null khi không đứng trên nhánh nào (detached HEAD) */
  branch: string | null;
  base: string;
  /** Tối đa 500 file đầu */
  files: ChangedFile[];
  total: number;
}

/** root = null: terminal không đứng trong repo git */
export type ReviewResult = Review | { root: null; dir?: string };

export interface ReviewTarget {
  sessionId?: string;
  path?: string;
}

export const reviewApi = {
  list: (target: ReviewTarget) => {
    const query = new URLSearchParams();
    if (target.sessionId) query.set('sessionId', target.sessionId);
    if (target.path) query.set('path', target.path);
    return request<ReviewResult>(`/api/review?${query}`);
  },
  diff: (root: string, file: ChangedFile) => {
    const query = new URLSearchParams({ root, file: file.path });
    if (file.oldPath) query.set('oldPath', file.oldPath);
    return request<{ diff: string }>(`/api/review/file?${query}`);
  },
};

export interface DiffLine {
  kind: 'add' | 'del' | 'same' | 'hunk' | 'note';
  text: string;
  oldLine?: number;
  newLine?: number;
}

/** Đọc diff dạng unified của một file; bỏ phần đầu (tên file, mode) vì giao diện đã có */
export function parseDiff(diff: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  // Số dòng còn lại của đoạn đang đọc: nhờ vậy nội dung có dạng "--- x" không bị nhầm là phần đầu
  let oldLeft = 0;
  let newLeft = 0;
  const rows = diff.split('\n');
  if (rows.at(-1) === '') rows.pop();
  for (const row of rows) {
    if (row.startsWith('\\')) {
      if (lines.length) lines.push({ kind: 'note', text: 'Không có xuống dòng ở cuối file' });
      continue;
    }
    if (oldLeft > 0 || newLeft > 0) {
      const text = row.slice(1);
      if (row[0] === '+') {
        lines.push({ kind: 'add', text, newLine: newLine++ });
        newLeft--;
      } else if (row[0] === '-') {
        lines.push({ kind: 'del', text, oldLine: oldLine++ });
        oldLeft--;
      } else {
        lines.push({ kind: 'same', text, oldLine: oldLine++, newLine: newLine++ });
        oldLeft--;
        newLeft--;
      }
      continue;
    }
    const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@ ?(.*)$/.exec(row);
    if (hunk) {
      oldLine = Number(hunk[1]);
      oldLeft = Number(hunk[2] ?? 1);
      newLine = Number(hunk[3]);
      newLeft = Number(hunk[4] ?? 1);
      lines.push({ kind: 'hunk', text: hunk[5] });
    } else if (row.startsWith('Binary files ')) {
      lines.push({ kind: 'note', text: 'File nhị phân, không hiện được nội dung' });
    } else if (/^(old|new) mode /.test(row)) {
      lines.push({ kind: 'note', text: row.replace('old mode', 'Quyền file cũ:').replace('new mode', 'Quyền file mới:') });
    }
  }
  return lines;
}

// Đánh dấu "đã xem" theo phiên bản file: file bị sửa tiếp là tự mất dấu, nhờ vậy biết agent vừa đụng lại chỗ nào.
// Chỉ là tiện ích của trình duyệt này, mất cũng không sao.

const VIEWED_KEY = 'web-tool.review-viewed';
const MAX_VIEWED = 2000;

export type Viewed = Record<string, string>;

export const viewedKey = (root: string, file: ChangedFile) => `${root}\n${file.path}`;

export function loadViewed(): Viewed {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(VIEWED_KEY) ?? '{}');
    return parsed && typeof parsed === 'object' ? (parsed as Viewed) : {};
  } catch {
    return {};
  }
}

export function saveViewed(viewed: Viewed): void {
  try {
    // Bỏ bớt dấu cũ nhất để không phình mãi
    localStorage.setItem(VIEWED_KEY, JSON.stringify(Object.fromEntries(Object.entries(viewed).slice(-MAX_VIEWED))));
  } catch {
    // Không lưu được thì chỉ mất ghi nhớ sau khi tải lại trang
  }
}
