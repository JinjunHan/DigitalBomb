import { clueCaption, STANDARD_ROUNDS } from './deduction';
import type { RoomView } from './protocol';
export interface FeedbackEvent { kind: 'own' | 'opponent' | 'timeout' | 'end'; hits?: number; title: string; caption: string; art: string; urgent?: boolean }
/** Pure snapshot transition: never replay history on initial load, room change or reconnect. */
export function feedbackEvent(room: RoomView, me: string, previous: { roomId: string; phase: string; guesses: number }, suppress = false): FeedbackEvent | undefined {
  if (suppress || room.id !== previous.roomId) return;
  if (room.phase === 'finished' || room.phase === 'cancelled') {
    if (room.phase === previous.phase || room.phase === 'cancelled') return;
    const win = room.result?.winner === me, draw = !room.result?.winner;
    return { kind: 'end', title: draw ? '旗鼓相当' : win ? '胜利' : '再接再厉', caption: '', art: 'end-' + (draw ? room.result?.reason === 'round_limit' ? 3 : 2 : win ? 0 : 1) };
  }
  const fresh = room.history.length > previous.guesses ? room.history[room.history.length - 1] : undefined;
  if (!fresh) return;
  const own = fresh.playerId === me;
  if (fresh.hits === null) return { kind: 'timeout', title: '', caption: '', art: own ? 'timeout-0' : 'timeout-1' };
  const hits = fresh.hits, size = room.digitCount ?? 4;
  if (own) return { kind: 'own', hits, title: hits === size ? '全部命中' : '我的猜测', caption: hits === size ? '等待对手本轮补猜' : clueCaption(fresh), art: hits === size ? 'own-gold' : 'own' };
  return { kind: 'opponent', hits, title: '', caption: '', art: 'opponent-' + (hits === size ? 4 : hits), urgent: hits >= size - 1 };
}
export function cancellationArt(reason?: string) {
  return 'cancel-' + ({ prepare_timeout: 0, room_expired: 1, player_left: 2, both_offline: 3 }[reason ?? ''] ?? 2);
}
export function resultCaption(room: RoomView, me: string): string {
  const ownLoss = !!room.result?.winner && room.result.winner !== me;
  switch (room.result?.reason) {
    case 'timeout': return ownLoss ? '你连续两次行动超时' : '对手连续两次行动超时';
    case 'reply_timeout': return ownLoss ? '你未在时限内完成补猜' : '对手补猜超时';
    case 'disconnect': return ownLoss ? '你未能及时重新连接' : '对手未能及时重新连接';
    case 'resigned': return ownLoss ? '你已认输' : '对手已认输';
    case 'same_round': return '同轮破解，默契十足';
    case 'round_limit': return `${room.roundLimit ?? STANDARD_ROUNDS}轮结束，本局平局`;
    case 'reply_missed': return ownLoss ? '本轮补猜未命中' : '对手补猜未命中';
    default: return ownLoss ? '对手破解了你的暗号' : `${room.digitCount ?? 4} 位密码全部破解`;
  }
}
