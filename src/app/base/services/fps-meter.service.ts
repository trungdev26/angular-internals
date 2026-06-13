import { Injectable, NgZone } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class FpsMeterService {
  fps = 60;

  private rafId?: number;

  constructor(private readonly ngZone: NgZone) {}

  start(): void {
    if (this.rafId !== undefined) {
      return;
    }
    // Đo FPS ngoài Angular zone để bộ đếm không tự gây thêm CD cycle.
    this.ngZone.runOutsideAngular(() => {
      let lastTime = performance.now();
      let frames = 0;
      const loop = (now: number) => {
        frames++;
        const elapsed = now - lastTime;
        if (elapsed >= 500) {
          const fps = Math.round((frames * 1000) / elapsed);
          frames = 0;
          lastTime = now;
          this.ngZone.run(() => (this.fps = fps));
        }
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    });
  }

  stop(): void {
    if (this.rafId !== undefined) {
      cancelAnimationFrame(this.rafId);
      this.rafId = undefined;
    }
  }
}
