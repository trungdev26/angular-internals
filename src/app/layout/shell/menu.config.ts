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
        items: [
          { label: 'Lý thuyết', link: '/angular/change-detection/theory' },
          { label: 'Demo & Stress test', link: '/angular/change-detection/demo' },
        ],
      },
      {
        title: 'Component Patterns',
        icon: 'apartment',
        items: [{ label: 'Lý thuyết', link: '/angular/base-component-pattern/theory' }],
      },
      {
        title: 'Component Lifecycle',
        icon: 'sync',
        items: [{ label: 'Lý thuyết', link: '/angular/component-lifecycle/theory' }],
      },
      {
        title: 'Forms',
        icon: 'form',
        items: [{ label: 'Lý thuyết', link: '/angular/forms/theory' }],
      },
      {
        title: 'Router',
        icon: 'branches',
        items: [{ label: 'Lý thuyết', link: '/angular/router/theory' }],
      },
      {
        title: 'RxJS',
        icon: 'cluster',
        items: [{ label: 'Lý thuyết', link: '/angular/rxjs/theory' }],
      },
      {
        title: 'State Management',
        icon: 'share-alt',
        items: [{ label: 'Lý thuyết', link: '/angular/state-management/theory' }],
      },
      {
        title: 'Dependency Injection',
        icon: 'deployment-unit',
        items: [{ label: 'Lý thuyết', link: '/angular/dependency-injection/theory' }],
      },
      {
        title: 'Sắp có',
        icon: 'clock-circle',
        disabled: true,
        items: [{ label: 'Virtual scroll' }, { label: 'Lazy loading' }, { label: 'Signals' }],
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
        items: [{ label: 'Lý thuyết', link: '/system-design/data-storage-strategy/theory' }],
      },
      {
        title: 'Cache',
        icon: 'thunderbolt',
        items: [{ label: 'Lý thuyết', link: '/system-design/cache/theory' }],
      },
      {
        title: 'Load Parameter',
        icon: 'line-chart',
        items: [{ label: 'Lý thuyết', link: '/system-design/load-parameter/theory' }],
      },
      {
        title: 'Case Studies',
        icon: 'experiment',
        items: [
          {
            label: '01. Refresh cache nhiều nguồn',
            link: '/system-design/case-studies/cache-refresh-multi-source',
          },
          {
            label: '02. Hàng chờ khám bệnh',
            link: '/system-design/case-studies/clinic-queue-current-load',
          },
        ],
      },
    ],
  },
  {
    title: 'Design Patterns',
    icon: 'code',
    open: true,
    groups: [
      {
        title: 'Nền tảng',
        icon: 'apartment',
        items: [
          { label: 'Tư duy thiết kế', link: '/design-patterns/foundation' },
          { label: 'Creational Patterns', link: '/design-patterns/creational' },
          { label: 'Structural Patterns', link: '/design-patterns/structural' },
          { label: 'Behavioral Patterns', link: '/design-patterns/behavioral' },
        ],
      },
      {
        title: 'Case Studies',
        icon: 'cluster',
        items: [
          {
            label: '01. System Design ThinkingPayment Provider Selection',
            link: '/design-patterns/case-studies/payment-provider-selection',
          },
        ],
      },
    ],
  },
  {
    title: 'Frontend Engineering',
    icon: 'code',
    open: true,
    groups: [
      {
        title: 'Code Like Senior',
        icon: 'code',
        items: [
          { label: 'Tổng quan', link: '/frontend-engineering/code-like-senior' },
          { label: '01. Mindset & nguyên tắc', link: '/frontend-engineering/mindset-principles' },
          {
            label: '02. Boundary & kiến trúc',
            link: '/frontend-engineering/boundary-architecture',
          },
          { label: '03. Component design', link: '/frontend-engineering/component-design' },
          { label: '04. Data flow & state', link: '/frontend-engineering/data-flow-state' },
          { label: '05. Production quality', link: '/frontend-engineering/production-quality' },
          { label: '06. Review & refactor', link: '/frontend-engineering/review-refactor' },
          {
            label: '07. ViewModel pattern (vm$)',
            link: '/frontend-engineering/view-model-pattern',
          },
        ],
      },
      {
        title: 'Case Studies',
        icon: 'code',
        items: [
          {
            label: '01. Order List Production',
            link: '/frontend-engineering/case-order-list-production',
          },
          {
            label: '02. Multi-step Form Production',
            link: '/frontend-engineering/case-multi-step-form-production',
          },
          {
            label: '03. Unsaved Changes Detection',
            link: '/frontend-engineering/case-unsaved-changes-detection',
          },
        ],
      },
    ],
  },
  {
    title: 'Backend Engineering',
    icon: 'api',
    open: true,
    groups: [
      {
        title: 'Nền tảng',
        icon: 'code',
        items: [
          { 
            label: '01. Mindset & Clean Code', 
            link: '/backend-engineering/code-like-senior' 
          },
          {
            label: '02. Review code như Middle/Senior',
            link: '/backend-engineering/review-code-middle-senior',
          },
          {
            label: '03. Architecture & Layering',
            link: '/backend-engineering/architecture-layering',
          },
          {
            label: '04. System Design Thinking',
            link: '/backend-engineering/system-design-thinking',
          },
        ],
      },
    ],
  },
  {
    title: 'Database',
    icon: 'database',
    open: true,
    groups: [
      {
        title: 'Index',
        icon: 'database',
        items: [{ label: 'Lý thuyết', link: '/database/index/theory' }],
      },
      {
        title: 'Execution Plan',
        icon: 'database',
        items: [{ label: 'Lý thuyết', link: '/database/execution-plan/theory' }],
      },
      {
        title: 'Transactions',
        icon: 'database',
        items: [{ label: 'Lý thuyết', link: '/database/transactions/theory' }],
      },
      {
        title: 'Locking & Deadlock',
        icon: 'database',
        items: [{ label: 'Lý thuyết', link: '/database/locking-deadlock/theory' }],
      },
    ],
  },
  {
    title: 'Network',
    icon: 'global',
    open: true,
    groups: [
      {
        title: 'TCP/IP',
        icon: 'cluster',
        items: [{ label: 'Lý thuyết', link: '/network/tcp-ip/theory' }],
      },
    ],
  },
];
