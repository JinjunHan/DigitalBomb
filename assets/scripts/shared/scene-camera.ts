export type SceneView = 'lobby' | 'friend' | 'matching' | 'game';
export interface ScenePose { zoom: number; lift: number; pan: number }
export const SCENE_VIEWS: Record<SceneView, ScenePose> = {
  lobby: { zoom: 0, lift: 0, pan: 0 },
  friend: { zoom: -.28, lift: -.045, pan: -.012 },
  matching: { zoom: 1.8, lift: .12, pan: .014 },
  game: { zoom: 1, lift: .065, pan: 0 },
};
/** Retarget from the current pose; ordinary UI refreshes never restart the move. */
export class SceneCamera {
  pose = { ...SCENE_VIEWS.lobby };
  private from = { ...this.pose };
  private target: SceneView = 'lobby';
  private elapsed = 1;
  setView(view: SceneView, animate: boolean) {
    if (!animate) { this.target = view; this.pose = { ...SCENE_VIEWS[view] }; this.elapsed = 1; return; }
    if (view === this.target) return;
    this.target = view; this.from = { ...this.pose }; this.elapsed = 0;
  }
  step(dt: number) {
    this.elapsed = Math.min(1, this.elapsed + Math.max(0, Math.min(dt, .05)) / .9);
    const t = this.elapsed, ease = t * t * (3 - 2 * t), to = SCENE_VIEWS[this.target];
    if (t === 1) { this.pose = { ...to }; return; }
    this.pose = { zoom: this.from.zoom + (to.zoom - this.from.zoom) * ease,
      lift: this.from.lift + (to.lift - this.from.lift) * ease,
      pan: this.from.pan + (to.pan - this.from.pan) * ease };
  }
}
