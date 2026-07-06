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
  groups?: MenuGroup[];
  items?: MenuItem[];
}

export const MENU_SECTIONS: MenuSection[] = [
  {
    title: 'Angular',
    icon: 'code',
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
        title: 'Case Studies',
        icon: 'experiment',
        items: [
          {
            label: '01. Authenticate Shared Global',
            link: '/angular/case-studies/authenticate-shared-global',
          },
        ],
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
    title: '.NET Core',
    icon: 'tool',
    items: [
      { label: '01. Task, Thread và Process', link: '/dotnet-core/task-thread-process' },
      { label: '02. Garbage Collector (GC)', link: '/dotnet-core/garbage-collector' },
    ],
  },
  {
    title: 'System Design',
    icon: 'cluster',
    groups: [
      {
        title: 'Data Storage',
        icon: 'database',
        items: [{ label: 'Lý thuyết', link: '/system-design/data-storage-strategy/theory' }],
      },
      {
        title: 'Cache',
        icon: 'thunderbolt',
        items: [{ label: 'Lý thuyết', link: '/system-design/cache/theory' }],
      },
      {
        title: 'Idempotency',
        icon: 'sync',
        items: [{ label: 'Lý thuyết', link: '/system-design/idempotency/theory' }],
      },
      {
        title: 'Authenticate',
        icon: 'safety-certificate',
        items: [{ label: 'Lý thuyết', link: '/system-design/authenticate/theory' }],
      },
      {
        title: 'Load Parameter',
        icon: 'line-chart',
        items: [{ label: 'Lý thuyết', link: '/system-design/load-parameter/theory' }],
      },
      {
        title: 'Cluster',
        icon: 'cluster',
        items: [
          { label: 'Lý thuyết', link: '/system-design/cluster/theory' },
          { label: 'Minh họa', link: '/system-design/cluster/demo' },
        ],
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
    title: 'Security',
    icon: 'safety',
    groups: [
      {
        title: 'Nền tảng',
        icon: 'safety-certificate',
        items: [{ label: 'Lý thuyết', link: '/security/theory' }],
      },
    ],
  },
  {
    title: 'Database',
    icon: 'database',
    groups: [
      {
        title: 'Tối ưu truy vấn',
        icon: 'database',
        items: [
          { label: 'Index', link: '/database/index/theory' },
          { label: 'Execution Plan', link: '/database/execution-plan/theory' },
        ],
      },
      {
        title: 'Giao dịch & đồng thời',
        icon: 'sync',
        items: [
          { label: 'Transactions', link: '/database/transactions/theory' },
          { label: 'Locking & Deadlock', link: '/database/locking-deadlock/theory' },
        ],
      },
      {
        title: 'Vận hành',
        icon: 'line-chart',
        disabled: true,
        items: [{ label: 'Statistics' }, { label: 'Partitioning' }, { label: 'Replication' }],
      },
    ],
  },
  {
    title: 'Network',
    icon: 'global',
    groups: [
      {
        title: 'TCP/IP',
        icon: 'cluster',
        items: [{ label: 'Lý thuyết', link: '/network/tcp-ip/theory' }],
      },
    ],
  },
];
