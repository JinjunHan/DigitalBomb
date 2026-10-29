import { sys } from 'cc';
declare const wx: any;
export const wechat = () => typeof wx !== 'undefined' ? wx : null;
const storage = () => sys.localStorage;
export function read(key: string, fallback = '') { try { return storage().getItem('db-' + key) || fallback; } catch { return fallback; } }
export function write(key: string, value: string) { try { storage().setItem('db-' + key, value); } catch { /* Storage may be disabled. */ } }
export function apiBase() {
  // Set this in the build configuration before device testing; never silently use localhost on WeChat.
  // WeChat storage may return an empty string for a missing key.
  if (wechat()) return read('api').trim() || 'https://bomb.aiforevery.cn';
  const query = new URLSearchParams(globalThis.location?.search ?? '');
  return query.get('api') ?? read('api', globalThis.location?.hostname === 'bomb.aiforevery.cn' ? globalThis.location.origin : 'http://127.0.0.1:8787');
}
export function post(url: string, data: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    if (wechat()) { wechat().request({ url, method: 'POST', data, success: (r: any) => r.statusCode === 200 ? resolve(r.data) : reject(Error('服务连接失败')), fail: () => reject(Error('网络不可用')) }); return; }
    const xhr = new XMLHttpRequest(); xhr.open('POST', url); xhr.setRequestHeader('Content-Type', 'application/json'); xhr.timeout = 8000;
    xhr.onload = () => { try { if (xhr.status !== 200) throw Error(); resolve(JSON.parse(xhr.responseText)); } catch { reject(Error('服务连接失败')); } };
    xhr.onerror = xhr.ontimeout = () => reject(Error('无法连接本地服务，请先运行 npm run server'));
    xhr.send(JSON.stringify(data));
  });
}
export async function copy(value: string): Promise<void> {
  if (wechat()) return new Promise((resolve,reject)=>wechat().setClipboardData({data:value,success:()=>resolve(),fail:()=>reject(Error('复制未完成，请手动输入房间口令'))}));
  if(!globalThis.navigator?.clipboard)throw Error('无法访问剪贴板，请手动输入房间口令');
  await globalThis.navigator.clipboard.writeText(value);
}
export function vibrate() { if (read('vibration', '1') === '1') wechat()?.vibrateShort({ type: 'light' }); }
export function topSafeInset(): number {
  if (!wechat()) return 64;
  try { const info = wechat().getWindowInfo?.() ?? wechat().getSystemInfoSync(); const menu = wechat().getMenuButtonBoundingClientRect(); return Math.max(64, (menu.bottom + 12) * 750 / info.windowWidth); } catch { return 96; }
}

export function bottomSafeInset(): number {
  if (!wechat()) return 20;
  try {
    const info = wechat().getWindowInfo?.() ?? wechat().getSystemInfoSync();
    return Math.max(20, (info.screenHeight - (info.safeArea?.bottom ?? info.screenHeight)) * 750 / info.windowWidth);
  } catch { return 40; }
}
