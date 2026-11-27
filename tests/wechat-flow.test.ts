import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cachedSharingConfig,WechatFlow,invitation,avatarUrl,wechatProfile,nicknameError} from '../assets/scripts/shared/wechat-flow';
import {Service} from '../server/service';
const url='https://thirdwx.qlogo.cn/mmopen/vi_32/abc/132';
test('invite parsing preserves zeroes and rejects untrusted shape; only official avatar hosts',()=>{
 assert.deepEqual(invitation({code:'0012',roomId:'room-1'}),{code:'0012',roomId:'room-1'});
 for(const q of [{code:12,roomId:'r'},{code:'0012'},{code:'0012',roomId:'<script>'}])assert.equal(invitation(q),undefined);
 assert.equal(avatarUrl(url),url);
 for(const u of ['http://thirdwx.qlogo.cn/a','https://thirdwx.qlogo.cn.evil.test/a','https://thirdwx.qlogo.cn@evil.test/a','file:///a'])assert.equal(avatarUrl(u),undefined);
 assert.deepEqual(wechatProfile({nickName:'微信用户',avatarUrl:url}),{name:undefined,avatarUrl:url});
 assert.equal(wechatProfile({nickName:'微信用户'}),undefined);
});
test('cold and warm invitations dedupe; share has room identity; lifecycle unregisters',()=>{
 let show:any,share:any;const received:any[]=[];let payload:any;
 const wx={getLaunchOptionsSync:()=>({query:{code:'0012',roomId:'r'}}),onShow:(f:any)=>show=f,onShareAppMessage:(f:any)=>share=f,offShow:(f:any)=>assert.equal(f,show),offShareAppMessage:(f:any)=>assert.equal(f,share),shareAppMessage:(p:any)=>payload=p};
 const f=new WechatFlow(wx,()=>({code:'0012',roomId:'r'}),x=>received.push(x));f.start();assert.throws(()=>f.share(),/暂未开放/);f.setSharingEnabled(true);show({query:{code:'0012',roomId:'r'}});assert.equal(received.length,1);show({query:{code:'0099',roomId:'next'}});assert.equal(received.length,2);f.share();assert.equal(payload.query,'code=0012&roomId=r');
 assert.equal(payload.imageUrl,undefined);assert.match(payload.title,/0012/);
 const image={imageUrlId:'test-id',imageUrl:'https://mmocgame.qpic.cn/wechatgame/test/0'};
 f.setSharingEnabled(true,[image]);f.share();
 assert.equal(payload.imageUrlId,image.imageUrlId);assert.equal(payload.imageUrl,image.imageUrl);f.destroy();
});
test('authorization denial preserves data; delayed callback cannot survive screen departure',async()=>{
 let tap:any,privacy:any,destroyed=0,created=0;const values:any[]=[];
 const wx={requirePrivacyAuthorize:(p:any)=>privacy=p,createUserInfoButton:()=>{created++;return{onTap:(f:any)=>tap=f,destroy:()=>destroyed++};}};
 const f=new WechatFlow(wx,()=>undefined,()=>{});
 let pending=f.authorize({left:0,top:0,width:100,height:50},v=>values.push(v));privacy.fail();await assert.rejects(pending,/隐私授权/);assert.equal(created,0);
 pending=f.authorize({left:0,top:0,width:100,height:50},v=>values.push(v));f.clearButton();privacy.success();await pending;assert.equal(created,0);
 pending=f.authorize({left:0,top:0,width:100,height:50},v=>values.push(v));privacy.success();await pending;tap({errMsg:'deny'});assert.equal(values.length,1);assert.equal(values[0],undefined);assert.equal(destroyed,1);
 pending=f.authorize({left:0,top:0,width:100,height:50},v=>values.push(v));privacy.success();await pending;f.clearButton();tap({userInfo:{nickName:'测试玩家',avatarUrl:url}});assert.equal(values.length,1);
});
test('profile persists validated URL, clears to built-in; old room invitation cannot join recycled code',()=>{
 const s=new Service(()=>1000);const a=s.add({id:'a',name:'玩家甲',avatar:0},'a'),b=s.add({id:'b',name:'玩家乙',avatar:1},'b');let saved:any;s.saveProfile=p=>saved=p;
 s.perform(a,'profile',{name:'新名字',avatar:2,avatarUrl:url});assert.equal(saved.avatarUrl,url);
 assert.throws(()=>s.perform(a,'profile',{name:'新名字',avatar:2,avatarUrl:'https://evil.test/a'}),/头像地址/);
 s.perform(a,'profile',{name:'新名字',avatar:2,avatarUrl:''});assert.equal(saved.avatarUrl,undefined);
 s.perform(a,'create',{});const room=s.room(a)!;
 assert.throws(()=>s.perform(b,'join',{code:room.code,inviteRoomId:room.id}),/暂未开放/);
 s.wechatSharingEnabled=true;
 assert.throws(()=>s.perform(b,'join',{code:room.code,inviteRoomId:'old-room'}),/邀请已过期/);assert.equal(room.seats.length,1);
 s.perform(b,'join',{code:room.code,inviteRoomId:room.id});assert.equal(room.seats.length,2);
});

