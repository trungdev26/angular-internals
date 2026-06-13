import { Component, ElementRef, ViewChild } from '@angular/core';
import { MENU_SECTIONS } from './menu.config';

@Component({
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss'],
})
export class ShellComponent {
  readonly menuSections = MENU_SECTIONS;

  collapsed = false;
  showBackToTop = false;

  @ViewChild('appContent', { read: ElementRef })
  private appContent!: ElementRef<HTMLElement>;

  onContentScroll(event: Event): void {
    this.showBackToTop = (event.target as HTMLElement).scrollTop > 300;
  }

  scrollToTop(): void {
    this.appContent.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
