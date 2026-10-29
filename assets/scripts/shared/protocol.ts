export type Phase = 'waiting' | 'preparing' | 'playing' | 'reply' | 'finished' | 'cancelled';
export interface Profile { id: string; name: string; avatar: number; avatarUrl?: string }
export interface Guess { playerId: string; turn: number; digits: string | null; hits: number | null }
export interface Result { winner: string | null; reason: string }
export interface RoomView {
  id: string; mode: 'public' | 'friend'; code?: string; phase: Phase;
  players: (Profile & { ready: boolean; online: boolean })[];
  version: number; round: number; turn: number; current: string; first: string;
  deadline: number; startAt: number; history: Guess[]; ownSecret?: string;
  revealed?: Record<string, string>; result?: Result; rematch: string[];
}
export interface Snapshot {
  me: Profile; room: RoomView | null; queuedAt: number | null;
  serverNow: number; notice?: string;
}
export interface Command { id: string; action: string; payload?: Record<string, unknown> }
export interface ServerMessage { type: 'state' | 'ack' | 'error'; state?: Snapshot; id?: string; message?: string }
export const AVATARS = ['茶', '猫', '鹿', '月', '星', '森', '橙', '海'];
