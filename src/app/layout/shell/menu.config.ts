export interface MenuItem {
  label: string;
  link?: string;
}

export interface MenuSection {
  title: string;
  icon: string;
  open?: boolean;
  disabled?: boolean;
  items: MenuItem[];
}

export const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Change Detection',
    icon: 'thunderbolt',
    open: true,
    items: [
      { label: 'Lý thuyết', link: '/change-detection/theory' },
      { label: 'Demo & Stress test', link: '/change-detection/demo' },
    ],
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
];
