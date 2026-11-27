import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyToast, toastSpec } from '../assets/scripts/shared/toast-style';

test('classifyToast distinguishes success, info, and error messages cleanly', () => {
  assert.equal(classifyToast('口令已复制：3816'), 'success');
  assert.equal(classifyToast('连接已恢复'), 'success');
  assert.equal(classifyToast('已从推理笔记填入，可直接提交或微调'), 'success');
  assert.equal(classifyToast('已保留所选位并补齐兼容候选，点数字槽可单改'), 'success');

  assert.equal(classifyToast('轮到你时可填入或修改猜测'), 'info');
  assert.equal(classifyToast('林间晚风'), 'info');

  assert.equal(classifyToast('确认超时，请查看同步后的状态'), 'error');
  assert.equal(classifyToast('请输入完整的四位房间口令'), 'error');
  assert.equal(classifyToast('已填入当前组合（提示：与部分历史线索冲突，可点槽位微调）'), 'error');
  assert.equal(classifyToast('网络请求失败'), 'error');
});

test('toastSpec adapts capsule width, height, and duration cleanly by tone and text length', () => {
  const shortOk = toastSpec('连接已恢复');
  assert.equal(shortOk.tone, 'success');
  assert.equal(shortOk.badgeSymbol, '✓');
  assert.equal(shortOk.durationMs, 2400);
  assert.equal(shortOk.height, 54);
  assert.ok(shortOk.width >= 246 && shortOk.width < 360);

  const midOk = toastSpec('已保留所选位并补齐兼容候选，点数字槽可单改');
  assert.equal(midOk.tone, 'success');
  assert.equal(midOk.height, 54);
  assert.ok(midOk.width <= 590);

  const longErr = toastSpec('已填入当前组合（提示：与部分历史线索冲突，可点槽位微调）');
  assert.equal(longErr.tone, 'error');
  assert.equal(longErr.badgeSymbol, '!');
  assert.equal(longErr.durationMs, 3800);
  assert.equal(longErr.height, 76);
  assert.equal(longErr.width, 590);
});
