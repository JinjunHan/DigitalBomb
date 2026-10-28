export const MODAL_MOTION = {
  settings: { duration: .38, exit: .25, x: 0, y: -78, scale: .96, angle: -.8, stagger: .024 },
  rules: { duration: .48, exit: .32, x: 155, y: -26, scale: 1, angle: -3, stagger: .07 },
  menu: { duration: .24, exit: .18, x: 0, y: -34, scale: .91, angle: 0, stagger: .035 },
  live: { duration: .36, exit: .25, x: 155, y: 0, scale: 1, angle: 0, stagger: .045 },
  result: { duration: .44, exit: .30, x: -108, y: -24, scale: .98, angle: 1.3, stagger: .055 },
  lock: { duration: .32, exit: .22, x: 0, y: 34, scale: 1.045, angle: 0, stagger: .035 },
  repeat: { duration: .36, exit: .22, x: -18, y: 0, scale: .98, angle: 0, stagger: .025 },
  leave: { duration: .36, exit: .26, x: -65, y: -24, scale: .98, angle: 1.4, stagger: .045 },
  close: { duration: .40, exit: .28, x: 0, y: -65, scale: .97, angle: -.8, stagger: .045 },
  resign: { duration: .30, exit: .24, x: 0, y: -20, scale: .95, angle: 0, stagger: .055 },
  reconnect: { duration: .22, exit: .20, x: 0, y: 0, scale: .985, angle: 0, stagger: 0 },
} as const;
export type ModalKind = keyof typeof MODAL_MOTION;
export interface ModalPose { x: number; y: number; scale: number; angle: number; opacity: number }
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - Math.pow(1 - clamp(v), 3);
export function modalPose(kind: ModalKind, elapsed: number): ModalPose {
  const spec = MODAL_MOTION[kind], t = clamp(elapsed / spec.duration), p = ease(t);
  const shake = kind === 'repeat' ? Math.sin(t * Math.PI * 4) * 9 * Math.sin(t * Math.PI) * (1 - t) : 0;
  return { x: spec.x * (1 - p) + shake, y: spec.y * (1 - p), scale: spec.scale + (1 - spec.scale) * p,
    angle: spec.angle * (1 - p), opacity: ease(t / .65) };
}
/** Exit starts at the current sampled pose, so interrupting an entrance never jumps. */
export function modalExitPose(kind: ModalKind, elapsed: number, from: ModalPose): ModalPose {
  const spec = MODAL_MOTION[kind], p = clamp(elapsed / spec.exit), e = p * p;
  return { x: from.x + (spec.x - from.x) * e, y: from.y + (spec.y - from.y) * e,
    scale: from.scale + (spec.scale - from.scale) * e, angle: from.angle + (spec.angle - from.angle) * e,
    opacity: from.opacity * (1 - p * p * (3 - 2 * p)) };
}
export function modalDetail(kind: ModalKind, elapsed: number, index: number) {
  const spec = MODAL_MOTION[kind];
  // Bounded stagger always finishes with the panel, including four setting switches/digits.
  const delay = Math.min(spec.duration * .45, spec.stagger * (index + 1));
  const p = ease((elapsed - delay) / (spec.duration - delay));
  return { opacity: p, y: (kind === 'lock' ? 10 : kind === 'reconnect' ? 0 : -12) * (1 - p) };
}
