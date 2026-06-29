import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MarkdownDocComponent } from './base/components/markdown-doc/markdown-doc.component';
import { IndicatorsTableComponent } from './features/change-detection/components/indicators-table.component';

const routes: Routes = [
  { path: '', redirectTo: 'angular/change-detection/theory', pathMatch: 'full' },
  {
    path: 'angular/change-detection',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/change-detection/theory.md' },
      },
      { path: 'demo', component: IndicatorsTableComponent },
    ],
  },
  {
    path: 'angular/base-component-pattern',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/base-component-pattern/theory.md' },
      },
    ],
  },
  {
    path: 'angular/component-lifecycle',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/component-lifecycle/theory.md' },
      },
    ],
  },
  {
    path: 'angular/forms',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/forms/theory.md' },
      },
    ],
  },
  {
    path: 'angular/router',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/router/theory.md' },
      },
    ],
  },
  {
    path: 'angular/rxjs',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/rxjs/theory.md' },
      },
    ],
  },
  {
    path: 'angular/state-management',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/state-management/theory.md' },
      },
    ],
  },
  {
    path: 'angular/dependency-injection',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/angular/dependency-injection/theory.md' },
      },
    ],
  },
  {
    path: 'system-design/data-storage-strategy',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/data-storage-strategy/theory.md' },
      },
    ],
  },
  {
    path: 'system-design/cache',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/cache/theory.md' },
      },
    ],
  },
  {
    path: 'system-design/load-parameter',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/load-parameter/theory.md' },
      },
    ],
  },
  {
    path: 'system-design/case-studies',
    children: [
      {
        path: 'cache-refresh-multi-source',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/system-design/case-studies/cache-refresh-multi-source.md',
        },
      },
      {
        path: 'clinic-queue-current-load',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/system-design/case-studies/clinic-queue-current-load.md',
        },
      },
    ],
  },
  {
    path: 'design-patterns',
    children: [
      {
        path: 'foundation',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/design-patterns/foundation.md' },
      },
      {
        path: 'creational',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/design-patterns/creational.md' },
      },
      {
        path: 'structural',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/design-patterns/structural.md' },
      },
      {
        path: 'behavioral',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/design-patterns/behavioral.md' },
      },
      {
        path: 'case-studies/payment-provider-selection',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/design-patterns/case-studies/payment-provider-selection.md' },
      },
    ],
  },
  {
    path: 'frontend-engineering',
    children: [
      {
        path: 'code-like-senior',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/code-like-senior.md' },
      },
      {
        path: 'mindset-principles',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/01-mindset-principles.md' },
      },
      {
        path: 'boundary-architecture',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/02-boundary-architecture.md' },
      },
      {
        path: 'component-design',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/03-component-design.md' },
      },
      {
        path: 'data-flow-state',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/04-data-flow-state.md' },
      },
      {
        path: 'production-quality',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/05-production-quality.md' },
      },
      {
        path: 'review-refactor',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/06-review-refactor.md' },
      },
      {
        path: 'view-model-pattern',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/frontend-engineering/07-view-model-pattern.md' },
      },
      {
        path: 'case-order-list-production',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/case-studies/01-order-list-production.md',
        },
      },
      {
        path: 'case-multi-step-form-production',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/case-studies/02-multi-step-form-production.md',
        },
      },
      {
        path: 'case-unsaved-changes-detection',
        component: MarkdownDocComponent,
        data: {
          docSrc: 'assets/docs/frontend-engineering/case-studies/03-unsaved-changes-detection.md',
        },
      },
    ],
  },
  {
    path: 'backend-engineering',
    children: [
      {
        path: 'code-like-senior',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/backend-engineering/code-like-senior.md' },
      },
      
      {
        path: 'review-code-middle-senior',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/backend-engineering/review-code-middle-senior.md' },
      },
      {
        path: 'architecture-layering',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/backend-engineering/02-architecture-layering.md' },
      },
      {
        path: 'system-design-thinking',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/backend-engineering/03-system-design-thinking.md' },
      },
    ],
  },
  {
    path: 'database/index',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/index/theory.md' },
      },
    ],
  },
  {
    path: 'database/execution-plan',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/execution-plan/theory.md' },
      },
    ],
  },
  {
    path: 'database/transactions',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/transactions/theory.md' },
      },
    ],
  },
  {
    path: 'database/locking-deadlock',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/database/locking-deadlock/theory.md' },
      },
    ],
  },
  {
    path: 'network/tcp-ip',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/network/tcp-ip/theory.md' },
      },
    ],
  },
  { path: '**', redirectTo: 'angular/change-detection/theory' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
