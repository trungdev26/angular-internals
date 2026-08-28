import { NgModule, SecurityContext } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { NZ_I18N } from 'ng-zorro-antd/i18n';
import { en_US } from 'ng-zorro-antd/i18n';
import { registerLocaleData } from '@angular/common';
import en from '@angular/common/locales/en';
import { FormsModule } from '@angular/forms';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideHttpClient } from '@angular/common/http';
import { HttpClient } from '@angular/common/http';
import { MarkdownModule } from 'ngx-markdown';
import { NzAlertModule } from 'ng-zorro-antd/alert';
import { NzButtonModule } from 'ng-zorro-antd/button';
import { NzCheckboxModule } from 'ng-zorro-antd/checkbox';
import { NzIconModule } from 'ng-zorro-antd/icon';
import {
  ThunderboltOutline,
  ClockCircleOutline,
  DatabaseOutline,
  ApartmentOutline,
  CodeOutline,
  ClusterOutline,
  FormOutline,
  BranchesOutline,
  ShareAltOutline,
  ApiOutline,
  GlobalOutline,
  ExperimentOutline,
  LineChartOutline,
  DeploymentUnitOutline,
  SyncOutline,
  SendOutline,
  PlusOutline,
  MinusOutline,
  FireOutline,
  ToolOutline,
  ReloadOutline,
  SafetyOutline,
  SafetyCertificateOutline,
  SkinOutline,
  AppstoreOutline,
  HighlightOutline,
  TagOutline,
} from '@ant-design/icons-angular/icons';
import { NzImageModule } from 'ng-zorro-antd/image';
import { NzInputNumberModule } from 'ng-zorro-antd/input-number';
import { NzLayoutModule } from 'ng-zorro-antd/layout';
import { NzMenuModule } from 'ng-zorro-antd/menu';
import { NzRadioModule } from 'ng-zorro-antd/radio';
import { NzSelectModule } from 'ng-zorro-antd/select';
import { NzTableModule } from 'ng-zorro-antd/table';
import { NzTagModule } from 'ng-zorro-antd/tag';
import { ShellComponent } from './layout/shell/shell.component';
import { MarkdownDocComponent } from './base/components/markdown-doc/markdown-doc.component';
import { IndicatorsTableComponent } from './features/change-detection/components/indicators-table.component';
import { IndicatorRowDefaultComponent } from './features/change-detection/components/cd-default/indicator-row-default.component';
import { IndicatorRowOnpushComponent } from './features/change-detection/components/cd-onpush/indicator-row-onpush.component';
import { IndicatorRowOnpushPipeComponent } from './features/change-detection/components/cd-onpush-pipe/indicator-row-onpush-pipe.component';
import { FpsMeterComponent } from './base/components/fps-meter/fps-meter.component';
import { RiskScorePipe } from './features/change-detection/pipes/risk-score.pipe';
import { ClusterDemoComponent } from './features/system-design/cluster/cluster-demo.component';
import { ClusterTheoryComponent } from './features/system-design/cluster/cluster-theory.component';
import { LoadParameterDemoComponent } from './features/system-design/load-parameter/load-parameter-demo.component';
import { IdempotencyDemoComponent } from './features/system-design/idempotency/idempotency-demo.component';
import { StorageIoDemoComponent } from './features/database/storage-io/storage-io-demo.component';
import { IndexDemoComponent } from './features/database/index/index-demo.component';
import { ExecutionPlanDemoComponent } from './features/database/execution-plan/execution-plan-demo.component';
import { TransactionDemoComponent } from './features/database/transactions/transaction-demo.component';
import { OutboxFlowDemoComponent } from './features/database/transactions/outbox-flow-demo.component';
import { IsolationAnomaliesDemoComponent } from './features/database/isolation-anomalies/isolation-anomalies-demo.component';
import { StepHistoryComponent } from './features/database/shared/step-history/step-history.component';
import { AdvancedSqlDemoComponent } from './features/database/advanced-sql/advanced-sql-demo.component';

registerLocaleData(en);

@NgModule({
  declarations: [
    AppComponent,
    ShellComponent,
    MarkdownDocComponent,
    IndicatorsTableComponent,
    IndicatorRowDefaultComponent,
    IndicatorRowOnpushComponent,
    IndicatorRowOnpushPipeComponent,
    FpsMeterComponent,
    RiskScorePipe,
    ClusterDemoComponent,
    ClusterTheoryComponent,
    LoadParameterDemoComponent,
    IdempotencyDemoComponent,
    StorageIoDemoComponent,
    IndexDemoComponent,
    ExecutionPlanDemoComponent,
    TransactionDemoComponent,
    OutboxFlowDemoComponent,
    IsolationAnomaliesDemoComponent,
    StepHistoryComponent,
    AdvancedSqlDemoComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    NzAlertModule,
    NzButtonModule,
    NzCheckboxModule,
    NzIconModule.forRoot([
      ThunderboltOutline,
      ClockCircleOutline,
      DatabaseOutline,
      ApartmentOutline,
      CodeOutline,
      ClusterOutline,
      FormOutline,
      BranchesOutline,
      ShareAltOutline,
      ApiOutline,
      GlobalOutline,
      ExperimentOutline,
      LineChartOutline,
      DeploymentUnitOutline,
      SyncOutline,
      SendOutline,
      PlusOutline,
      MinusOutline,
      FireOutline,
      ToolOutline,
      ReloadOutline,
      SafetyOutline,
      SafetyCertificateOutline,
      SkinOutline,
      AppstoreOutline,
      HighlightOutline,
      TagOutline,
    ]),
    NzImageModule,
    NzInputNumberModule,
    NzLayoutModule,
    NzMenuModule,
    NzRadioModule,
    NzSelectModule,
    NzTableModule,
    NzTagModule,
    MarkdownModule.forRoot({
      loader: HttpClient,
      sanitize: SecurityContext.NONE,
    }),
  ],
  providers: [{ provide: NZ_I18N, useValue: en_US }, provideAnimationsAsync(), provideHttpClient()],
  bootstrap: [AppComponent],
})
export class AppModule {}
