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
export function requestJson(url: string, method: 'GET' | 'POST', data?: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    if (wechat()) { wechat().request({ url, method, data, timeout: method === 'GET' ? 3000 : 8000, success: (r: any) => r.statusCode === 200 ? resolve(r.data) : reject(Error('服务连接失败')), fail: () => reject(Error('网络不可用')) }); return; }
    const xhr = new XMLHttpRequest(); xhr.open(method, url); if (method === 'POST') xhr.setRequestHeader('Content-Type', 'application/json'); xhr.timeout = method === 'GET' ? 3000 : 8000;
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
export function vibrate(type: 'light' | 'medium' | 'heavy' = 'light') { if (read('vibration', '1') === '1') wechat()?.vibrateShort({ type }); }
export function topSafeInset(): number {
  if (!wechat()) return 64;
  try {
    const info = wechat().getWindowInfo?.() ?? wechat().getSystemInfoSync();
    const width = info?.windowWidth > 0 ? info.windowWidth : 375;
    const menu = wechat().getMenuButtonBoundingClientRect?.();
    const statusTop = Math.max(info?.statusBarHeight ?? 0, info?.safeArea?.top ?? 0);
    const capsuleBottom = menu && menu.bottom > 0 ? menu.bottom + 12 : statusTop + 48;
    const px = Math.max(capsuleBottom, statusTop + 44) * 750 / width;
    return Math.min(210, Math.max(64, Math.round(px)));
  } catch { return 96; }
}

export function bottomSafeInset(): number {
  if (!wechat()) return 20;
  try {
    const info = wechat().getWindowInfo?.() ?? wechat().getSystemInfoSync();
    const width = info?.windowWidth > 0 ? info.windowWidth : 375;
    const screenH = info?.screenHeight ?? info?.windowHeight ?? 0;
    const safeBottom = info?.safeArea?.bottom ?? screenH;
    const px = Math.max(0, screenH - safeBottom) * 750 / width;
    return Math.min(120, Math.max(20, Math.round(px)));
  } catch { return 40; }
}
