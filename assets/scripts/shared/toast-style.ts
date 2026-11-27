export type ToastTone = 'success' | 'info' | 'error';

export interface ToastStyleSpec {
  tone: ToastTone;
  badgeColor: string;
  badgeSymbol: string;
  borderColor: string;
  textColor: string;
  durationMs: number;
  width: number;
  height: number;
}

const ERROR_RE = /失败|超时|错误|异常|冲突|不可|不能|无效|不足|满员|关闭|断开|另一窗口|尚未支持|无法|请先|请输入|请检查|为空|超过|重复/;
const SUCCESS_RE = /复制|已恢复|已.*填入|已保留|已锁定|已保存|成功|完成/;

/** Classify a transient toast message into a clear visual semantic tone. */
export function classifyToast(text: string): ToastTone {
  if (ERROR_RE.test(text)) return 'error';
  if (SUCCESS_RE.test(text)) return 'success';
  return 'info';
}

/** Estimate display width (in 750-wide design pixels) for a compact single- or two-line toast capsule. */
export function toastDimensions(text: string): { width: number; height: number } {
  let units = 0;
  for (const ch of Array.from(text)) {
    units += /[\u0020-\u007e]/.test(ch) ? 0.56 : 1.0;
  }
  const singleW = Math.round(92 + units * 23);
  if (singleW <= 590) {
    return { width: Math.max(246, singleW), height: 54 };
  }
  return { width: 590, height: 76 };
}

export function toastSpec(text: string, forcedTone?: ToastTone): ToastStyleSpec {
  const tone = forcedTone ?? classifyToast(text);
  const { width, height } = toastDimensions(text);
  if (tone === 'success') {
    return {
      tone,
      badgeColor: '#2D9B60',
      badgeSymbol: '✓',
      borderColor: '#D6AC60',
      textColor: '#FAF0D6',
      durationMs: 2400,
      width,
      height,
    };
  }
  if (tone === 'error') {
    return {
      tone,
      badgeColor: '#C93E28',
      badgeSymbol: '!',
      borderColor: '#DF7F5B',
      textColor: '#FFF0E6',
      durationMs: 3800,
      width,
      height,
    };
  }
  return {
    tone,
    badgeColor: '#D4952E',
    badgeSymbol: 'i',
    borderColor: '#C89B54',
    textColor: '#F7E7C8',
    durationMs: 2800,
    width,
    height,
  };
}