test('WeChat and manual profiles preserve names independently of the avatar', () => {
  assert.equal(wechatProfile({ nickName: ' 小羊🌟 ' })?.name, '小羊🌟');
  const service = new Service();
  const user = service.add({ id: 'profile', name: '旧昵称', avatar: 0 }, 'local');
  for (const name of ['韩', '🌟', '小羊·A！', '👩🏽‍💻'.repeat(12), '🇨🇳'.repeat(12), 'e\u0301'.repeat(12)]) {
    assert.equal(nicknameError(name), undefined);
    service.perform(user, 'profile', { name, avatar: 0 });
    assert.equal(user.profile.name, name);
  }
  for (const name of [' ', '🌟'.repeat(13), 'a\nb', 'a\u202eb', '\u200d']) {
    assert.ok(nicknameError(name));
    assert.throws(() => service.perform(user, 'profile', { name, avatar: 0 }));
  }
});

test('profile grant is checked on each tap; granted users read once, revoked users use the native button', async () => {
  let granted = true, reads = 0, buttons = 0;
  let tap!: (result: any) => void;
  const flow = new WechatFlow({
    requirePrivacyAuthorize: (request: any) => request.success(),
    getSetting: (request: any) => request.success({ authSetting: { 'scope.userInfo': granted } }),
    getUserInfo: (request: any) => {
      reads++;
      request.success({ userInfo: { nickName: '微信玩家', avatarUrl: url } });
    },
    createUserInfoButton: () => { buttons++; return { destroy() {}, onTap: (callback: typeof tap) => { tap = callback; } }; },
  }, () => undefined, () => {});
  const rect = { left: 0, top: 0, width: 100, height: 50 };
  const values: ReturnType<typeof wechatProfile>[] = [];
  await flow.authorize(rect, profile => values.push(profile));
  assert.equal(reads, 1);
  assert.equal(buttons, 0);
  assert.deepEqual(values[0], { name: '微信玩家', avatarUrl: url });
  granted = false;
  await flow.authorize(rect, profile => values.push(profile));
  assert.equal(reads, 1);
  assert.equal(buttons, 1);
  assert.equal(values.length, 1);
  tap({ userInfo: { nickName: '另一昵称', avatarUrl: url } });
  assert.equal(values[1]?.name, '另一昵称');
});

test('a delayed granted profile read cannot update a closed page', async () => {
  let started!: () => void, respond!: () => void;
  const reading = new Promise<void>(resolve => { started = resolve; });
  const flow = new WechatFlow({
    getSetting: (r: any) => r.success({ authSetting: { 'scope.userInfo': true } }),
    getUserInfo: (r: any) => { respond = () => r.success({ userInfo: { nickName: '迟到昵称' } }); started(); },
  }, () => undefined, () => {});
  const pending = flow.authorize({ left: 0, top: 0, width: 10, height: 10 }, () => assert.fail('stale result'));
  await reading;
  flow.clearButton();
  respond();
  await pending;
});

test('sharing cache is valid for one hour and rejects invalid or future entries', () => {
  const config = {enabled:true,images:[]};
  const entry = JSON.stringify({savedAt:1000,config});
  assert.deepEqual(cachedSharingConfig(entry, 3600999), config);
  assert.equal(cachedSharingConfig(entry, 3601000), undefined);
  assert.equal(cachedSharingConfig(entry, 999), undefined);
  assert.equal(cachedSharingConfig('invalid', 1000), undefined);
  assert.equal(cachedSharingConfig(JSON.stringify({savedAt:1000,config:{enabled:'true'}}), 1000), undefined);
});

test('shareCustom shares via WeChat only when sharing is enabled and returns false otherwise', () => {
  const shared: any[] = [];
  const flow = new WechatFlow({
    hideShareMenu() {},
    showShareMenu() {},
    onShow() {},
    onShareAppMessage() {},
    shareAppMessage(payload: any) { shared.push(payload); },
  }, () => undefined, () => {});
  assert.equal(flow.shareCustom('测试标题'), false);
  flow.setSharingEnabled(true, [{ imageUrlId: 'id-1', imageUrl: 'https://mmocgame.qpic.cn/wechatgame/demo.png' }]);
  assert.equal(flow.shareCustom('我用 4 步破译了今日暗号'), true);
  assert.equal(shared.length, 1);
  assert.equal(shared[0].title, '我用 4 步破译了今日暗号');
  assert.equal(shared[0].imageUrlId, 'id-1');
});
