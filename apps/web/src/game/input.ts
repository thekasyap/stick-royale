export class Input {
  keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mouseRight = false;
  wheelDelta = 0;
  private justPressed = new Set<string>();
  touchMove = { x: 0, y: 0 };
  touchFire = false;
  touchInteract = false;
  /** Visible joystick state for HUD overlay */
  stickVisible = false;
  stickBase = { x: 0, y: 0 };
  stickKnob = { x: 0, y: 0 };
  fireBtnActive = false;
  private stickOrigin: { x: number; y: number } | null = null;
  private stickPointerId: number | null = null;
  private aimPointerId: number | null = null;
  private usingTouch = false;

  constructor(private canvas: HTMLCanvasElement) {
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

    // Pointer Events unify mouse + touch; we gate touch zones for mobile layout
    canvas.addEventListener("pointerdown", (e) => this.onPointerDown(e));
    canvas.addEventListener("pointermove", (e) => this.onPointerMove(e));
    canvas.addEventListener("pointerup", (e) => this.onPointerUp(e));
    canvas.addEventListener("pointercancel", (e) => this.onPointerUp(e));
  }

  get isTouchLayout(): boolean {
    return this.usingTouch || matchMedia("(pointer: coarse)").matches;
  }

  private localPos(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const isTouch = e.pointerType === "touch" || e.pointerType === "pen";
    if (isTouch) this.usingTouch = true;

    const { x, y } = this.localPos(e);
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width;

    if (!isTouch) {
      // Desktop mouse already handled via mouse listeners
      return;
    }

    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }

    // Left half: virtual stick. Right half: aim (FIRE is the HTML button).
    if (x < w * 0.45 && this.stickPointerId === null) {
      this.stickPointerId = e.pointerId;
      this.stickOrigin = { x, y };
      this.stickBase = { x, y };
      this.stickKnob = { x, y };
      this.stickVisible = true;
      this.touchMove = { x: 0, y: 0 };
      return;
    }

    if (x > w * 0.5 && this.aimPointerId === null) {
      this.aimPointerId = e.pointerId;
      this.mouseX = x;
      this.mouseY = y;
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const { x, y } = this.localPos(e);

    if (e.pointerId === this.aimPointerId) {
      this.mouseX = x;
      this.mouseY = y;
      e.preventDefault();
      return;
    }

    if (e.pointerId === this.stickPointerId && this.stickOrigin) {
      const dx = x - this.stickOrigin.x;
      const dy = y - this.stickOrigin.y;
      const len = Math.hypot(dx, dy) || 1;
      const max = 56;
      const mag = Math.min(1, len / max);
      const kx = this.stickOrigin.x + (dx / len) * mag * max;
      const ky = this.stickOrigin.y + (dy / len) * mag * max;
      this.stickKnob = { x: kx, y: ky };
      this.touchMove = { x: (dx / len) * mag, y: (dy / len) * mag };
      e.preventDefault();
    }
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId === this.stickPointerId) {
      this.stickPointerId = null;
      this.stickOrigin = null;
      this.touchMove = { x: 0, y: 0 };
      this.stickVisible = false;
    }
    if (e.pointerId === this.aimPointerId) {
      this.aimPointerId = null;
    }
    this.touchInteract = false;
  }

  endFrame(): void {
    this.justPressed.clear();
    this.wheelDelta = 0;
    this.touchInteract = false;
  }

  /** Mobile HUD buttons */
  injectPress(key: string): void {
    const k = key.toLowerCase();
    if (!this.keys.has(k)) this.justPressed.add(k);
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
