import { useCallback, useEffect, useRef, useState } from 'react';
import { type ReviewResult, type ReviewTarget, reviewApi } from './review.ts';

const OPEN_INTERVAL = 3000;
/** Bảng đang đóng thì chỉ cần con số trên nút, hỏi thưa hơn */
const CLOSED_INTERVAL = 10_000;

/** Theo dõi thay đổi chưa commit của repo mà terminal đang chọn đang đứng */
export function useReview(target: ReviewTarget, enabled: boolean, open: boolean, refreshKey: unknown) {
  const { sessionId, path } = target;
  const [state, setState] = useState<{ key: string; result: ReviewResult | null; error: string | null }>({
    key: '',
    result: null,
    error: null,
  });
  const requestId = useRef(0);

  const refresh = useCallback(async () => {
    // Terminal vừa mở, server chưa cấp id: giữ kết quả cũ, lát nữa có id sẽ đọc lại
    if (!sessionId && !path) return;
    const id = ++requestId.current;
    const key = `${sessionId ?? ''}\n${path ?? ''}`;
    try {
      const result = await reviewApi.list({ sessionId, path });
      if (id !== requestId.current) return;
      // Không đổi gì thì giữ nguyên object cũ để khỏi vẽ lại
      setState((prev) =>
        prev.key === key && !prev.error && JSON.stringify(prev.result) === JSON.stringify(result)
          ? prev
          : { key, result, error: null },
      );
    } catch (err) {
      if (id !== requestId.current) return;
      const error = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ key, result: prev.key === key ? prev.result : null, error }));
    }
  }, [sessionId, path]);

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Hẹn lượt sau khi lượt trước xong, để repo lớn không bị dồn yêu cầu
    const loop = async () => {
      if (document.visibilityState === 'visible') await refresh();
      if (!stopped) timer = setTimeout(loop, open ? OPEN_INTERVAL : CLOSED_INTERVAL);
    };
    void loop();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh, enabled, open, refreshKey]);

  // Vừa đổi tab thì tạm giữ kết quả cũ tới khi có kết quả mới: hai tab cùng repo sẽ không bị
  // đóng các diff đang xem. Tên repo và nhánh luôn hiện ở đầu bảng nên không nhầm được.
  return { result: state.result, error: state.error, refresh };
}
