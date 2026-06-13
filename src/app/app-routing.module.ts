import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MarkdownDocComponent } from './base/components/markdown-doc/markdown-doc.component';
import { IndicatorsTableComponent } from './features/change-detection/components/indicators-table.component';

const routes: Routes = [
  { path: '', redirectTo: 'change-detection/theory', pathMatch: 'full' },
  {
    path: 'change-detection',
    children: [
      {
        path: 'theory',
        component: MarkdownDocComponent,
        data: { docSrc: 'assets/docs/change-detection/theory.md' },
      },
      { path: 'demo', component: IndicatorsTableComponent },
    ],
  },
  { path: '**', redirectTo: 'change-detection/theory' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
