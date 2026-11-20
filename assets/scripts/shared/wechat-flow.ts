import type { ShareImage } from './protocol';

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
// Count emoji modifiers, joined emoji and combining marks with their base on both runtimes.
const nicknameUnit = /\p{Regional_Indicator}{2}|[^\p{C}\p{Z}\p{M}](?:[\p{M}\p{Emoji_Modifier}]|\u200d\p{Extended_Pictographic})*| /gu;
export function nicknameError(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return '请填写昵称';
  const name = value.trim();
  const units = name.match(nicknameUnit);
  if (!units || units.join('') !== name || !/[^\p{Default_Ignorable_Code_Point}\p{Z}]/u.test(name))
    return '昵称含换行或不可见字符，请修改后保存';
  if (units.length > 12) return '昵称最多 12 个字符，请缩短后保存';
}
export function wechatProfile(value: any): { name?: string; avatarUrl?: string } | undefined {
  const name = typeof value?.nickName === 'string' ? value.nickName.trim() : '';
  const url = avatarUrl(value?.avatarUrl);
  const nickname = name && name !== '微信用户' ? name : undefined;
  if (!nickname && !url) return;
  return { name: nickname, avatarUrl: url };
}

export class WechatFlow {
  private button: any;
  private alive = true;
  private generation = 0;
  private images: ShareImage[] = [];
  private sharingEnabled = false;
  private lastInvitation = '';
  private onShow = (options: any) => this.receive(options?.query);
  private onShare = () => {
    if (!this.sharingEnabled) return;
    const room = this.room();
    return room ? { title: '来猜我的暗号，房间口令 ' + room.code, query: `code=${room.code}&roomId=${encodeURIComponent(room.roomId)}`, ...this.images[0] }
      : { title: '你藏数字我来猜，看谁先破译暗号', ...this.images[Math.floor(Math.random() * this.images.length)] };
  };
  constructor(private wx: any, private room: () => Invitation | undefined, private incoming: (value: Invitation) => void) {}
  start() {
    if (!this.wx) return;
    this.wx.hideShareMenu?.({ menus: ['shareAppMessage', 'shareTimeline'] });
    this.wx.onShow?.(this.onShow);
    this.receive(this.wx.getLaunchOptionsSync?.()?.query);
  }
  setSharingEnabled(enabled: boolean, images: ShareImage[] = []) {
    this.images = images;
    if (!this.wx || this.sharingEnabled === enabled) return;
    this.sharingEnabled = enabled;
    if (enabled) {
      this.wx.onShareAppMessage?.(this.onShare);
      this.wx.showShareMenu?.({ menus: ['shareAppMessage'] });
    } else {
      this.wx.hideShareMenu?.({ menus: ['shareAppMessage', 'shareTimeline'] });
      this.wx.offShareAppMessage?.(this.onShare);
      this.lastInvitation = '';
    }
  }
  private receive(query: unknown) {
    const value=invitation(query);if(!value)return;
    const key=value.roomId+':'+value.code;if(key===this.lastInvitation)return;
    this.lastInvitation=key;this.incoming(value);
  }
  allowInvitationAgain() { this.lastInvitation = ''; }
  share() {
    if (!this.sharingEnabled) throw Error('微信分享暂未开放，可复制房间口令');
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
    await this.privacy();if(!this.alive||generation!==this.generation)return;
    if (this.wx?.getSetting && this.wx.getUserInfo) {
      const granted = await new Promise<boolean>(resolve => this.wx.getSetting({
        success: (settings: any) => resolve(settings.authSetting?.['scope.userInfo'] === true),
        fail: () => resolve(false),
      }));
      if (!this.alive || generation !== this.generation) return;
      if (granted) {
        const profile = await new Promise<ReturnType<typeof wechatProfile>>(resolve => this.wx.getUserInfo({
          withCredentials: false, lang: 'zh_CN',
          success: (result: any) => resolve(wechatProfile(result.userInfo)),
          fail: () => resolve(undefined),
        }));
        if (this.alive && generation === this.generation) done(profile, profile ? undefined : '未获取到微信资料，可重试或手动填写');
        return;
      }
    }
    if(!this.wx?.createUserInfoButton)throw Error('请在新版微信中获取头像昵称，或手动设置资料');
    const button=this.wx.createUserInfoButton({type:'text',text:'',style:{...rect,backgroundColor:'rgba(0,0,0,0)',borderWidth:0},withCredentials:false,lang:'zh_CN'});
    if(!button)throw Error('暂时无法创建授权按钮，请使用默认资料');
    this.button=button;
    button.onTap((result:any)=>{
      if(!this.alive||this.button!==button)return;
      this.clearButton();const profile=wechatProfile(result?.userInfo);
      done(profile,profile?undefined:'未获取到微信资料，保留当前昵称和头像');
    });button.show?.();
    this.wx.showToast?.({ title: '请点头像昵称按钮授权', icon: 'none' });
  }
  clearButton() {this.generation++;this.button?.destroy();this.button=undefined;}
  destroy(){this.alive=false;this.clearButton();this.wx?.offShow?.(this.onShow);this.wx?.offShareAppMessage?.(this.onShare);}
}
