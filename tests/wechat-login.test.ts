import test from 'node:test';
import assert from 'node:assert/strict';
import { getWechatLoginCode, wechatLoginMessage } from '../assets/scripts/shared/wechat-login';

test('expired developer-tools credentials tell the user to sign in again without leaking SDK data', async () => {
  await assert.rejects(getWechatLoginCode({
    getDeviceInfo: () => ({ platform: 'devtools' }),
    login: ({ fail }) => fail({ errMsg: 'login:fail INVALID_TOKEN,invalid credential, access_token is invalid or not latest [private diagnostic]' }),
  }), { message: '开发者工具登录已失效，请重新扫码登录后编译' });
  assert.equal(wechatLoginMessage({ errMsg: 'INVALID_TOKEN' }, false), '微信登录凭据失效，请退出小游戏后重新进入');
});

test('successful login returns a code while empty codes and synchronous SDK failure reject', async () => {
  assert.equal(await getWechatLoginCode({ login: ({ success }) => success({ code: 'test-code' }) }), 'test-code');
  await assert.rejects(getWechatLoginCode({ login: ({ success }) => success({ code: '' }) }), /未返回登录凭据/);
  await assert.rejects(getWechatLoginCode({ login: () => { throw Error('private response'); } }), { message: '微信登录未完成，请稍后重试' });
});

test('login has a deadline even when the SDK never calls back, and ignores late completion', async () => {
  let complete!: (result: { code: string }) => void;
  const pending = getWechatLoginCode({ login: ({ success }) => { complete = success; } }, 5);
  await assert.rejects(pending, /微信登录超时/);
  complete({ code: 'late-code' });
  await assert.rejects(pending, /微信登录超时/);
});

test('network and app permission failures remain distinct', () => {
  assert.match(wechatLoginMessage({ errMsg: 'login:fail network error' }, false), /网络异常/);
  assert.match(wechatLoginMessage({ errMsg: 'login:fail invalid appid' }, true), /AppID/);
});
