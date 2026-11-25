// Biến thứ được kéo thả / dán vào terminal thành đường dẫn file trên máy.

/** Có thứ gì thả vào được không: file từ Finder, hoặc đường dẫn file:// kéo từ VS Code và app khác */
export function hasDroppable(data: DataTransfer): boolean {
  return data.types.includes('Files') || data.types.includes('text/uri-list');
}

/** Thoát ký tự đặc biệt bằng dấu \ giống Terminal.app, để shell lẫn Claude Code đều đọc đúng */
function shellEscape(p: string): string {
  return p.replace(/[^\p{L}\p{N}@%+=:,./_-]/gu, '\\$&');
}

/** Hỏi server đường dẫn thật của file trên máy; null nếu không xác định được (ảnh dán, file trùng…) */
async function locate(file: File): Promise<string | null> {
  if (!file.size) return null;
  const query = new URLSearchParams({ name: file.name, size: String(file.size), mtime: String(file.lastModified) });
  try {
    const res = await fetch(`/api/uploads/locate?${query}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { path?: string };
    return body.path ?? null;
  } catch {
    return null;
  }
}

async function upload(file: File): Promise<string> {
  const res = await fetch(`/api/uploads?name=${encodeURIComponent(file.name)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  const body = (await res.json().catch(() => null)) as { path?: string; error?: string } | null;
  if (!res.ok || !body?.path) {
    throw new Error(body?.error ?? (res.status === 413 ? 'file quá lớn (tối đa 200MB)' : `lỗi ${res.status}`));
  }
  return body.path;
}

export async function droppedPaths(data: DataTransfer): Promise<{ paths: string[]; errors: string[] }> {
  // DataTransfer chỉ đọc được trong lúc sự kiện đang chạy, nên lấy hết ra trước mọi await
  const uris = data
    .getData('text/uri-list')
    .split(/\r?\n/)
    .filter((line) => line.startsWith('file://'));
  const files: File[] = [];
  const errors: string[] = [];
  const items = [...data.items].filter((item) => item.kind === 'file');
  if (items.length) {
    for (const item of items) {
      const file = item.getAsFile();
      if (item.webkitGetAsEntry?.()?.isDirectory) {
        errors.push(`${file?.name ?? 'Thư mục'}: chưa hỗ trợ kéo thư mục`);
      } else if (file) files.push(file);
    }
  } else files.push(...data.files);

  // App trên máy (VS Code…) đưa sẵn đường dẫn thật: dùng luôn, khỏi sao chép file
  if (uris.length) {
    const paths = uris.map((uri) => shellEscape(decodeURIComponent(new URL(uri).pathname)));
    return { paths, errors: [] };
  }

  const paths: string[] = [];
  for (const file of files) {
    try {
      // Ưu tiên file gốc trên máy; chỉ sao chép vào thư mục tạm khi không tìm ra
      paths.push(shellEscape((await locate(file)) ?? (await upload(file))));
    } catch (err) {
      errors.push(`${file.name}: ${err instanceof Error ? err.message : 'không tải lên được'}`);
    }
  }
  return { paths, errors };
}
