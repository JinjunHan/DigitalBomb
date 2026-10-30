import type { Snapshot, ServerMessage, Command } from './shared/protocol';
import { getWechatLoginCode } from './shared/wechat-login';
import { apiBase, post, read, write, wechat } from './Platform';
export class Connection {
  state: Snapshot | null = null; online = false; offset = 0;
  onState: () => void = () => {}; onStatus: () => void = () => {}; onError: (s: string) => void = () => {};
  private ws: any; private token = ''; private stopped = false; private retry?: ReturnType<typeof setTimeout>; private heartbeat?: ReturnType<typeof setInterval>;
  private pending = new Map<string, { cmd: Command; resolve: () => void; reject: (e: Error) => void; timeout: ReturnType<typeof setTimeout> }>();
  private sequence = 0;
  now() { return Date.now() + this.offset; }
  async start() {
    this.stopped = false;
    const base = apiBase(); if (!base) throw Error('微信真机需要配置后端地址和正式登录，当前可在浏览器体验本地版本');
    const wx = wechat();
    const code = wx ? await getWechatLoginCode(wx) : undefined;
    if (this.stopped) return;
    const auth = await post(base + '/api/login', { token: read('token'), code });
    if (this.stopped) return;
    this.token = auth.token; write('token', auth.token); this.open();
  }
  private open() {
    if (this.stopped) return;
    const url = apiBase().replace(/^http/, 'ws') + '/ws';
    const opened = () => { this.send({ action: 'auth', token: this.token }); };
    const message = (event: any) => {
      let m: ServerMessage; try { m = JSON.parse(event.data); } catch { return; }
      if (m.type === 'state' && m.state) {
        const wasOffline = !this.online; this.online = true; this.offset = m.state.serverNow - Date.now(); this.state = m.state;
        if (wasOffline) { for (const p of this.pending.values()) this.send(p.cmd); this.onStatus(); }
        this.onState(); return;
      }
      const p = m.id ? this.pending.get(m.id) : undefined;
      if (p) { clearTimeout(p.timeout); this.pending.delete(m.id!); m.type === 'error' ? p.reject(Error(m.message)) : p.resolve(); }
      else if (m.type === 'error') this.onError(m.message ?? '操作失败');
    };
    const closed = (event: any) => {
      this.online = false; if (this.heartbeat) clearInterval(this.heartbeat); this.onStatus();
      if (event.code === 4001) { this.stopped = true; this.onError('账号已在另一窗口登录，请使用无痕窗口体验另一位玩家'); return; }
      if (!this.stopped) this.retry = setTimeout(() => this.open(), 2000);
    };
    if (wechat()) {
      this.ws = wechat().connectSocket({ url }); this.ws.onOpen(opened); this.ws.onMessage(message); this.ws.onClose(closed); this.ws.onError(() => {});
    } else { this.ws = new WebSocket(url); this.ws.onopen = opened; this.ws.onmessage = message; this.ws.onclose = closed; this.ws.onerror = () => {}; }
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = setInterval(() => { if (this.online) this.send({ action: 'heartbeat' }); }, 5000);
  }
  private send(data: unknown) { try { const value = JSON.stringify(data); if (wechat()) this.ws.send({ data: value }); else this.ws.send(value); } catch { /* Retry after authenticated reconnect. */ } }
  command(action: string, payload: Record<string, unknown> = {}): Promise<void> {
    if (!this.online) return Promise.reject(Error('正在恢复连接，请稍等'));
    const id = Date.now().toString(36) + '-' + (++this.sequence) + '-' + Math.random().toString(36).slice(2, 8);
    const cmd = { id, action, payload };
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { this.pending.delete(id); reject(Error('确认超时，请查看同步后的状态')); }, 12000);
      this.pending.set(id, { cmd, resolve, reject, timeout }); this.send(cmd);
    });
  }
  stop() { this.stopped = true; clearTimeout(this.retry); clearInterval(this.heartbeat); this.ws?.close(); for (const p of this.pending.values()) { clearTimeout(p.timeout); p.reject(Error('连接已关闭')); } this.pending.clear(); }
}
