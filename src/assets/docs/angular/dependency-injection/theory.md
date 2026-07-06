# Angular Dependency Injection

> Tài liệu này tổng hợp kiến thức và tư duy thiết kế khi sử dụng Dependency Injection trong Angular. Nội dung được sắp xếp từ nền tảng đến nâng cao, phục vụ cho việc học, thiết kế service, review code và xử lý các lỗi liên quan đến provider scope, nhiều instance service, state không đồng bộ hoặc lifecycle không đúng.

---

## Mục tiêu tài liệu

Sau khi đọc xong, người đọc cần trả lời được các câu hỏi sau:

```text
1. Dependency Injection là gì và vì sao Angular cần DI?
2. @Injectable() dùng để làm gì?
3. Provider, Injector, Token khác nhau như thế nào?
4. providedIn: 'root' có thật sự chỉ là singleton không?
5. Vì sao một service có thể bị tạo nhiều instance?
6. Khi nào nên provide service ở root, route/feature hoặc component?
7. DI liên quan gì đến state, lifecycle, memory leak và testability?
8. Khi review Angular DI cần nhìn những điểm nào?
```

---

## 1. Tổng quan về Dependency Injection

### 1.1. Dependency Injection là gì?

**Dependency Injection**, viết tắt là **DI**, là cơ chế giúp một class không cần tự tạo các object mà nó phụ thuộc vào. Thay vào đó, class chỉ khai báo dependency cần dùng, còn Angular chịu trách nhiệm tìm, tạo và truyền dependency đó vào.

Ví dụ component cần gọi API lấy danh sách hàng chờ khám bệnh:

```ts
@Component({
  selector: 'app-patient-queue',
  templateUrl: './patient-queue.component.html'
})
export class PatientQueueComponent {
  constructor(private queueService: PatientQueueService) {}
}
```

Component không tự tạo service:

```ts
const queueService = new PatientQueueService();
```

Component chỉ khai báo:

```text
Tôi cần PatientQueueService.
```

Angular sẽ xử lý phía sau:

```text
- Ai cung cấp PatientQueueService?
- Service này đã có instance chưa?
- Nếu chưa có thì tạo như thế nào?
- Instance này dùng chung toàn app hay chỉ dùng riêng cho component này?
```

DI giúp code dễ mở rộng hơn vì class sử dụng dependency không bị phụ thuộc chặt vào cách dependency được tạo ra.

---

### 1.2. Dependency là gì?

**Dependency** là thứ mà một class cần để hoạt động.

Ví dụ:

```ts
export class PatientQueueComponent {
  constructor(
    private queueService: PatientQueueService,
    private notificationService: NotificationService
  ) {}
}
```

Ở đây `PatientQueueService` và `NotificationService` là dependency của `PatientQueueComponent`.

Có thể hiểu đơn giản:

```text
Class A cần dùng Class B để làm việc
→ Class B là dependency của Class A.
```

Ví dụ thực tế:

```text
PatientQueueComponent cần PatientQueueService để lấy danh sách hàng chờ.
PatientQueueService cần HttpClient để gọi API.
AuthInterceptor cần TokenService để lấy access token.
PermissionService cần CurrentUserService để kiểm tra quyền.
```

---

### 1.3. Vì sao không nên tự `new` dependency?

Ví dụ không dùng DI:

```ts
export class PatientQueueComponent {
  private queueService = new PatientQueueService();
}
```

Cách này có một số vấn đề:

```text
- Component phụ thuộc chặt vào implementation cụ thể.
- Khó thay PatientQueueService bằng MockPatientQueueService khi test.
- Khó kiểm soát service này dùng chung hay tạo mới.
- Nếu service có dependency khác như HttpClient, việc tự new sẽ phức tạp.
- Vòng đời instance không do Angular quản lý.
```

Dùng DI:

```ts
export class PatientQueueComponent {
  constructor(private queueService: PatientQueueService) {}
}
```

Lợi ích:

```text
- Angular quản lý cách tạo dependency.
- Có thể thay implementation qua provider.
- Có thể mock dễ hơn khi test.
- Có thể kiểm soát scope và lifecycle.
- Code ít phụ thuộc chặt vào object cụ thể.
```

---

### 1.4. Service là gì trong Angular?

Trong Angular, **service** thường là class chứa logic không nên đặt trực tiếp trong component.

Ví dụ:

```ts
@Injectable({
  providedIn: 'root'
})
export class PatientQueueService {
  constructor(private http: HttpClient) {}

  getQueue(roomId: number) {
    return this.http.get(`/api/rooms/${roomId}/queue`);
  }
}
```

Service thường dùng cho:

```text
- Gọi API.
- Giữ state.
- Xử lý business logic.
- Format/transform data.
- Kiểm tra quyền.
- Gửi notification.
- Kết nối realtime/websocket.
- Làm facade cho component.
```

Khi mới bắt đầu, dev thường viết nhiều logic trong component:

```text
Component vừa gọi API.
Component vừa giữ state.
Component vừa xử lý websocket.
Component vừa check quyền.
Component vừa map DTO sang view model.
```

Khi code lớn dần, component sẽ khó đọc, khó test và khó maintain. DI giúp tách logic sang các service phù hợp.

---

## 2. Các khái niệm cốt lõi trong Angular DI

### 2.1. Token là gì?

**Token** là thứ Angular dùng để định danh dependency cần resolve.

Ví dụ:

```ts
constructor(private queueService: PatientQueueService) {}
```

Ở đây `PatientQueueService` vừa là type, vừa là token runtime để Angular tìm provider tương ứng.

Với các dependency không có runtime type như interface, primitive value hoặc config object, cần dùng `InjectionToken`.

Ví dụ:

```ts
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
```

Tóm tắt:

```text
Token = key để Angular đi tìm dependency.
Provider = cấu hình nói token đó được tạo/trả về như thế nào.
Injector = nơi lưu provider và resolve token.
```

---

### 2.2. `@Injectable()` là gì?

`@Injectable()` là decorator đánh dấu một class có thể tham gia vào Angular Dependency Injection system.

Ví dụ:

```ts
@Injectable()
export class PatientQueueService {
  constructor(private http: HttpClient) {}
}
```

Khi có `@Injectable()`, Angular biết class này có thể được DI tạo instance và có thể phân tích dependency trong constructor.

Nói dễ hiểu:

```text
@Injectable() giúp Angular biết:
Class này có thể được DI tạo ra.
Class này có thể có dependency cần inject vào constructor.
```

---

### 2.3. `@Injectable()` có tự tạo provider không?

Đây là điểm rất dễ nhầm.

Ví dụ:

