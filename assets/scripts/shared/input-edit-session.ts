/** Keep a native input alive while keyboard-driven resize and async refreshes arrive. */
export class InputEditSession {
  active = false;
  private redraw = false;
  private resize = false;
  begin() { this.active = true; }
  deferRedraw() { if (!this.active) return false; this.redraw = true; return true; }
  deferResize() { if (!this.active) return false; this.resize = true; return true; }
  end() {
    const pending = { redraw: this.redraw, resize: this.resize };
    this.active = false; this.redraw = false; this.resize = false;
    return pending;
  }
}
