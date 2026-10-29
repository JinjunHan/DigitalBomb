/** Platform-only controller, injected so lifecycle and authorization can be tested without Cocos. */
export interface Invitation { code: string; roomId: string }
export function invitation(query: unknown): Invitation | undefined {
  if (!query || typeof query !== 'object') return;
  const q = query as Record<string, unknown>;
  if (typeof q.code === 'string' && /^\d{4}$/.test(q.code) && typeof q.roomId === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(q.roomId)) return { code: q.code, roomId: q.roomId };
}
export function avatarUrl(value: unknown): string | undefined {
  // Do not allow arbitrary remote URLs, credentials, local files or redirects supplied by a client.
  if (typeof value !== 'string' || value.length > 1024) return;
  return /^https:\/\/(?:thirdwx|wx)\.qlogo\.cn\/[A-Za-z0-9_\-/]+(?:\?[A-Za-z0-9_=&%-]*)?$/.test(value) ? value : undefined;
}
export function wechatProfile(value: any): { name: string; avatarUrl: string } | undefined {
  const name = typeof value?.nickName === 'string' ? value.nickName.trim() : '';
  const url = avatarUrl(value?.avatarUrl);
  if (!name || name === '微信用户' || !url) return;
  return { name: Array.from(name).slice(0, 12).join(''), avatarUrl: url };
}
export class WechatFlow {
  private button: any;
  private alive = true;
  private generation = 0;
  private lastInvitation = '';
  private onShow = (options: any) => this.receive(options?.query);
  private onShare = () => {
    const room = this.room();
    return room ? { title: '来猜我的四位暗号，等你入座', query: `code=${room.code}&roomId=${encodeURIComponent(room.roomId)}`, imageUrl: 'logo.png' }
      : { title: '猜数字暗号 · 四位密码，一场智力对决', imageUrl: 'logo.png' };
  };
  constructor(private wx: any, private room: () => Invitation | undefined, private incoming: (value: Invitation) => void) {}
  start() {
    if (!this.wx) return;
    this.wx.showShareMenu?.({ menus: ['shareAppMessage'] });
    this.wx.onShareAppMessage?.(this.onShare);this.wx.onShow?.(this.onShow);
    this.receive(this.wx.getLaunchOptionsSync?.()?.query);
  }
  private receive(query: unknown) {
    const value=invitation(query);if(!value)return;
    const key=value.roomId+':'+value.code;if(key===this.lastInvitation)return;
    this.lastInvitation=key;this.incoming(value);
  }
  allowInvitationAgain() { this.lastInvitation = ''; }
  share() {
    if(!this.wx?.shareAppMessage)throw Error('请在微信中邀请好友，也可以复制口令');
    if(!this.room())throw Error('房间已变化，请重新创建邀请');
    // WeChat provides no reliable share-success signal. Never display a fake success or grant rewards.
    this.wx.shareAppMessage(this.onShare());
  }
  privacy(): Promise<void> {
    return new Promise((resolve,reject)=>{
      if(!this.wx?.requirePrivacyAuthorize){resolve();return;}
      this.wx.requirePrivacyAuthorize({success:()=>resolve(),fail:()=>reject(Error('未获得隐私授权，仍可使用默认资料'))});
    });
  }
  openPrivacy() {
    if(!this.wx?.openPrivacyContract)throw Error('请在新版微信中查看隐私保护指引');
    this.wx.openPrivacyContract({fail:()=>this.wx.showToast?.({title:'隐私指引暂不可用，请稍后重试',icon:'none'})});
  }
  async authorize(rect: {left:number;top:number;width:number;height:number}, done: (value: ReturnType<typeof wechatProfile>, message?: string)=>void) {
    this.clearButton();const generation=this.generation;
    if(!this.wx?.createUserInfoButton)throw Error('请在新版微信中获取头像昵称，或手动设置资料');
    await this.privacy();if(!this.alive||generation!==this.generation)return;
    const button=this.wx.createUserInfoButton({type:'text',text:'',style:{...rect,backgroundColor:'rgba(0,0,0,0)',borderWidth:0},withCredentials:false,lang:'zh_CN'});
    if(!button)throw Error('暂时无法创建授权按钮，请使用默认资料');
    this.button=button;
    button.onTap((result:any)=>{
      if(!this.alive||this.button!==button)return;
      this.clearButton();const profile=wechatProfile(result?.userInfo);
      done(profile,profile?undefined:'未获取到微信资料，保留当前昵称和头像');
    });button.show?.();
  }
  clearButton() {this.generation++;this.button?.destroy();this.button=undefined;}
  destroy(){this.alive=false;this.clearButton();this.wx?.offShow?.(this.onShow);this.wx?.offShareAppMessage?.(this.onShare);}
}
