import {test} from 'node:test';
import assert from 'node:assert/strict';
import {WechatFlow,invitation,avatarUrl,wechatProfile} from '../assets/scripts/shared/wechat-flow';
import {Service} from '../server/service';
const url='https://thirdwx.qlogo.cn/mmopen/vi_32/abc/132';
test('invite parsing preserves zeroes and rejects untrusted shape; only official avatar hosts',()=>{
 assert.deepEqual(invitation({code:'0012',roomId:'room-1'}),{code:'0012',roomId:'room-1'});
 for(const q of [{code:12,roomId:'r'},{code:'0012'},{code:'0012',roomId:'<script>'}])assert.equal(invitation(q),undefined);
 assert.equal(avatarUrl(url),url);
 for(const u of ['http://thirdwx.qlogo.cn/a','https://thirdwx.qlogo.cn.evil.test/a','https://thirdwx.qlogo.cn@evil.test/a','file:///a'])assert.equal(avatarUrl(u),undefined);
 assert.equal(wechatProfile({nickName:'微信用户',avatarUrl:url}),undefined);
});
test('cold and warm invitations dedupe; share has room identity; lifecycle unregisters',()=>{
 let show:any,share:any;const received:any[]=[];let payload:any;
 const wx={getLaunchOptionsSync:()=>({query:{code:'0012',roomId:'r'}}),onShow:(f:any)=>show=f,onShareAppMessage:(f:any)=>share=f,offShow:(f:any)=>assert.equal(f,show),offShareAppMessage:(f:any)=>assert.equal(f,share),shareAppMessage:(p:any)=>payload=p};
 const f=new WechatFlow(wx,()=>({code:'0012',roomId:'r'}),x=>received.push(x));f.start();show({query:{code:'0012',roomId:'r'}});assert.equal(received.length,1);show({query:{code:'0099',roomId:'next'}});assert.equal(received.length,2);f.share();assert.equal(payload.query,'code=0012&roomId=r');f.destroy();
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
 assert.throws(()=>s.perform(b,'join',{code:room.code,inviteRoomId:'old-room'}),/邀请已过期/);assert.equal(room.seats.length,1);
 s.perform(b,'join',{code:room.code,inviteRoomId:room.id});assert.equal(room.seats.length,2);
});
