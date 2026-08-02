/**
 * Desktop: keyboard + mouse.
 * Mobile (Mini Militia): left move stick · right aim stick auto-fires when pulled.
 * No separate FIRE button — frees space for radial heals.
 */
export class Input {
  keys = new Set<string>();
  mouseX = 0;
  mouseY = 0;
  mouseDown = false;
  mouseRight = false;
  wheelDelta = 0;
  autoLoot = false;
  /** On touch layout this is always true (aim stick shoots). */
  fireOnAim = false;
  sensitivity = 1;
  private justPressed = new Set<string>();
  touchMove = { x: 0, y: 0 };
  aimStick = { x: 1, y: 0 };
  touchFire = false;
  fireBtnActive = false;
  aimFiring = false;

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
  private touchLayout = false;
  private viewW = 1280;
  private viewH = 720;
  private weaponSlot = 0;
  private fireBtnHeld = false;
  private mouseBtnHeld = false;
  private grenadeReturnSlot = 0;
  private grenadeActive = false;

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
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) {
        this.mouseBtnHeld = false;
        this.syncMouseDown();
      }
      if (e.button === 2) this.mouseRight = false;
    });
    window.addEventListener("blur", () => this.resetPointers());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.resetPointers();
    });

    canvas.addEventListener("mousemove", (e) => {
      if (this.touchLayout || this.aimPointerId !== null) return;
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
    canvas.addEventListener("mousedown", (e) => {
      if (this.touchLayout) return;
      if (e.button === 0) {
        this.mouseBtnHeld = true;
        this.syncMouseDown();
      }
      if (e.button === 2) this.mouseRight = true;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("wheel", (e) => {
      this.wheelDelta += e.deltaY;
    }, { passive: true });
  }

  setViewSize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    if (this.aimPointerId !== null) this.applyAimToMouse();
  }

  setSensitivity(s: number): void {
    this.sensitivity = Math.max(0.5, Math.min(2, s));
    if (this.aimPointerId !== null) this.applyAimToMouse();
  }

  enableTouchMode(autoLoot = true, _fireOnAim = true): void {
    this.touchLayout = true;
    this.autoLoot = autoLoot;
    // Mini Militia: pulling aim stick always shoots
    this.fireOnAim = true;
  }

  disableTouchMode(): void {
    this.touchLayout = false;
    this.fireOnAim = false;
    this.resetPointers();
  }

  get isTouchLayout(): boolean {
    return this.touchLayout;
  }

  resetPointers(): void {
    this.stickPointerId = null;
    this.aimPointerId = null;
    this.stickOrigin = null;
    this.aimOrigin = null;
    this.touchMove = { x: 0, y: 0 };
    this.stickVisible = false;
    this.aimVisible = false;
    this.fireBtnHeld = false;
    this.aimFiring = false;
    this.mouseBtnHeld = false;
    this.mouseDown = false;
    this.mouseRight = false;
    this.touchFire = false;
    this.fireBtnActive = false;
    this.grenadeActive = false;
    this.keys.clear();
  }

  bindFloatingStick(
    zoneEl: HTMLElement,
    stickEl: HTMLElement,
    kind: "move" | "aim",
  ): void {
    const radius = 52;

    zoneEl.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse") return;
      if (e.button !== 0 && e.pointerType !== "touch") return;
      if (kind === "move" && this.stickPointerId !== null) return;
      if (kind === "aim" && this.aimPointerId !== null) return;
      e.preventDefault();
      try { zoneEl.setPointerCapture(e.pointerId); } catch { /* */ }

      const zr = zoneEl.getBoundingClientRect();
      const x = e.clientX - zr.left;
      const y = e.clientY - zr.top;

      const half = 56;
      const cx = Math.max(half, Math.min(zr.width - half, x));
      const cy = Math.max(half, Math.min(zr.height - half, y));
      stickEl.style.left = `${cx - half}px`;
      stickEl.style.top = `${cy - half}px`;
      stickEl.classList.add("active", "shown");

      if (kind === "move") {
        this.stickPointerId = e.pointerId;
        this.stickOrigin = { x: cx, y: cy };
        this.stickBase = { x: cx, y: cy };
        this.stickKnob = { x, y };
        this.stickVisible = true;
        this.updateStickVector(x, y, cx, cy, radius);
        this.syncKnobVisual(stickEl, this.stickOrigin, x, y, radius);
      } else {
        this.aimPointerId = e.pointerId;
        this.aimOrigin = { x: cx, y: cy };
        this.aimBase = { x: cx, y: cy };
        this.aimKnob = { x, y };
        this.aimVisible = true;
        this.updateAimVector(x, y, cx, cy, radius);
        this.syncKnobVisual(stickEl, this.aimOrigin, x, y, radius);
      }
    });

    zoneEl.addEventListener("pointermove", (e) => {
      if (e.pointerType === "mouse") return;
      const zr = zoneEl.getBoundingClientRect();
      const x = e.clientX - zr.left;
      const y = e.clientY - zr.top;
      if (kind === "move" && e.pointerId === this.stickPointerId && this.stickOrigin) {
        e.preventDefault();
        this.stickKnob = { x, y };
        this.updateStickVector(x, y, this.stickOrigin.x, this.stickOrigin.y, radius);
        this.syncKnobVisual(stickEl, this.stickOrigin, x, y, radius);
      }
      if (kind === "aim" && e.pointerId === this.aimPointerId && this.aimOrigin) {
        e.preventDefault();
        this.aimKnob = { x, y };
        this.updateAimVector(x, y, this.aimOrigin.x, this.aimOrigin.y, radius);
        this.syncKnobVisual(stickEl, this.aimOrigin, x, y, radius);
      }
    });

    const end = (e: PointerEvent) => {
      if (kind === "move" && e.pointerId === this.stickPointerId) {
        this.stickPointerId = null;
        this.stickOrigin = null;
        this.touchMove = { x: 0, y: 0 };
        this.stickVisible = false;
        stickEl.classList.remove("active", "shown");
        const knob = stickEl.querySelector(".stick-knob") as HTMLElement | null;
        if (knob) knob.style.transform = "translate(0,0)";
      }
      if (kind === "aim" && e.pointerId === this.aimPointerId) {
        this.aimPointerId = null;
        this.aimOrigin = null;
        this.aimVisible = false;
        this.aimFiring = false;
        this.syncMouseDown();
        stickEl.classList.remove("active", "shown", "firing");
        const knob = stickEl.querySelector(".stick-knob") as HTMLElement | null;
        if (knob) knob.style.transform = "translate(0,0)";
      }
    };
    zoneEl.addEventListener("pointerup", end);
    zoneEl.addEventListener("pointercancel", end);
    zoneEl.addEventListener("lostpointercapture", end);
  }

  private syncKnobVisual(
    stickEl: HTMLElement,
    origin: { x: number; y: number },
    x: number,
    y: number,
    max: number,
  ): void {
    const knob = stickEl.querySelector(".stick-knob") as HTMLElement | null;
    if (!knob) return;
    const dx = x - origin.x;
    const dy = y - origin.y;
    const len = Math.hypot(dx, dy) || 1;
    const mag = Math.min(max, len);
    knob.style.transform = `translate(${(dx / len) * mag}px, ${(dy / len) * mag}px)`;
  }

  private updateStickVector(x: number, y: number, cx: number, cy: number, max: number): void {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    const mag = Math.min(1, len / max);
    this.touchMove = { x: (dx / len) * mag, y: (dy / len) * mag };
  }

  private updateAimVector(x: number, y: number, cx: number, cy: number, max: number): void {
    const dx = (x - cx) * this.sensitivity;
    const dy = (y - cy) * this.sensitivity;
    const len = Math.hypot(dx, dy) || 1;
    const mag = Math.min(1, Math.max(0.12, len / max));
    this.aimStick = { x: (dx / len) * mag, y: (dy / len) * mag };
    this.applyAimToMouse();
    // Pull aim stick → shoot (Mini Militia). Light touch (<30%) aims only.
    this.aimFiring = this.fireOnAim && mag >= 0.3;
    this.syncMouseDown();
  }

  private syncMouseDown(): void {
    const touchFire = this.fireBtnHeld || this.aimFiring;
    this.touchFire = touchFire;
    this.fireBtnActive = this.fireBtnHeld || this.aimFiring;
    this.mouseDown = touchFire || this.mouseBtnHeld;
  }

  setFireButton(held: boolean): void {
    this.fireBtnHeld = held;
    this.syncMouseDown();
  }

  /** Keep WPN cycle in sync with the sim after slot changes (loot / nade return). */
  syncWeaponSlot(activeSlot: number): void {
    if (activeSlot >= 0 && activeSlot <= 2) this.weaponSlot = activeSlot;
  }

  cycleWeapon(): void {
    this.weaponSlot = (this.weaponSlot + 1) % 3;
    this.injectPress(String(this.weaponSlot + 1));
  }

  startGrenade(): void {
    this.grenadeReturnSlot = this.weaponSlot;
    this.grenadeActive = true;
    this.injectPress("4");
    this.setFireButton(true);
  }

  endGrenade(): void {
    if (!this.grenadeActive) {
      this.setFireButton(false);
      return;
    }
    this.grenadeActive = false;
    this.setFireButton(false);
    this.weaponSlot = this.grenadeReturnSlot % 3;
    this.injectPress(String(this.weaponSlot + 1));
  }

  private applyAimToMouse(): void {
    const reach = Math.min(this.viewW, this.viewH) * 0.38;
    this.mouseX = this.viewW / 2 + this.aimStick.x * reach;
    this.mouseY = this.viewH / 2 + this.aimStick.y * reach;
  }

  endFrame(): void {
    this.justPressed.clear();
    this.wheelDelta = 0;
  }

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

    if (this.stickPointerId !== null &&
        (Math.abs(this.touchMove.x) > 0.05 || Math.abs(this.touchMove.y) > 0.05)) {
      return { x: this.touchMove.x, y: this.touchMove.y };
    }

    const len = Math.hypot(x, y);
    if (len > 0) return { x: x / len, y: y / len };
    return { x: 0, y: 0 };
  }
}