```ts
@Injectable()
export class PatientQueueService {}
```

Đoạn trên mới chỉ nói rằng `PatientQueueService` là class có thể tham gia DI. Nhưng nếu không có provider, Angular vẫn chưa biết phải lấy instance của service này từ đâu.

Nếu component inject service:

```ts
@Component({
  selector: 'app-patient-queue',
  templateUrl: './patient-queue.component.html'
})
export class PatientQueueComponent {
  constructor(private queueService: PatientQueueService) {}
}
```

nhưng chưa provide service ở đâu cả, có thể gặp lỗi:

```text
NullInjectorError: No provider for PatientQueueService
```

Cần đăng ký provider bằng một trong các cách sau.

Cách 1: dùng `providedIn`:

```ts
@Injectable({
  providedIn: 'root'
})
export class PatientQueueService {}
```

Cách 2: provide trong component:

```ts
@Component({
  selector: 'app-patient-queue',
  providers: [PatientQueueService],
  templateUrl: './patient-queue.component.html'
})
export class PatientQueueComponent {}
```

Cách 3: provide trong route:

```ts
export const routes: Routes = [
  {
    path: 'patient-queue',
    providers: [PatientQueueService],
    loadComponent: () =>
      import('./patient-queue.page').then(m => m.PatientQueuePage)
  }
];
```

Câu chốt:

```text
@Injectable() trả lời câu hỏi:
Angular có biết cách tạo class này không?

providedIn/providers trả lời câu hỏi:
Class này được đăng ký ở injector nào và sống bao lâu?
```

---

### 2.4. Provider là gì?

**Provider** là cấu hình nói với Angular cách cung cấp một dependency.

Nói đơn giản:

```text
Khi ai đó cần token X, hãy trả về class/value/factory Y.
```

Ví dụ đơn giản nhất:

```ts
@Injectable({
  providedIn: 'root'
})
export class PatientQueueService {}
```

Hoặc:

```ts
@Component({
  providers: [PatientQueueService]
})
export class PatientQueueComponent {}
```

Cả hai cách trên đều tạo provider cho `PatientQueueService`, nhưng khác nhau về scope.

Một số dạng provider phổ biến:

```ts
providers: [
  PatientQueueService,

  {
    provide: QueueApi,
    useClass: HttpQueueApi
  },

  {
    provide: API_BASE_URL,
    useValue: 'https://api.example.com'
  },

  {
    provide: QueueConfig,
    useFactory: queueConfigFactory,
    deps: [EnvironmentService]
  }
]
```

Trước mắt chỉ cần nhớ:

```text
Provider = nơi đăng ký dependency cho Angular DI.
```

Các dạng `useClass`, `useValue`, `useFactory`, `useExisting` sẽ được trình bày kỹ ở phần sau.

---

### 2.5. Injector là gì?

**Injector** là nơi Angular lưu provider và tạo/trả instance khi có class cần dependency.

Mental model:

```text
Component cần A
→ hỏi injector hiện tại có provider cho A không?
    Có  → trả instance
    Không → hỏi injector cha
```

Angular DI có tính phân cấp.

```text
Root Injector
 └── Route/Feature Injector
      └── Component Injector
           └── Child Component Injector
```

Ví dụ:

```ts
@Component({
  selector: 'app-patient-queue',
  templateUrl: './patient-queue.component.html'
})
export class PatientQueueComponent {
  constructor(private queueService: PatientQueueService) {}
}
```

Khi `PatientQueueComponent` cần `PatientQueueService`, Angular sẽ đi tìm provider theo thứ tự gần đến xa:

```text
1. Injector của chính component đó.
2. Injector của component cha.
3. Injector của route/feature.
4. Root injector.
```

Đây là nền tảng để hiểu vì sao cùng một service có thể có nhiều instance khác nhau.

---

### 2.6. Ví dụ inject service vào component

Service:

```ts
@Injectable({
  providedIn: 'root'
})
export class PatientQueueService {
  getCurrentQueue() {
    return [];
  }
}
```

Component:

```ts
@Component({
  selector: 'app-patient-queue',
  templateUrl: './patient-queue.component.html'
})
export class PatientQueueComponent {
  constructor(private queueService: PatientQueueService) {}

  ngOnInit() {
    const queue = this.queueService.getCurrentQueue();
  }
}
```

Ý nghĩa:

```text
PatientQueueComponent cần PatientQueueService.
PatientQueueService được provide ở root.
Angular lấy instance từ root injector và truyền vào component.
```

---

## 3. Provider Scope và Lifecycle

### 3.1. Vì sao DI scope quan trọng?

Khi app nhỏ, ta thường để mọi service là `providedIn: 'root'`. Cách này dễ dùng, ít lỗi ban đầu.

Nhưng khi app lớn hơn, service bắt đầu giữ state, mở websocket, cache data, subscribe event hoặc phục vụ từng màn hình riêng. Lúc đó, scope sai có thể gây bug khó hiểu.

Ví dụ các câu hỏi thực tế:

```text
- Tại sao set data trong service rồi component khác không nhận?
- Tại sao rời màn hình rồi quay lại mà filter cũ vẫn còn?
- Tại sao mở 3 tab thì state của tab này ảnh hưởng tab kia?
- Tại sao websocket bị mở nhiều connection?
- Tại sao cache bị miss dù tưởng đang dùng chung service?
```

Nhiều bug Angular không nằm ở RxJS hay component, mà nằm ở DI scope.

---

### 3.2. `providedIn: 'root'`

Ví dụ:

```ts
@Injectable({
  providedIn: 'root'
})
export class AuthService {}
```

Ý nghĩa cơ bản:

```text
AuthService được đăng ký ở root injector.
Các nơi inject AuthService trong app thường dùng chung một instance.
```

Các service phù hợp với root scope:

```text
- AuthService.
- PermissionService.
- CurrentUserService.
- CurrentTenantService.
- AppConfigService.
- LoggerService.
- ToastService.
- NotificationService.
```

Nhưng không nên hiểu quá đơn giản rằng:

```text
providedIn: 'root' = singleton tuyệt đối trong mọi hoàn cảnh.
```

Nói chính xác hơn:

```text
providedIn: 'root' tạo một provider ở root injector của application instance.
```

Với đa số app Angular thông thường, điều này tương đương một instance dùng chung toàn app.

---

### 3.3. Root scope

Root scope phù hợp cho dependency dùng chung toàn app:

```text
- Auth/session.
- Permission.
- Tenant hiện tại.
- App config.
- Logger.
- Toast/notification.
- Shared cache thật sự global.
- WebSocket connection dùng chung toàn app.
```

Không nên đưa lên root nếu:

