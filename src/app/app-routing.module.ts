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
    path: 'system-design/data-storage-strategy',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/system-design/data-storage-strategy/theory.md' },
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
