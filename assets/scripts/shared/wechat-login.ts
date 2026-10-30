interface LoginResult { code?: string }
interface LoginFailure { errMsg?: string }
interface WechatLoginApi {
  login(options: { timeout: number; success: (result: LoginResult) => void; fail: (error: LoginFailure) => void }): void;
  getDeviceInfo?: () => { platform?: string };
  getSystemInfoSync?: () => { platform?: string };
}

/** Translate platform failures without exposing credentials or raw SDK responses. */
export function wechatLoginMessage(error: LoginFailure, devtools: boolean): string {
  const message = error?.errMsg ?? '';
  if (/INVALID_TOKEN|invalid credential|access_token.*invalid/i.test(message)) {
    return devtools ? '开发者工具登录已失效，请重新扫码登录后编译' : '微信登录凭据失效，请退出小游戏后重新进入';
  }
  if (/appid|app_id|无权限|permission|unauthorized/i.test(message)) return '微信登录无权限，请检查 AppID 和开发者权限';
  if (/timeout|timed out|超时/i.test(message)) return '微信登录超时，请检查网络后重试';
  if (/network|网络|connect/i.test(message)) return '微信登录网络异常，请检查网络后重试';
  return '微信登录未完成，请稍后重试';
}

export function getWechatLoginCode(wx: WechatLoginApi, timeoutMs = 10000): Promise<string> {
  let devtools = false;
  try { devtools = (wx.getDeviceInfo?.() ?? wx.getSystemInfoSync?.())?.platform === 'devtools'; } catch { /* Platform detection is optional. */ }
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (code?: string, message?: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (code) resolve(code); else reject(Error(message));
    };
    const timer = setTimeout(() => finish(undefined, '微信登录超时，请检查网络后重试'), timeoutMs);
    const fail = (error: LoginFailure) => finish(undefined, wechatLoginMessage(error, devtools));
    try {
      wx.login({ timeout: timeoutMs,
        success: result => {
          const code = typeof result?.code === 'string' ? result.code.trim() : '';
          finish(code, '微信未返回登录凭据，请重新进入小游戏');
        }, fail });
    } catch { fail({}); }
  });
}