```text
- State chỉ phục vụ một màn hình.
- Khi rời màn hình cần reset state.
- Mỗi instance component cần state riêng.
- Service chứa filter/table selection/modal state local.
```

---

### 3.4. Route/Feature scope

Với Angular hiện đại, route có thể khai báo provider:

```ts
export const patientQueueRoutes: Routes = [
  {
    path: '',
    providers: [
      PatientQueueFacade,
      PatientQueueState,
      PatientQueueRealtimeHandler
    ],
    loadComponent: () =>
      import('./patient-queue.page').then(m => m.PatientQueuePage)
  }
];
```

Ý nghĩa:

```text
Các service này sống trong phạm vi route/feature patient-queue.
Khi rời feature, state có thể được reset nếu không còn reference giữ lại.
```

Route/feature scope phù hợp cho:

```text
- Feature state.
- Feature facade.
- Feature-specific API service.
- Workflow service.
- Realtime handler của riêng feature.
- Cache chỉ có giá trị trong một màn hình lớn.
```

Ví dụ:

```text
Root:
- WebSocketConnectionService

Route patient-queue:
- PatientQueueRealtimeHandler
- PatientQueueState
- PatientQueueFacade
```

Connection thật sự có thể dùng chung toàn app, nhưng handler xử lý event cho màn hàng chờ nên scoped theo route.

---

### 3.5. Component scope

Provider ở component tạo instance riêng cho component đó và subtree của nó.

Ví dụ:

```ts
@Component({
  selector: 'app-room-filter',
  providers: [RoomFilterState],
  templateUrl: './room-filter.component.html'
})
export class RoomFilterComponent {
  constructor(public state: RoomFilterState) {}
}
```

Nếu render 3 component:

```html
<app-room-filter [roomId]="1"></app-room-filter>
<app-room-filter [roomId]="2"></app-room-filter>
<app-room-filter [roomId]="3"></app-room-filter>
```

thì sẽ có 3 instance `RoomFilterState` khác nhau.

Component scope phù hợp cho:

```text
- Modal state.
- Wizard state.
- Filter state.
- Table selection state.
- Local form state.
- Tab-specific state.
- Component-level cache.
```

Ví dụ sai thường gặp:

```ts
@Injectable({
  providedIn: 'root'
})
export class SearchBoxState {
  keyword = '';
}
```

Nếu `SearchBoxState` chỉ phục vụ từng ô search riêng, để root có thể làm các search box ảnh hưởng lẫn nhau.

Tốt hơn:

```ts
@Component({
  selector: 'app-search-box',
  providers: [SearchBoxState],
  templateUrl: './search-box.component.html'
})
export class SearchBoxComponent {}
```

---

### 3.6. So sánh nhanh các scope

```text
Root scope
→ Dùng chung toàn app.
→ Sống lâu theo app.
→ Phù hợp auth, permission, config, logger.

Route/Feature scope
→ Dùng chung trong một feature/route.
→ Có thể reset khi rời feature.
→ Phù hợp feature state, facade, workflow.

Component scope
→ Mỗi component instance có một instance riêng.
→ Sống theo component subtree.
→ Phù hợp modal, filter, wizard, selection state.
```

Câu hỏi cần hỏi khi tạo service mới:

```text
State/service này nên sống bao lâu?
Ai cần dùng chung nó?
Khi rời màn hình có cần reset không?
Nếu render nhiều component giống nhau, chúng có nên dùng chung state không?
```

---

### 3.7. Lazy loading và nhiều instance service

Trong Angular dùng NgModule cũ, nếu service được provide trong lazy module:

```ts
@NgModule({
  providers: [PatientQueueState]
})
export class PatientQueueModule {}
```

service này thuộc injector của lazy module/route, không phải root.

Điều này có thể đúng hoặc sai tùy ý đồ.

Đúng nếu:

```text
- Feature cần state riêng.
- Khi rời feature muốn reset state.
- Không muốn state phình lên global.
```

Sai nếu:

```text
- AuthService bị provide lại trong lazy module.
- PermissionService có cache riêng từng feature.
- WebSocketService bị tạo nhiều connection.
- EventBusService bị duplicate instance.
```

Rule thực tế:

```text
Global service không provide lại trong lazy module/component.
Feature state thì nên scoped theo route/feature.
```

---

## 4. Các dạng Provider

### 4.1. Class Provider — `useClass`

`useClass` nói với Angular rằng khi ai đó inject token A, hãy tạo instance của class B.

Ví dụ:

```ts
export abstract class QueueApi {
  abstract getQueue(roomId: number): Observable<QueueDto>;
}

@Injectable()
export class HttpQueueApi implements QueueApi {
  constructor(private http: HttpClient) {}

  getQueue(roomId: number) {
    return this.http.get<QueueDto>(`/api/rooms/${roomId}/queue`);
  }
}
```

Provider:

```ts
providers: [
  {
    provide: QueueApi,
    useClass: HttpQueueApi
  }
]
```

Inject:

```ts
constructor(private api: QueueApi) {}
```

Ý nghĩa:

```text
Component/facade phụ thuộc vào QueueApi abstraction.
Runtime Angular cung cấp HttpQueueApi implementation.
```

Dùng khi muốn thay implementation:

```text
Production → HttpQueueApi.
Unit test → MockQueueApi.
Offline mode → LocalQueueApi.
Demo mode → FakeQueueApi.
```

---

### 4.2. Value Provider — `useValue`

`useValue` dùng để cung cấp một giá trị cố định.

Ví dụ:

```ts
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');
```

Provider:

```ts
providers: [
  {
    provide: API_BASE_URL,
    useValue: 'https://api.example.com'
  }
]
```

Inject:

```ts
@Injectable()
export class PatientApiService {
  constructor(
    @Inject(API_BASE_URL) private baseUrl: string
  ) {}
}
```

Dùng cho:

```text
- Base URL.
- Static config.
- Feature flags.
- Default options.
- Primitive values.
- Constant object.
```

---

### 4.3. Factory Provider — `useFactory`

`useFactory` dùng khi dependency cần logic khởi tạo.

Ví dụ:

```ts
export function createQueueApi(
  env: EnvironmentService,
  http: HttpClient
): QueueApi {
  if (env.useMockApi) {
    return new MockQueueApi();
  }

  return new HttpQueueApi(http);
}
```

Provider:

```ts
providers: [
  {
    provide: QueueApi,
    useFactory: createQueueApi,
    deps: [EnvironmentService, HttpClient]
  }
]
```

Dùng khi cần chọn dependency theo:

```text
- Environment.
- Tenant.
- Feature flag.
- Runtime config.
- Platform browser/server.
```

