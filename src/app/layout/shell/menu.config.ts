export interface MenuItem {
  label: string;
  link?: string;
}

export interface MenuGroup {
  title: string;
  icon: string;
  open?: boolean;
  disabled?: boolean;
  items: MenuItem[];
}

export interface MenuSection {
  title: string;
  icon: string;
  open?: boolean;
  groups: MenuGroup[];
}

export const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Angular',
    icon: 'code',
    open: true,
    groups: [
      {
        title: 'Change Detection',
        icon: 'thunderbolt',
        open: true,
        items: [
          { label: 'Lý thuyết', link: '/angular/change-detection/theory' },
          { label: 'Demo & Stress test', link: '/angular/change-detection/demo' },
        ],
      },
      {
        title: 'Component Patterns',
        icon: 'apartment',
        open: true,
        items: [{ label: 'Lý thuyết', link: '/angular/base-component-pattern/theory' }],
      },
      {
        title: 'Forms',
        icon: 'form',
        open: true,
        items: [{ label: 'Lý thuyết', link: '/angular/forms/theory' }],
      },
      {
        title: 'Sắp có',
        icon: 'clock-circle',
        disabled: true,
        items: [
          { label: 'RxJS & Async pipe' },
          { label: 'Virtual scroll' },
          { label: 'Lazy loading' },
          { label: 'Signals' },
        ],
      },
    ],
  },
  {
    title: 'System Design',
    icon: 'cluster',
    open: true,
    groups: [
      {
        title: 'Data Storage Strategy',
        icon: 'database',
        open: true,
        items: [{ label: 'Lý thuyết', link: '/system-design/data-storage-strategy/theory' }],
      },
    ],
  },
];
