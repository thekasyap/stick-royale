/**
 * Desktop: keyboard + mouse.
 * Mobile (PUBG-style twin-stick):
 *   Left stick  → move
 *   Right stick → aim (relative to player / screen center)
 *   FIRE        → shoot along aim
 *   JUMP / R    → action buttons
 *   autoLoot    → always on for touch
 */
export class Input {
  keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mouseRight = false;
  wheelDelta = 0;
  autoLoot = false;
  private justPressed = new Set<string>();
  touchMove = { x: 0, y: 0 };
  /** Aim stick −1..1; converted to mouse relative to screen center */
  aimStick = { x: 1, y: 0 };
  touchFire = false;
  fireBtnActive = false;

  stickVisible = false;
  stickBase = { x: 0, y: 0 };
  stickKnob = { x: 0, y: 0 };
  aimVisible = false;
  aimBase = { x: 0, y: 0 };
  aimKnob = { x: 0, y: 0 };

  private stickOrigin: { x: number; y: number } | null = null;
  private stickPointerId: number | null = null;
  private aimOrigin: { x: number; y: number } | null = null;
  private aimPointerId: number | null = null;
  private usingTouch = false;
  private viewW = 1280;
  private viewH = 720;

  constructor(private canvas: HTMLCanvasElement) {
    this.mouseX = this.viewW * 0.5 + 180;
    this.mouseY = this.viewH * 0.5;

    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      if (!this.keys.has(k)) this.justPressed.add(k);
      this.keys.add(k);
      if ([" ", "tab", "e", "f", "r", "g", "h", "v"].includes(k) || (k >= "1" && k <= "5")) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
    canvas.addEventListener("mousemove", (e) => {
      if (this.usingTouch) return;
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (this.usingTouch) return;
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouseRight = true;
    });
    canvas.addEventListener("mouseup", (e) => {
      if (this.usingTouch) return;
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRight = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      this.wheelDelta += e.deltaY;
    }, { passive: true });
  }

  setViewSize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    if (!this.usingTouch) return;
    this.applyAimToMouse();
  }

  enableTouchMode(): void {
    this.usingTouch = true;
    this.autoLoot = true;
    this.aimStick = { x: 1, y: 0 };
    this.applyAimToMouse();
  }

  get isTouchLayout(): boolean {
    return this.usingTouch;
  }

  /** Bind interactive stick pads (HTML overlays) — PUBG-style, not invisible canvas zones */
  bindStickPad(el: HTMLElement): void {
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.usingTouch = true;
      this.autoLoot = true;
      if (this.stickPointerId !== null) return;
      try { el.setPointerCapture(e.pointerId); } catch { /* */ }
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.stickPointerId = e.pointerId;
      this.stickOrigin = { x: rect.width / 2, y: rect.height / 2 };
      this.stickBase = { x: this.stickOrigin.x, y: this.stickOrigin.y };
      this.stickKnob = { x, y };
      this.stickVisible = true;
      this.updateStickVector(x, y, rect.width, rect.height);
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.stickPointerId || !this.stickOrigin) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.stickKnob = { x, y };
      this.updateStickVector(x, y, rect.width, rect.height);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickPointerId) return;
      this.stickPointerId = null;
      this.stickOrigin = null;
      this.touchMove = { x: 0, y: 0 };
      this.stickVisible = false;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  bindAimPad(el: HTMLElement): void {
    el.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      this.usingTouch = true;
      this.autoLoot = true;
      if (this.aimPointerId !== null) return;
      try { el.setPointerCapture(e.pointerId); } catch { /* */ }
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.aimPointerId = e.pointerId;
      this.aimOrigin = { x: rect.width / 2, y: rect.height / 2 };
      this.aimBase = { x: this.aimOrigin.x, y: this.aimOrigin.y };
      this.aimKnob = { x, y };
      this.aimVisible = true;
      this.updateAimVector(x, y, rect.width, rect.height);
    });
    el.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.aimPointerId || !this.aimOrigin) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      this.aimKnob = { x, y };
      this.updateAimVector(x, y, rect.width, rect.height);
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.aimPointerId) return;
      this.aimPointerId = null;
      this.aimOrigin = null;
      this.aimVisible = false;
      // Keep last aimStick so fire direction stays where you pointed
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  private updateStickVector(x: number, y: number, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const max = Math.min(w, h) * 0.38;
    const mag = Math.min(1, len / max);
    this.touchMove = { x: (dx / len) * mag, y: (dy / len) * mag };
  }

  private updateAimVector(x: number, y: number, w: number, h: number): void {
    const cx = w / 2;
    const cy = h / 2;
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const max = Math.min(w, h) * 0.38;
    const mag = Math.min(1, Math.max(0.35, len / max)); // deadzone floor so aim never zeros
    this.aimStick = { x: (dx / len) * mag, y: (dy / len) * mag };
    this.applyAimToMouse();
  }

  /** Map twin-stick aim → screen coords around player (camera center) */
  private applyAimToMouse(): void {
    const reach = Math.min(this.viewW, this.viewH) * 0.35;
    this.mouseX = this.viewW / 2 + this.aimStick.x * reach;
    this.mouseY = this.viewH / 2 + this.aimStick.y * reach;
  }

  endFrame(): void {
    this.justPressed.clear();
    this.wheelDelta = 0;
  }

  /** Always edge on tap — even if key was stuck down from a missed release */
  injectPress(key: string): void {
    const k = key.toLowerCase();
    this.justPressed.add(k);
    this.keys.add(k);
  }

  injectRelease(key: string): void {
    this.keys.delete(key.toLowerCase());
  }

  pressed(key: string): boolean {
    return this.justPressed.has(key.toLowerCase());
  }

  down(key: string): boolean {
    return this.keys.has(key.toLowerCase());
  }

  moveVector(): { x: number; y: number } {
    let x = 0;
    let y = 0;
    if (this.down("w") || this.down("arrowup")) y -= 1;
    if (this.down("s") || this.down("arrowdown")) y += 1;
    if (this.down("a") || this.down("arrowleft")) x -= 1;
    if (this.down("d") || this.down("arrowright")) x += 1;

    if (Math.abs(this.touchMove.x) > 0.05 || Math.abs(this.touchMove.y) > 0.05) {
      return { x: this.touchMove.x, y: this.touchMove.y };
    }

    const len = Math.hypot(x, y);
    if (len > 0) return { x: x / len, y: y / len };
    return { x: 0, y: 0 };
  }
}