Lưu ý thiết kế:

```text
Factory provider không nên chứa quá nhiều business logic.
Nếu factory quá dài, có thể đang che giấu một service/config design chưa tốt.
```

---

### 4.4. Existing Provider — `useExisting`

`useExisting` tạo alias từ token này sang token khác và dùng chung cùng một instance.

Ví dụ:

```ts
@Injectable()
export class DefaultLoggerService {
  log(message: string) {
    console.log(message);
  }
}
```

Provider:

```ts
providers: [
  DefaultLoggerService,
  {
    provide: LoggerService,
    useExisting: DefaultLoggerService
  }
]
```

Ý nghĩa:

```text
Ai inject DefaultLoggerService hay LoggerService đều nhận cùng một instance.
```

Khác với `useClass`:

```ts
providers: [
  DefaultLoggerService,
  {
    provide: LoggerService,
    useClass: DefaultLoggerService
  }
]
```

Cách này có thể tạo hai instance khác nhau.

Câu chốt:

```text
useExisting = alias tới instance đã có.
useClass = tạo instance theo class được chỉ định.
```

---

### 4.5. Multi Provider

Multi provider cho phép nhiều provider cùng đóng góp vào một token. Angular sẽ trả về array.

Ví dụ:

```ts
export interface QueuePlugin {
  execute(): void;
}

export const QUEUE_PLUGINS =
  new InjectionToken<QueuePlugin[]>('QUEUE_PLUGINS');
```

Khai báo:

```ts
providers: [
  {
    provide: QUEUE_PLUGINS,
    useClass: AuditQueuePlugin,
    multi: true
  },
  {
    provide: QUEUE_PLUGINS,
    useClass: NotifyQueuePlugin,
    multi: true
  }
]
```

Inject:

```ts
constructor(
  @Inject(QUEUE_PLUGINS) private plugins: QueuePlugin[]
) {}
```

Kết quả:

```text
plugins = [
  AuditQueuePlugin instance,
  NotifyQueuePlugin instance
]
```

Dùng cho:

```text
- Plugin architecture.
- Interceptor.
- Validator.
- Middleware-like processing.
- Feature extension point.
```

Lưu ý:

```text
Nếu thứ tự xử lý quan trọng, cần document rõ thứ tự provider.
```

---

## 5. InjectionToken

### 5.1. Vì sao cần InjectionToken?

Angular DI cần token tồn tại ở runtime. TypeScript interface không tồn tại ở runtime.

Ví dụ:

```ts
export interface AppConfig {
  apiUrl: string;
  enableDebug: boolean;
}
```

Không thể inject trực tiếp interface:

```ts
constructor(private config: AppConfig) {}
```

Cách đúng:

```ts
export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
```

Provider:

```ts
providers: [
  {
    provide: APP_CONFIG,
    useValue: {
      apiUrl: 'https://api.example.com',
      enableDebug: false
    }
  }
]
```

Inject:

```ts
constructor(
  @Inject(APP_CONFIG) private config: AppConfig
) {}
```

Dùng `InjectionToken` khi inject:

```text
- Interface-like contract.
- Config object.
- Primitive value.
- Array.
- Function.
- Plugin list.
```

---

### 5.2. InjectionToken cho config

Ví dụ config app:

```ts
export interface AppConfig {
  apiUrl: string;
  enableDebug: boolean;
  defaultPageSize: number;
}

export const APP_CONFIG = new InjectionToken<AppConfig>('APP_CONFIG');
```

Provider:

```ts
bootstrapApplication(AppComponent, {
  providers: [
    {
      provide: APP_CONFIG,
      useValue: {
        apiUrl: environment.apiUrl,
        enableDebug: !environment.production,
        defaultPageSize: 20
      }
    }
  ]
});
```

Service sử dụng config:

```ts
@Injectable({ providedIn: 'root' })
export class PatientApiService {
  constructor(@Inject(APP_CONFIG) private config: AppConfig) {}

  getPatients() {
    return this.http.get(`${this.config.apiUrl}/patients`);
  }
}
```

Lợi ích:

```text
- Không hard-code config trong service.
- Dễ override khi test.
- Dễ thay config theo environment.
- Service phụ thuộc vào contract rõ ràng.
```

---

### 5.3. Lỗi hay gặp với InjectionToken

Sai:

```ts
export const TOKEN_A = new InjectionToken<string>('API_URL');
export const TOKEN_B = new InjectionToken<string>('API_URL');
```

Dù description đều là `'API_URL'`, đây vẫn là hai object khác nhau.

```text
TOKEN_A !== TOKEN_B
```

Nếu provider dùng `TOKEN_A` nhưng inject `TOKEN_B`, Angular sẽ báo không tìm thấy provider.

Rule:

```text
InjectionToken phải được export từ một nơi dùng chung.
Không tạo lại token mới ở nhiều file khác nhau.
```

---

## 6. Angular DI trong ứng dụng hiện đại

### 6.1. Constructor injection

Cách truyền thống:

```ts
@Injectable()
export class QueueFacade {
  constructor(
    private api: QueueApi,
    private toast: ToastService
  ) {}
}
```

Ưu điểm:

```text
- Nhìn constructor là biết class phụ thuộc vào những gì.
- Dễ review dependency của class.
- Phù hợp với service/facade có dependency rõ ràng.
```

---

### 6.2. `inject()`

Angular hiện đại hỗ trợ `inject()`:

```ts
@Injectable()
export class QueueFacade {
  private api = inject(QueueApi);
  private toast = inject(ToastService);
}
```

`inject()` rất tiện trong:

```text
- Functional guard.
- Functional interceptor.
- Factory provider.
- Field initializer.
- Standalone APIs.
```

Ví dụ functional interceptor:

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);

  const token = tokenService.getToken();

  const authReq = req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`
    }
  });

  return next(authReq);
};
```

Lưu ý:

```ts
function helper() {
  const api = inject(QueueApi); // có thể lỗi nếu không ở injection context
}
```

`inject()` chỉ dùng được trong injection context hợp lệ.

Cách nghĩ:

```text
Constructor injection giúp nhìn dependency rõ hơn.
inject() tiện nhưng nếu lạm dụng, dependency của class bị rải rác và khó review.
```

---

### 6.3. Resolution modifiers

Resolution modifiers giúp kiểm soát cách Angular tìm provider trong injector tree.

#### 6.3.1. `@Optional()`

```ts
constructor(
  @Optional() private logger?: LoggerService
) {}
```

Nếu không có provider, Angular không throw lỗi mà trả `null`.

Dùng khi dependency không bắt buộc.

#### 6.3.2. `@Self()`

