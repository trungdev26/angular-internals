import { Component, OnDestroy, OnInit } from '@angular/core';
import { FpsMeterService } from '@base/services/fps-meter.service';

@Component({
  selector: 'app-fps-meter',
  templateUrl: './fps-meter.component.html',
})
export class FpsMeterComponent implements OnInit, OnDestroy {
  constructor(public readonly meter: FpsMeterService) {}

  ngOnInit(): void {
    this.meter.start();
  }

  ngOnDestroy(): void {
    this.meter.stop();
  }

  color(): string {
    if (this.meter.fps < 20) {
      return 'red';
    }
    if (this.meter.fps < 45) {
      return 'orange';
    }
    return 'green';
  }
}
