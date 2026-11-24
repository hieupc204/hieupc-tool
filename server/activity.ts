// Đoán xem trong terminal có việc gì đang chạy (agent, build, test…) dựa vào dòng output,
// để báo cho người dùng lúc nó dừng. Làm ở server vì timer của tab trình duyệt chạy nền bị bóp.

/** Output ngay sau phím gõ là shell in lại ký tự, không tính là "đang chạy". */
const INPUT_ECHO_MS = 1000;
/** Output phải kéo dài chừng này mới coi là có việc đang chạy (bỏ qua lệnh in một phát rồi xong). */
const MIN_BUSY_MS = Number(process.env.WEB_TOOL_BUSY_MS) || 3000;
/** Im lặng chừng này sau khi đang chạy thì coi là xong hoặc đang chờ người dùng. */
const QUIET_MS = Number(process.env.WEB_TOOL_QUIET_MS) || 5000;

export type ActivityState = 'busy' | 'done';

export function createActivityTracker(onChange: (state: ActivityState) => void) {
  let lastInputAt = 0;
  let streakStart = 0;
  let lastOutputAt = 0;
  let busy = false;

  const timer = setInterval(() => {
    if (!streakStart || Date.now() - lastOutputAt < QUIET_MS) return;
    const wasBusy = busy;
    streakStart = 0;
    busy = false;
    if (wasBusy) onChange('done');
  }, 500);

  return {
    input() {
      lastInputAt = Date.now();
    },
    output() {
      const now = Date.now();
      if (now - lastInputAt < INPUT_ECHO_MS) return;
      if (!streakStart) streakStart = now;
      lastOutputAt = now;
      if (!busy && now - streakStart >= MIN_BUSY_MS) {
        busy = true;
        onChange('busy');
      }
    },
    stop() {
      clearInterval(timer);
    },
  };
}