```ts
constructor(
  @Self() private control: NgControl
) {}
```

Chỉ tìm provider ở injector hiện tại, không đi lên cha.

Dùng khi muốn chắc chắn dependency phải nằm cùng element/component/directive.

#### 6.3.3. `@SkipSelf()`

```ts
constructor(
  @SkipSelf() private parentForm: ControlContainer
) {}
```

Bỏ qua injector hiện tại, bắt đầu tìm từ injector cha.

Dùng khi component/directive con muốn lấy context từ cha.

#### 6.3.4. `@Host()`

Giới hạn phạm vi tìm kiếm trong host boundary.

Dùng ít hơn, thường gặp trong directive/component composition nâng cao.

---

### 6.4. DI với HTTP Interceptor

Interceptor là ví dụ điển hình của DI và pipeline.

Functional interceptor:

```ts
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const tokenService = inject(TokenService);
  const token = tokenService.getToken();

  return next(
    req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    })
  );
};
```

Provider:

```ts
bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(
      withInterceptors([authInterceptor])
    )
  ]
});
```

Điểm cần nhớ:

```text
Interceptor được đăng ký ở injector nào thì dependency của nó được resolve theo context injector đó.
```

Bug có thể gặp:

```text
- TokenService bị provide lại ở feature, interceptor vẫn dùng root TokenService.
- Auth state có nhiều instance làm header lấy sai token.
- Interceptor phụ thuộc service có side effect quá nặng.
```

---

### 6.5. DI trong standalone Angular

Standalone app thường cấu hình provider tại `bootstrapApplication`:

```ts
bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(),
    provideRouter(routes),
    {
      provide: API_BASE_URL,
      useValue: environment.apiUrl
    }
  ]
});
```

Provider ở đây là app-wide/root-level.

Route-level provider:

```ts
export const routes: Routes = [
  {
    path: 'patient-queue',
    providers: [
      PatientQueueFacade,
      PatientQueueState
    ],
    loadComponent: () =>
      import('./patient-queue.page').then(m => m.PatientQueuePage)
  }
];
```

Component-level provider:

```ts
@Component({
  standalone: true,
  selector: 'app-room-filter',
  providers: [RoomFilterState],
  templateUrl: './room-filter.component.html'
})
export class RoomFilterComponent {}
```

Tư duy phân tầng:

```text
bootstrap providers → app-wide.
route providers     → feature/route-wide.
component providers → local subtree.
```

---

### 6.6. DI trong NgModule Angular cũ

Trong Angular dùng NgModule:

```ts
@NgModule({
  declarations: [AppComponent],
  imports: [BrowserModule],
  providers: [
    AuthService,
    PermissionService
  ],
  bootstrap: [AppComponent]
})
export class AppModule {}
```

Feature module:

```ts
@NgModule({
  providers: [PatientQueueFacade]
})
export class PatientQueueModule {}
```

Cẩn thận với `SharedModule`.

Sai phổ biến:

```ts
@NgModule({
  declarations: [SharedButtonComponent],
  exports: [SharedButtonComponent],
  providers: [SomeStateService]
})
export class SharedModule {}
```

Rule thực tế:

```text
SharedModule chỉ nên chứa component/directive/pipe dùng chung.
Không nên chứa stateful provider.
```

Nếu `SharedModule` được import nhiều nơi, provider trong đó có thể gây hiểu nhầm hoặc tạo scope không như mong muốn.

---

## 7. DI và State Management

### 7.1. DI không phải state management library

DI không phải state management library, nhưng Angular service thường được dùng để giữ state bằng RxJS hoặc Signals.

Điểm quan trọng:

```text
State đặt trong service sẽ có lifetime theo provider scope của service đó.
```

Nói cách khác:

```text
State bằng RxJS hay Signal đều không tự quyết định sống bao lâu.
DI scope mới quyết định service chứa state đó sống bao lâu.
```

---

### 7.2. State service với RxJS

Ví dụ:

```ts
@Injectable()
export class PatientQueueState {
  private roomsSubject = new BehaviorSubject<RoomQueueVm[]>([]);
  rooms$ = this.roomsSubject.asObservable();

  setRooms(rooms: RoomQueueVm[]) {
    this.roomsSubject.next(rooms);
  }
}
```

Nếu state provide ở root:

```text
State sống theo app.
```

Nếu state provide ở route:

```text
State sống theo feature/route.
```

Nếu state provide ở component:

```text
State sống theo component subtree.
```

---

### 7.3. State service với Signals

Ví dụ:

```ts
@Injectable()
export class PatientQueueState {
  private readonly roomsSignal = signal<RoomQueueVm[]>([]);
  readonly rooms = this.roomsSignal.asReadonly();

  setRooms(rooms: RoomQueueVm[]) {
    this.roomsSignal.set(rooms);
  }
}
```

Cách nghĩ vẫn giống RxJS:

```text
Signal nằm trong service.
Service sống theo provider scope.
Vậy signal state cũng sống theo provider scope.
```

---

### 7.4. State service nên sống ở đâu?

Câu hỏi không phải là:

```text
Có inject được không?
```

Câu hỏi đúng là:

```text
State này thuộc app, feature hay component?
```

Nếu là trạng thái đăng nhập:

```ts
@Injectable({ providedIn: 'root' })
export class AuthState {}
```

Nếu là state màn hàng chờ:

```ts
export const routes: Routes = [
  {
    path: 'patient-queue',
    providers: [PatientQueueState],
    loadComponent: () => import('./patient-queue.page').then(m => m.PatientQueuePage)
  }
];
```

Nếu là state của từng modal:

```ts
@Component({
  providers: [CreatePatientModalState]
})
export class CreatePatientModalComponent {}
```

Ghi nhớ:

```text
DI scope quyết định lifetime của state.
State lifetime sai thì bug rất khó nhìn bằng UI.
```

---

## 8. Tư duy thiết kế service với DI

### 8.1. DI không chỉ để inject service

Ở mức cơ bản, DI thường được hiểu là:

```text
Muốn dùng service thì inject vào constructor.
```

Khi thiết kế hoặc review code, DI là công cụ để trả lời:

```text
- Object này sống bao lâu?
- Có bao nhiêu instance?
- State này dùng chung hay riêng?
- Có cần reset khi rời route không?
- Dependency này là contract hay implementation cụ thể?
- Có thể mock dễ trong test không?
- Có làm service bị phụ thuộc vòng tròn không?
- Có đang giấu quá nhiều trách nhiệm trong một service không?
```

Nói cách khác:

```text
DI là công cụ kiểm soát dependency, scope, lifecycle, testability và architecture.
```

---

### 8.2. Không nên có một service khổng lồ

