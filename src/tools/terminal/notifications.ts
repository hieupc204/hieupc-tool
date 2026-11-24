const STORAGE_KEY = 'web-tool.terminal.notify';

export const notificationsSupported = typeof Notification !== 'undefined';

export function loadNotifyEnabled(): boolean {
  try {
    return notificationsSupported && Notification.permission === 'granted' && localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveNotifyEnabled(enabled: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Không lưu được thì chỉ áp dụng cho lần mở này
  }
}

/** Hỏi quyền thông báo của trình duyệt; trả về true nếu được phép. */
export async function requestNotifyPermission(): Promise<boolean> {
  if (!notificationsSupported) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

export function showNotification(title: string, body: string, tag: string, onClick: () => void): void {
  if (!notificationsSupported || Notification.permission !== 'granted') return;
  try {
    // Cùng tag thì thông báo mới thay thông báo cũ của tab đó, không dồn đống
    const notification = new Notification(title, { body, tag });
    notification.onclick = () => {
      onClick();
      notification.close();
    };
  } catch {
    // Một số trình duyệt chặn tạo thông báo trực tiếp; chấm báo trên tab vẫn hoạt động
  }
}
