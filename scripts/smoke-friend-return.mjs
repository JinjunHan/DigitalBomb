// Creates two disposable preview accounts; prints no session credentials.
import WebSocket from 'ws';
import assert from 'node:assert/strict';
const base = process.argv[2] ?? 'https://bomb.aiforevery.cn';
const clients=[];
const until=async(fn)=>{const deadline=Date.now()+8000;while(!fn()){if(Date.now()>deadline)throw Error('state timeout');await new Promise(r=>setTimeout(r,30));}};
async function client(){
 const response=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,200);
 const auth=await response.json();const ws=new WebSocket(base.replace(/^http/,'ws')+'/ws');const c={ws,state:null,auth,errors:[]};clients.push(c);
 ws.on('message',raw=>{const m=JSON.parse(String(raw));if(m.type==='state')c.state=m.state;if(m.type==='error')c.errors.push(m.message);});
 await new Promise((resolve,reject)=>{ws.on('open',resolve);ws.on('error',reject);});ws.send(JSON.stringify({action:'auth',token:auth.token}));await until(()=>c.state);
 c.send=(action,payload={})=>ws.send(JSON.stringify({id:crypto.randomUUID(),action,payload:{roomId:c.state.room?.id,...payload}}));return c;
}
try {
 const a=await client(), b=await client();a.send('create');await until(()=>a.state.room?.code);b.send('join',{code:a.state.room.code});await until(()=>a.state.room?.phase==='preparing'&&b.state.room?.phase==='preparing');
 a.send('lock',{digits:'1122'});b.send('lock',{digits:'0123'});await until(()=>a.state.room?.phase==='playing'&&b.state.room?.phase==='playing');
 assert.equal(a.state.room.revealed,undefined);const first=a.state.room.current===a.auth.me.id?a:b,second=first===a?b:a;
 await new Promise(r=>setTimeout(r,Math.max(0,a.state.room.startAt-Date.now()+100)));
 first.send('guess',{digits:first===a?'0123':'1122',turn:0});await until(()=>second.state.room?.phase==='reply');second.send('guess',{digits:second===a?'0123':'1122',turn:1});await until(()=>a.state.room?.phase==='finished');assert.equal(a.state.room.result.reason,'same_round');
 await until(()=>b.state.room?.phase==='finished');
 const oldId=a.state.room.id, code=a.state.room.code;
 a.send('rematch');await until(()=>a.errors.length>0);assert.equal(a.errors.pop(),'不支持的操作');
 b.send('returnToRoom');await until(()=>b.state.room?.phase==='waiting');
 assert.equal(b.state.room.code,code);assert.equal(a.state.room.id,oldId);assert.equal(a.state.room.phase,'finished');
 a.send('returnToRoom');await until(()=>a.state.room?.phase==='preparing'&&b.state.room?.phase==='preparing');
 assert.equal(a.state.room.id,b.state.room.id);assert.equal(a.state.room.players[0].id,a.auth.me.id);
 assert.equal(a.state.room.code,code);assert.equal(a.state.room.history.length,0);assert.equal(a.state.room.ownSecret,undefined);
 b.send('leave');await until(()=>!b.state.room);a.send('leave');await until(()=>!a.state.room);
 assert.deepEqual(a.errors,[]);assert.deepEqual(b.errors,[]);
 console.log('PASS HTTPS/WSS, complete draw, rematch rejected, independent return, retained code/host, cleared secrets, cleanup');
} finally {for(const c of clients)c.ws.close();}