Không nên có một service ôm quá nhiều trách nhiệm:

```ts
@Injectable({ providedIn: 'root' })
export class PatientQueueService {
  // gọi API
  // giữ state
  // subscribe websocket
  // xử lý permission
  // transform DTO
  // show toast
  // navigate
}
```

Vấn đề:

```text
- Khó test.
- Khó đổi implementation.
- Khó kiểm soát lifecycle.
- Dễ circular dependency.
- Component phụ thuộc vào service quá lớn.
- Một thay đổi nhỏ ảnh hưởng nhiều use case.
```

---

### 8.3. Tách service theo trách nhiệm

Nên tách trách nhiệm:

```text
PatientQueueApi
→ chỉ gọi HTTP/API.

PatientQueueState
→ giữ state.

PatientQueueRealtimeHandler
→ nhận websocket event và update state.

PatientQueueFacade
→ phối hợp use case cho component.

PatientQueueMapper
→ map DTO sang ViewModel.
```

Ví dụ:

```ts
@Injectable()
export class PatientQueueFacade {
  private api = inject(PatientQueueApi);
  private state = inject(PatientQueueState);
  private realtime = inject(PatientQueueRealtimeHandler);

  readonly vm$ = this.state.vm$;

  load(roomId: number) {
    return this.api.getQueue(roomId).pipe(
      tap(queue => this.state.setQueue(queue))
    );
  }

  connectRealtime() {
    this.realtime.listen();
  }
}
```

Component chỉ còn:

```ts
@Component({
  selector: 'app-patient-queue',
  templateUrl: './patient-queue.page.html'
})
export class PatientQueuePage {
  facade = inject(PatientQueueFacade);
  vm$ = this.facade.vm$;

  ngOnInit() {
    this.facade.connectRealtime();
  }
}
```

Tư duy tốt:

```text
Component mỏng.
Service có trách nhiệm rõ.
Facade gom use case cho UI.
DI scope quyết định vòng đời.
```

---

### 8.4. Facade nên provide ở đâu?

Facade thường phục vụ một màn hình hoặc một feature, nên không phải lúc nào cũng nên để root.

Nếu facade phục vụ toàn app:

```ts
@Injectable({ providedIn: 'root' })
export class AppSessionFacade {}
```

Nếu facade phục vụ một feature:

```ts
export const routes: Routes = [
  {
    path: 'patient-queue',
    providers: [PatientQueueFacade],
    loadComponent: () => import('./patient-queue.page').then(m => m.PatientQueuePage)
  }
];
```

Nếu facade phục vụ một component instance:

```ts
@Component({
  providers: [CreateOrderWizardFacade]
})
export class CreateOrderWizardComponent {}
```

Rule:

```text
Facade sống theo phạm vi use case mà nó phục vụ.
```

---

## 9. Case Studies

### 9.1. Case Study 1 — Hàng chờ khám bệnh realtime

#### Bài toán

```text
Màn hình theo dõi hàng chờ khám bệnh.
Có nhiều phòng khám.
Mỗi phòng có số đang khám, số đang chờ, trạng thái lượt khám.
Dữ liệu ban đầu lấy từ API.
Sau đó cập nhật realtime qua websocket.
Có filter theo phòng/khoa/trạng thái.
Có modal xem chi tiết bệnh nhân.
```

#### Thiết kế DI đề xuất

```text
Root scope:
- AuthService
- CurrentTenantService
- PermissionService
- WebSocketConnectionService
- AppConfigService

Route/Feature scope:
- PatientQueueFacade
- PatientQueueApi
- PatientQueueState
- PatientQueueRealtimeHandler
- PatientQueueMapper

Component scope:
- RoomFilterState
- LocalTableSelectionState
- PatientDetailModalState
```

#### Lý do chọn scope

```text
WebSocketConnectionService ở root vì connection dùng chung toàn app.
PatientQueueRealtimeHandler ở route vì chỉ xử lý event cho màn hàng chờ.
PatientQueueState ở route vì rời màn nên reset state.
RoomFilterState ở component vì mỗi filter component có state riêng.
```

#### Nếu chọn sai scope

```text
Đưa PatientQueueState lên root
→ rời màn quay lại vẫn giữ filter/data cũ ngoài ý muốn.

Provide WebSocketConnectionService ở component
→ mỗi lần mở màn tạo connection mới.

Provide QueueStateService ở nhiều component khác nhau
→ set data chỗ này, chỗ kia không nhận.
```

---

### 9.2. Case Study 2 — Set data trong service rồi component khác không nhận

#### Bối cảnh

Có service giữ state:

```ts
@Injectable({
  providedIn: 'root'
})
export class QueueStateService {
  private selectedRoomIdSubject = new BehaviorSubject<number | null>(null);
  selectedRoomId$ = this.selectedRoomIdSubject.asObservable();

  selectRoom(roomId: number) {
    this.selectedRoomIdSubject.next(roomId);
  }
}
```

`RoomListComponent` set room:

```ts
this.queueState.selectRoom(10);
```

`RoomDetailComponent` subscribe:

```ts
this.queueState.selectedRoomId$.subscribe(...);
```

Nếu cả hai cùng dùng root instance thì hoạt động bình thường.

#### Nguyên nhân bug

Nếu vô tình khai báo:

```ts
@Component({
  selector: 'app-room-list',
  providers: [QueueStateService],
  templateUrl: './room-list.component.html'
})
export class RoomListComponent {}
```

thì `RoomListComponent` dùng instance riêng, còn `RoomDetailComponent` có thể đang dùng root instance.

Kết quả:

```text
RoomList set data vào instance B.
RoomDetail nghe data từ instance A.
Hai bên không gặp nhau.
```

#### Dấu hiệu nhận biết

```text
- Subject emit nhưng component khác không nhận.
- Cache tưởng đã set nhưng nơi khác lại undefined.
- Console log thấy constructor service chạy nhiều lần.
```

#### Cách debug

```ts
@Injectable({
  providedIn: 'root'
})
export class QueueStateService {
  private id = Math.random();

  constructor() {
    console.log('QueueStateService instance:', this.id);
  }
}
```

Nếu log nhiều instance ngoài ý muốn, cần kiểm tra provider scope.

---

### 9.3. Case Study 3 — WebSocket bị mở nhiều connection

#### Bối cảnh

Một service quản lý websocket:

```ts
@Injectable()
export class WebSocketConnectionService {
  connect() {
    // open websocket connection
  }
}
```

Nếu service này bị provide ở component:

```ts
@Component({
  providers: [WebSocketConnectionService]
})
export class PatientQueuePage {}
```

