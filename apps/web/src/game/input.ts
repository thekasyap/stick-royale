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
  private stickOrigin: { x: number; y: number } | null = null;
  private stickTouchId: number | null = null;
  private fireTouchId: number | null = null;

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
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width) * rect.width;
      this.mouseY = ((e.clientY - rect.top) / rect.height) * rect.height;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouseRight = true;
    });
    canvas.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRight = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      this.wheelDelta += e.deltaY;
    }, { passive: true });

    canvas.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener("touchend", (e) => this.onTouchEnd(e));
    canvas.addEventListener("touchcancel", (e) => this.onTouchEnd(e));
  }

  private onTouchStart(e: TouchEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    for (const t of Array.from(e.changedTouches)) {
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      if (x < rect.width * 0.45 && this.stickTouchId === null) {
        this.stickTouchId = t.identifier;
        this.stickOrigin = { x, y };
        e.preventDefault();
      } else if (x > rect.width * 0.55 && this.fireTouchId === null) {
        this.fireTouchId = t.identifier;
        this.touchFire = true;
        this.mouseDown = true;
        this.mouseX = x;
        this.mouseY = y;
        e.preventDefault();
      } else if (x > rect.width * 0.55 && y > rect.height * 0.55) {
        this.touchInteract = true;
        this.justPressed.add("f");
      }
    }
  }

  private onTouchMove(e: TouchEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    for (const t of Array.from(e.changedTouches)) {
      const x = t.clientX - rect.left;
      const y = t.clientY - rect.top;
      if (t.identifier === this.fireTouchId) {
        this.mouseX = x;
        this.mouseY = y;
        e.preventDefault();
      }
      if (t.identifier === this.stickTouchId && this.stickOrigin) {
        const dx = x - this.stickOrigin.x;
        const dy = y - this.stickOrigin.y;
        const len = Math.hypot(dx, dy) || 1;
        const max = 48;
        const scale = Math.min(1, max / len);
        this.touchMove = { x: (dx / len) * scale, y: (dy / len) * scale };
        e.preventDefault();
      }
    }
  }

  private onTouchEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === this.stickTouchId) {
        this.stickTouchId = null;
        this.stickOrigin = null;
        this.touchMove = { x: 0, y: 0 };
      }
      if (t.identifier === this.fireTouchId) {
        this.fireTouchId = null;
        this.touchFire = false;
        this.mouseDown = false;
      }
    }
    this.touchInteract = false;
  }

  endFrame(): void {
    this.justPressed.clear();
    this.wheelDelta = 0;
    this.touchInteract = false;
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
