import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { Router } from '@angular/router';
import { MENU_SECTIONS } from './menu.config';

@Component({
  selector: 'app-shell',
  templateUrl: './shell.component.html',
  styleUrls: ['./shell.component.scss'],
})
export class ShellComponent implements OnInit {
  readonly menuSections = MENU_SECTIONS;

  collapsed = false;
  showBackToTop = false;

  @ViewChild('appContent', { read: ElementRef })
  private appContent!: ElementRef<HTMLElement>;

  constructor(private readonly router: Router) {}

  ngOnInit(): void {
    const url = this.router.url;
    for (const section of this.menuSections) {
      section.open = section.groups.some((group) =>
        group.items.some((item) => !!item.link && url.startsWith(item.link)),
      );
    }
  }

  onContentScroll(event: Event): void {
    this.showBackToTop = (event.target as HTMLElement).scrollTop > 300;
  }

  scrollToTop(): void {
    this.appContent.nativeElement.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