mỗi lần component được tạo, Angular có thể tạo một instance mới của `WebSocketConnectionService`.

#### Hậu quả

```text
- Mở nhiều websocket connection.
- Server nhận nhiều subscription trùng.
- Client nhận duplicate event.
- Khó cleanup vì mỗi instance quản lý connection riêng.
```

#### Thiết kế tốt hơn

```text
Root scope:
- WebSocketConnectionService quản lý connection chung.

Route/Feature scope:
- PatientQueueRealtimeHandler subscribe/unsubscribe event cho feature.
```

Ví dụ:

```ts
@Injectable({ providedIn: 'root' })
export class WebSocketConnectionService {}
```

```ts
export const routes: Routes = [
  {
    path: 'patient-queue',
    providers: [PatientQueueRealtimeHandler],
    loadComponent: () => import('./patient-queue.page').then(m => m.PatientQueuePage)
  }
];
```

---

### 9.4. Case Study 4 — Filter không reset khi rời màn hình

#### Bối cảnh

Có state lưu filter:

```ts
@Injectable({ providedIn: 'root' })
export class PatientQueueFilterState {
  keyword = '';
  roomId?: number;
}
```

Người dùng vào màn hàng chờ, chọn filter. Sau đó rời màn, quay lại vẫn thấy filter cũ.

#### Có thể đúng hoặc sai tùy nghiệp vụ

Nếu yêu cầu là giữ filter khi quay lại:

```text
Root hoặc cache strategy có thể phù hợp.
```

Nếu yêu cầu là vào màn phải reset filter:

```text
Root scope là chưa phù hợp.
```

#### Thiết kế đề xuất

Nếu filter thuộc màn hàng chờ:

```ts
export const routes: Routes = [
  {
    path: 'patient-queue',
    providers: [PatientQueueFilterState],
    loadComponent: () => import('./patient-queue.page').then(m => m.PatientQueuePage)
  }
];
```

Nếu mỗi filter component cần state riêng:

```ts
@Component({
  providers: [RoomFilterState]
})
export class RoomFilterComponent {}
```

---

### 9.5. Case Study 5 — AuthService và PermissionService bị circular dependency

#### Bối cảnh

```ts
@Injectable()
export class AuthService {
  constructor(private permissionService: PermissionService) {}
}

@Injectable()
export class PermissionService {
  constructor(private authService: AuthService) {}
}
```

Đây là mùi thiết kế.

#### Vấn đề

```text
AuthService biết quá nhiều về PermissionService.
PermissionService lại biết quá nhiều về AuthService.
Hai service khó test độc lập.
Dễ phát sinh lỗi runtime hoặc init order khó hiểu.
```

#### Cách refactor

Tách state chung:

```ts
@Injectable({ providedIn: 'root' })
export class AuthState {
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();

  setUser(user: User | null) {
    this.userSubject.next(user);
  }
}
```

AuthService phụ trách login/logout/load session:

```ts
@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private authState: AuthState) {}
}
```

PermissionService chỉ đọc AuthState để tính quyền:

```ts
@Injectable({ providedIn: 'root' })
export class PermissionService {
  constructor(private authState: AuthState) {}
}
```

Kết quả:

```text
AuthService và PermissionService không còn phụ thuộc trực tiếp lẫn nhau.
Cả hai cùng phụ thuộc vào AuthState nhỏ hơn, rõ trách nhiệm hơn.
```

---

## 10. DI, Memory Leak và Testability

### 10.1. DI và memory leak

DI không tự gây memory leak, nhưng scope sai có thể giữ object sống lâu hơn mong muốn.

Ví dụ:

```ts
@Injectable({
  providedIn: 'root'
})
export class PatientQueueState {
  private selectedPatient = new BehaviorSubject<Patient | null>(null);
}
```

Nếu state chỉ dùng cho một màn hình nhưng để root, dữ liệu có thể sống suốt vòng đời app.

Hoặc:

```ts
@Injectable({
  providedIn: 'root'
})
export class RealtimeService {
  connectRoom(roomId: number) {
    // subscribe websocket room
  }
}
```

Nếu không unsubscribe/leave room đúng cách, root service giữ subscription lâu dài.

Thiết kế tốt hơn:

```text
Root:
- WebSocketConnectionService quản lý connection chung.

Route/Feature:
- PatientQueueRealtimeHandler subscribe event màn hàng chờ.
- Khi feature destroy thì cleanup listener.
```

---

### 10.2. Checklist memory/lifecycle

```text
1. Service có mở websocket/timer/subscription không?
2. Service đó đang ở root hay feature/component?
3. Khi rời màn hình có cleanup không?
4. BehaviorSubject/Signal có giữ object lớn không?
5. Có cache dữ liệu quá lâu không?
6. Có provider nào làm service sống lâu hơn dự kiến không?
```

---

### 10.3. DI và testability

Không có DI:

```ts
export class QueueComponent {
  private api = new RealQueueApi();
}
```

Test khó vì component tự tạo dependency thật.

Có DI:

```ts
export class QueueComponent {
  constructor(private api: QueueApi) {}
}
```

Test có thể override provider:

```ts
TestBed.configureTestingModule({
  providers: [
    {
      provide: QueueApi,
      useValue: {
        getQueue: () => of(mockQueue)
      }
    }
  ]
});
```

DI giúp:

```text
- Mock API.
- Mock config.
- Mock permission.
- Mock current user.
- Mock websocket.
- Test facade/state độc lập.
- Test component không cần gọi API thật.
```

Khi review service nên hỏi:

```text
Service này có dễ mock không?
Component đang phụ thuộc implementation cụ thể hay abstraction?
Có hard-code config thay vì dùng InjectionToken không?
Có service nào tự new dependency khiến test khó không?
```

---

## 11. Checklist và Troubleshooting

### 11.1. Checklist chọn DI scope

Khi tạo service mới, hãy hỏi:

```text
1. Service này có giữ state không?
2. State này dùng chung toàn app hay chỉ một feature?
3. Khi rời màn hình có cần reset không?
4. Nếu render nhiều component cùng loại, chúng dùng chung hay riêng state?
5. Service có mở resource như websocket, timer, subscription không?
6. Service có cache dữ liệu không? Cache sống bao lâu?
7. Có nguy cơ tạo nhiều instance gây bug không?
8. Có cần thay implementation theo environment/test/tenant không?
9. Có nên tách interface/token khỏi implementation không?
10. Có thể dùng InjectionToken cho config không?
11. Có dependency vòng tròn không?
12. Service có đang ôm quá nhiều trách nhiệm không?
```

Gợi ý quyết định:

```text
Auth/session/config/permission
→ root

Feature state/facade/workflow
→ route/feature

Modal/filter/table selection/wizard state
→ component

Implementation có thể thay đổi
→ abstraction + useClass/useFactory

Config/primitive/interface-like value
→ InjectionToken
```

---

### 11.2. Checklist review Angular DI

Khi review code Angular, nhìn các điểm này:

```text
1. Service có đang bị provide sai scope không?
2. Service có giữ state nhưng lại đặt root không?
3. Service global có mở connection/timer/subscription không?
4. Có cleanup khi service/component destroy không?
5. SharedModule có providers không?
6. Lazy route có vô tình tạo instance mới không?
7. Auth/permission/config service có bị provide lại ở feature không?
8. Token có dùng InjectionToken đúng không?
9. Có tạo nhiều InjectionToken cùng description nhưng khác object không?
10. useClass/useExisting có bị nhầm không?
11. Factory provider có quá phức tạp không?
12. Có circular dependency không?
13. Có service nào ôm quá nhiều trách nhiệm không?
14. Component có inject quá nhiều service không?
15. Có thể gom use case qua facade không?
16. Test có dễ override provider không?
17. Có config hard-code thay vì InjectionToken không?
18. Multi provider có cần thứ tự xử lý rõ ràng không?
```

---

### 11.3. Lỗi `NullInjectorError: No provider for X`

Cách nghĩ:

```text
Angular không tìm thấy provider cho token X trong injector tree hiện tại.
```

Kiểm tra:

```text
- X có providedIn chưa?
- X có nằm trong providers chưa?
- Component hiện tại có nhìn thấy provider không?
- Có import nhầm token không?
- InjectionToken có bị tạo lại ở file khác không?
```

---

### 11.4. Service có nhiều instance ngoài ý muốn

Dấu hiệu:

```text
- Constructor service log nhiều lần.
- Set state nơi này, nơi khác không nhận.
- Subject emit nhưng subscriber không thấy.
- WebSocket mở nhiều connection.
- Cache miss khó hiểu.
```

Kiểm tra:

```text
- Service có bị provide ở component không?
- Có bị provide trong lazy module không?
- SharedModule có providers không?
- TestBed có override provider không?
```

---

### 11.5. State không reset khi rời màn hình

Nguyên nhân thường gặp:

```text
Feature state đặt ở root.
```

Cách nghĩ:

```text
Nếu state thuộc màn hình/feature, hãy cân nhắc route-level provider.
```

---

### 11.6. Component inject quá nhiều service

Ví dụ:

```ts
constructor(
  private api: PatientQueueApi,
  private state: PatientQueueState,
  private mapper: PatientQueueMapper,
  private realtime: PatientQueueRealtimeHandler,
  private permission: PermissionService,
  private toast: ToastService,
  private router: Router
) {}
```

Dấu hiệu component đang ôm quá nhiều use case.

Cân nhắc tạo facade:

```ts
constructor(private facade: PatientQueueFacade) {}
```

---

## 12. Tóm tắt và lộ trình học tiếp

### 12.1. Tóm tắt nhanh

```text
Dependency
→ Thứ class cần để hoạt động.

@Injectable()
→ Đánh dấu class có thể tham gia Angular DI.

Provider
→ Cấu hình nói với Angular cách cung cấp dependency.

Injector
→ Nơi lưu provider và resolve dependency.

Token
→ Key để Angular tìm provider.

providedIn: 'root'
→ Đăng ký provider ở root injector, thường dùng chung toàn app.

providers ở component
→ Tạo instance riêng cho component và subtree.

providers ở route/feature
→ Tạo instance scoped theo route/feature.

InjectionToken
→ Dùng khi dependency không có runtime type như interface, config, primitive, array, function.

useClass
→ Token A dùng implementation class B.

useValue
→ Token A trả về value cố định.

useFactory
→ Token A được tạo bằng function có logic.

useExisting
→ Token A là alias tới token B, dùng chung instance.

multi provider
→ Nhiều provider cùng đóng góp vào một token, injector trả về array.

Tư duy thiết kế
→ DI không chỉ để inject service.
→ DI dùng để kiểm soát scope, lifecycle, state lifetime, testability và architecture.
```

---

### 12.2. Cách nói ngắn gọn khi cần giải thích

Một câu trả lời tốt:

> Dependency Injection trong Angular là cơ chế để class không tự tạo dependency, mà khai báo dependency cần dùng; Angular injector sẽ resolve dependency dựa trên provider. Điểm quan trọng của Angular DI là injector có phân cấp, nên cùng một service có thể là instance dùng chung toàn app, scoped theo route/feature, hoặc scoped theo từng component instance. Vì vậy khi thiết kế service, không chỉ hỏi “inject được không”, mà phải hỏi service này nên sống bao lâu, state có dùng chung không, có cần reset khi rời màn hình không, và có cần thay implementation để test hoặc chạy theo environment không.

Câu này thể hiện các ý chính:

```text
- DI.
- Provider.
- Injector hierarchy.
- Scope.
- Lifecycle.
- Testability.
- Architecture.
```

---

### 12.3. Lộ trình học tiếp

Sau DI, nên học tiếp theo thứ tự:

```text
1. Angular component lifecycle.
2. RxJS state trong service.
3. Signals state trong Angular.
4. Facade pattern trong Angular.
5. HTTP Interceptor nâng cao.
6. Route-level providers.
7. Standalone APIs.
8. Angular testing với TestBed.
9. Circular dependency và refactor service.
10. Component architecture và smart/dumb component.
```

---

### 12.4. Kết luận

Nền tảng cần hiểu:

```text
DI giúp class không tự tạo dependency.
@Injectable() đánh dấu class có thể tham gia DI.
Provider đăng ký cách cung cấp dependency.
Injector là nơi Angular tìm và tạo instance.
```

Khi làm dự án thực tế cần hiểu:

```text
Service có thể sống ở root, route hoặc component.
Scope sai có thể tạo nhiều instance hoặc làm state sống quá lâu.
Bug state nhiều khi bắt nguồn từ provider scope.
```

Khi thiết kế/review cần hiểu:

```text
DI là quyết định kiến trúc.
Service nên sống bao lâu?
Có bao nhiêu instance?
State thuộc app, feature hay component?
Có cần reset khi rời route không?
Có dễ mock/test không?
Có bị circular dependency không?
Có đang che giấu service quá nhiều trách nhiệm không?
```

Chốt lại:

> Angular Dependency Injection không chỉ là kỹ thuật inject service vào component. Nó là công cụ kiến trúc để kiểm soát dependency, lifecycle, scope, state lifetime, testability và khả năng mở rộng của ứng dụng Angular.
