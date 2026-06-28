# Angular Dependency Injection

> Mục tiêu: không chỉ biết inject service, mà hiểu cách chọn scope, kiểm soát lifecycle, tránh bug nhiều instance, thiết kế service dễ test và dễ mở rộng.

---

## 1. Dependency Injection là gì?

Dependency Injection, viết tắt là DI, là cơ chế giúp một class không cần tự tạo ra các object mà nó phụ thuộc vào. Thay vào đó, class chỉ khai báo rằng nó cần dependency nào, còn Angular sẽ chịu trách nhiệm tìm, tạo và truyền dependency đó vào.

Ví dụ component cần gọi API lấy danh sách hàng chờ khám bệnh:

```ts
@Component({...})
export class PatientQueueComponent {
  constructor(private queueService: PatientQueueService) {}
}
```

Component chỉ nói:

```text
Tôi cần PatientQueueService.
```

Angular sẽ xử lý:

```text
Ai cung cấp PatientQueueService?
Service này được tạo ở đâu?
Dùng chung toàn app hay mỗi component có một instance riêng?
Có bị override ở feature hoặc component không?
```

DI giúp code:

```text
- Ít phụ thuộc chặt vào implementation cụ thể.
- Dễ mock khi test.
- Dễ thay đổi implementation.
- Kiểm soát được vòng đời object.
- Kiểm soát được state dùng chung hay state riêng.
```

---

## 2. Ba khái niệm lõi trong Angular DI

### 2.1. Dependency

Dependency là thứ một class cần để hoạt động.

```ts
export class PatientQueueComponent {
  constructor(
    private queueService: PatientQueueService,
    private notificationService: NotificationService
  ) {}
}
```

Ở đây `PatientQueueService` và `NotificationService` là dependency.

---

### 2.2. Provider

Provider là cấu hình nói với Angular cách cung cấp dependency.

Nói đơn giản:

```text
Khi ai đó cần token X, hãy trả về class/value/factory Y.
```

Ví dụ:

```ts
@Injectable({
  providedIn: 'root'
})
export class PatientQueueService {}
```

Hoặc:

```ts
@Component({
  selector: 'app-patient-queue',
  providers: [PatientQueueService]
})
export class PatientQueueComponent {}
```

Provider có nhiều dạng:

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

---

### 2.3. Injector

Injector là nơi Angular lưu provider và tạo/trả instance cho dependency.

Mental model:

```text
Component cần A
→ hỏi injector hiện tại
→ injector có provider cho A không?
    Có  → trả instance
    Không → hỏi injector cha
```

Angular DI có tính phân cấp. Đây là điểm rất quan trọng.

```text
Root Injector
 └── Feature/Route Injector
      └── Component Injector
           └── Child Component Injector
```

Khi component cần một service, Angular sẽ tìm từ injector gần nhất rồi đi dần lên cha.

---

## 3. Ví dụ cơ bản nhất

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

Dùng trong component:

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

```ts
providedIn: 'root'
```

Service được đăng ký ở root injector, thường có một instance dùng chung toàn app.

---

## 4. `providedIn: 'root'` không chỉ đơn giản là singleton

Nhiều dev nói:

```text
providedIn: 'root' = singleton
```

Câu này đúng ở mức cơ bản, nhưng nên hiểu chính xác hơn:

```text
Service có một instance trong phạm vi root injector của application instance.
```

Ví dụ:

```ts
@Injectable({
  providedIn: 'root'
})
export class AuthStateService {
  currentUser?: User;
}
```

Tất cả component inject `AuthStateService` sẽ dùng chung một instance.

Phù hợp cho:

```text
- Auth state
- User session
- Global config
- Permission service
- Notification service
- Shared cache
- Current tenant service
```

Không phù hợp nếu service giữ state riêng cho từng màn hình hoặc từng component.

---

## 5. Provider ở Component tạo instance riêng

```ts
@Component({
  selector: 'app-patient-room',
  providers: [RoomQueueStateService],
  templateUrl: './patient-room.component.html'
})
export class PatientRoomComponent {
  constructor(public state: RoomQueueStateService) {}
}
```

Mỗi instance của `PatientRoomComponent` sẽ có một `RoomQueueStateService` riêng.

Ví dụ có 3 phòng khám:

```html
<app-patient-room [roomId]="1"></app-patient-room>
<app-patient-room [roomId]="2"></app-patient-room>
<app-patient-room [roomId]="3"></app-patient-room>
```

Sẽ có 3 instance `RoomQueueStateService`.

Mental model:

```text
providers ở root      → global shared instance
providers ở route     → shared trong route/feature
providers ở component → private instance cho component subtree
```

---

## 6. Hierarchical Injector: phần dễ sai nhất

Ví dụ:

```ts
@Injectable({
  providedIn: 'root'
})
export class QueueStateService {
  selectedRoomId?: number;
}
```

Nếu `RoomListComponent` và `RoomDetailComponent` cùng inject `QueueStateService`, chúng dùng chung instance từ root.

Nhưng nếu khai báo:

```ts
@Component({
  selector: 'app-room-list',
  providers: [QueueStateService],
  template: `...`
})
export class RoomListComponent {}
```

Thì `RoomListComponent` và các component con của nó dùng instance riêng, không còn dùng instance root nữa.

```text
Root Injector
 └── QueueStateService instance A

RoomList ElementInjector
 └── QueueStateService instance B
```

Khi `RoomListComponent` inject:

```text
Tìm ở RoomList injector → thấy B → dùng B
```

Khi `RoomDetailComponent` inject:

```text
Tìm ở RoomDetail injector → không thấy
→ đi lên root → thấy A → dùng A
```

Đây là lý do có bug kiểu:

```text
Tại sao service set data rồi component kia không nhận?
```

Rất có thể service đã bị tạo nhiều instance do provider đặt sai scope.

---

## 7. Các scope provider thường gặp

### 7.1. Root scope

```ts
@Injectable({
  providedIn: 'root'
})
export class PermissionService {}
```

Dùng cho service global:

```text
- AuthService
- PermissionService
- AppConfigService
- ToastService
- LoggerService
- CurrentTenantService
```

---

### 7.2. Component scope

```ts
@Component({
  selector: 'app-search-box',
  providers: [SearchBoxStateService]
})
export class SearchBoxComponent {}
```

Dùng khi mỗi component cần state riêng:

```text
- Modal state
- Wizard form state
- Local filter state
- Tab state
- Component-level cache
- Table selection state
```

---

### 7.3. Route/Feature scope

Với Angular hiện đại, route có thể khai báo provider:

```ts
export const routes: Routes = [
  {
    path: 'patient-queue',
    providers: [PatientQueueFacade],
    loadComponent: () =>
      import('./patient-queue.page').then(m => m.PatientQueuePage)
  }
];
```

Ý nghĩa:

```text
PatientQueueFacade sống trong phạm vi route này.
Khi rời route, instance có thể được giải phóng nếu không còn reference.
```

Dùng tốt cho:

```text
- Feature state
- Feature facade
- Feature-specific API service
- Workflow service
```

---

## 8. Các dạng provider quan trọng

### 8.1. Class Provider — `useClass`

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

Ý nghĩa:

```text
Ai inject QueueApi thì Angular tạo HttpQueueApi.
```

Dùng khi muốn thay implementation:

```text
Production → HttpQueueApi
Mock/Test → MockQueueApi
Offline mode → LocalQueueApi
```

---

### 8.2. Value Provider — `useValue`

```ts
export const API_BASE_URL = new InjectionToken<string>('API_BASE_URL');

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
- Base URL
- Static config
- Feature flags
- Default options
- Constant values
```

---

### 8.3. Factory Provider — `useFactory`

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

```ts
providers: [
  {
    provide: QueueApi,
    useFactory: createQueueApi,
    deps: [EnvironmentService, HttpClient]
  }
]
```

Dùng khi dependency cần logic khởi tạo:

```text
- Theo environment
- Theo tenant
- Theo feature flag
- Theo config runtime
- Theo platform browser/server
```

---

### 8.4. Existing Provider — `useExisting`

```ts
@Injectable()
export class DefaultLoggerService {
  log(message: string) {
    console.log(message);
  }
}
```

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
LoggerService và DefaultLoggerService trỏ tới cùng một instance.
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

Cách trên có thể tạo 2 instance khác nhau.

Senior note:

```text
useExisting = alias đến instance đã có
useClass    = tạo instance theo class được chỉ định
```

---

## 9. InjectionToken

### 9.1. Tại sao cần InjectionToken?

TypeScript interface không tồn tại ở runtime.

Ví dụ:

```ts
export interface AppConfig {
  apiUrl: string;
}
```

Không thể inject trực tiếp interface:

```ts
constructor(private config: AppConfig) {}
```

Vì Angular DI cần token ở runtime.

Cách đúng:

```ts
export interface AppConfig {
  apiUrl: string;
  enableDebug: boolean;
}

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

Dùng InjectionToken khi cần inject:

```text
- Interface-like contract
- Config object
- Primitive value
- Array
- Function
- Plugin list
```

---

### 9.2. Lỗi hay gặp với InjectionToken

Sai:

```ts
export const TOKEN_A = new InjectionToken<string>('API_URL');
export const TOKEN_B = new InjectionToken<string>('API_URL');
```

Dù cùng description `'API_URL'`, đây là 2 object khác nhau.

```text
TOKEN_A !== TOKEN_B
```

Nếu provider dùng `TOKEN_A` nhưng inject `TOKEN_B`, Angular sẽ báo không tìm thấy provider.

---

## 10. Multi Provider

Multi provider cho phép nhiều provider cùng đóng góp vào một token.

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
- Plugin architecture
- Interceptor
- Validator
- Middleware-like processing
- Feature extension point
```

---

## 11. `constructor injection` và `inject()`

Truyền thống:

```ts
@Injectable()
export class QueueFacade {
  constructor(
    private api: QueueApi,
    private toast: ToastService
  ) {}
}
```

Angular hiện đại hỗ trợ `inject()`:

```ts
@Injectable()
export class QueueFacade {
  private api = inject(QueueApi);
  private toast = inject(ToastService);
}
```

Senior note:

```text
constructor injection rõ dependency hơn.
inject() tiện cho functional guard, interceptor, field initializer, factory.
Không nên lạm dụng inject() đến mức class khó nhìn dependency.
```

Ví dụ dễ lỗi:

```ts
function doSomething() {
  const api = inject(QueueApi); // có thể lỗi nếu không ở injection context
}
```

---

## 12. Resolution modifiers

### 12.1. `@Optional()`

```ts
constructor(
  @Optional() private logger?: LoggerService
) {}
```

Nếu không có provider, Angular không throw lỗi mà trả `null`.

Dùng khi dependency không bắt buộc.

---

### 12.2. `@Self()`

```ts
constructor(
  @Self() private control: NgControl
) {}
```

Chỉ tìm provider ở injector hiện tại, không đi lên cha.

Dùng khi muốn chắc chắn dependency phải nằm cùng element/component/directive.

---

### 12.3. `@SkipSelf()`

```ts
constructor(
  @SkipSelf() private parentForm: ControlContainer
) {}
```

Bỏ qua injector hiện tại, bắt đầu tìm từ injector cha.

Dùng khi component con muốn lấy context từ cha.

Ví dụ thực tế:

```text
- Custom form control
- Nested form
- Directive cần parent container
```

---

### 12.4. `@Host()`

Giới hạn phạm vi tìm kiếm trong host boundary.

Dùng ít hơn, nhưng có thể gặp trong directive/component composition nâng cao.

---

## 13. DI với lazy loading và route-level provider

Một lỗi phổ biến:

```text
Service tưởng là singleton nhưng lazy module lại có instance riêng.
```

Ví dụ với NgModule:

```ts
@NgModule({
  providers: [FeatureStateService]
})
export class PatientQueueModule {}
```

Nếu module này lazy-loaded, service nằm trong injector của lazy module/route, không phải root.

Điều này có thể đúng hoặc sai tùy ý đồ.

Đúng nếu:

```text
- Feature cần state riêng
- Khi rời feature muốn reset state
- Không muốn global service phình to
```

Sai nếu:

```text
- Auth state bị tách instance
- Permission cache không đồng bộ
- Global event bus bị duplicate
- WebSocket connection bị mở nhiều lần
```

Middle/Senior cần hỏi:

```text
Service này nên sống theo app, theo feature, theo route, hay theo component instance?
```

---

## 14. DI và state management

DI không phải state management library, nhưng thường được dùng để giữ state.

```ts
@Injectable()
export class PatientQueueState {
  private selectedRoomIdSubject = new BehaviorSubject<number | null>(null);

  selectedRoomId$ = this.selectedRoomIdSubject.asObservable();

  selectRoom(roomId: number) {
    this.selectedRoomIdSubject.next(roomId);
  }
}
```

Nếu provider ở root:

```ts
@Injectable({
  providedIn: 'root'
})
export class PatientQueueState {}
```

State sống toàn app.

Nếu provider ở route:

```ts
{
  path: 'patient-queue',
  providers: [PatientQueueState],
  loadComponent: ...
}
```

State sống trong feature route.

Nếu provider ở component:

```ts
@Component({
  providers: [PatientQueueState]
})
export class PatientQueuePage {}
```

State sống trong component subtree.

Senior mindset:

```text
Bug state Angular nhiều khi không nằm ở RxJS,
mà nằm ở DI scope.
```

---

## 15. DI và HTTP Interceptor

Interceptor là ví dụ điển hình của DI và multi provider.

Functional interceptor:

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
Interceptor đăng ký ở injector nào thì dùng dependency context của injector đó.
```

---

## 16. DI trong standalone Angular

Với standalone app:

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

Trong route:

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

Trong component:

```ts
@Component({
  standalone: true,
  selector: 'app-patient-queue',
  providers: [LocalFilterState],
  templateUrl: './patient-queue.page.html'
})
export class PatientQueuePage {}
```

Tư duy phân tầng:

```text
bootstrap providers → app-wide
route providers     → feature/route-wide
component providers → local subtree
```

---

## 17. DI trong NgModule Angular cũ

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
  providers: [SomeStateService]
})
export class SharedModule {}
```

Rule thực tế:

```text
SharedModule chỉ nên chứa component/directive/pipe dùng chung.
Không nên chứa stateful singleton provider.
```

---

## 18. `providedIn: 'root'` vs `providers: []`

### Nên dùng `providedIn: 'root'` khi:

```text
- Service dùng toàn app
- Không cần config động theo feature
- Muốn tree-shakable
- Không cần override thường xuyên
```

Ví dụ:

```ts
@Injectable({
  providedIn: 'root'
})
export class CurrentUserService {}
```

### Nên dùng `providers: []` khi:

```text
- Muốn control scope rõ ràng
- Muốn instance riêng cho component/route
- Muốn override implementation
- Muốn feature-specific state
```

Ví dụ:

```ts
@Component({
  providers: [WizardStateService]
})
export class CreateOrderWizardComponent {}
```

---

## 19. Bài toán thực tế: hàng chờ khám bệnh

Giả sử màn hình theo dõi hàng chờ:

```text
100 phòng khám
Mỗi phòng có số đang khám, số chờ trước, số của bệnh nhân
App realtime qua websocket
```

Một thiết kế DI hợp lý:

```text
Root scope:
- AuthService
- CurrentTenantService
- WebSocketConnectionService
- AppConfigService

Route scope / Feature scope:
- PatientQueueFacade
- PatientQueueApi
- PatientQueueRealtimeHandler
- PatientQueueState

Component scope:
- RoomFilterState
- LocalTableSelectionState
- ModalState
```

Ví dụ:

```ts
@Injectable({
  providedIn: 'root'
})
export class WebSocketConnectionService {}
```

Vì connection toàn app nên để root.

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

Vì state hàng chờ chỉ phục vụ feature này.

```ts
@Component({
  selector: 'app-room-filter',
  providers: [RoomFilterState],
  templateUrl: './room-filter.component.html'
})
export class RoomFilterComponent {}
```

Vì filter là local state.

Đánh giá Senior:

```text
Không đưa mọi service vào root.
Không đưa mọi state vào component.
Chọn scope theo vòng đời dữ liệu.
```

---

## 20. Checklist chọn DI scope

Khi tạo service mới, hãy hỏi:

```text
1. Service này có giữ state không?
2. State này dùng chung toàn app hay chỉ một feature?
3. Khi rời màn hình có cần reset không?
4. Có nguy cơ tạo nhiều instance gây bug không?
5. Service có mở resource như WebSocket, timer, subscription không?
6. Có cần thay implementation theo environment/test/tenant không?
7. Có cần mock dễ trong unit test không?
8. Có dependency vòng tròn không?
9. Có nên tách interface/token khỏi implementation không?
10. Có thể dùng InjectionToken cho config không?
```

---

## 21. Các lỗi DI thường gặp

### 21.1. `NullInjectorError: No provider for X`

Nguyên nhân:

```text
- Chưa khai báo provider
- Import nhầm token
- Token khác identity
- Service không có @Injectable
- Provider nằm ở scope không nhìn thấy được
```

---

### 21.2. Có nhiều instance ngoài ý muốn

Dấu hiệu:

```text
- Set data trong service A rồi component khác không thấy
- Subject emit nhưng nơi khác không nhận
- Cache bị miss khó hiểu
- WebSocket mở nhiều connection
```

Nguyên nhân thường gặp:

```text
- Service bị provide ở component
- Service bị provide ở lazy module
- SharedModule provide stateful service
- TestBed override provider
```

---

### 21.3. Circular dependency

Ví dụ:

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

Mùi thiết kế:

```text
Hai service biết quá nhiều về nhau.
```

Cách xử lý:

```text
- Tách abstraction
- Tách state chung
- Đưa logic phối hợp sang facade
- Dùng event/stream thay vì gọi trực tiếp hai chiều
```

---

### 21.4. Inject interface

Sai:

```ts
constructor(private config: AppConfig) {}
```

Đúng:

```ts
constructor(@Inject(APP_CONFIG) private config: AppConfig) {}
```

Vì interface không tồn tại ở runtime.

---

### 21.5. `inject()` ngoài injection context

Sai:

```ts
export function helper() {
  const service = inject(MyService);
}
```

Đúng hơn:

```ts
export function createHelper(service: MyService) {
  return ...;
}
```

Hoặc chỉ dùng `inject()` trong context hợp lệ như service, component field initializer, factory, interceptor, guard.

---

## 22. DI và testability

Không có DI:

```ts
export class QueueComponent {
  private api = new RealQueueApi();
}
```

Test khó vì component tự tạo dependency.

Có DI:

```ts
providers: [
  {
    provide: QueueApi,
    useClass: MockQueueApi
  }
]
```

Test:

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
- Mock API
- Mock config
- Mock permission
- Mock current user
- Mock websocket
- Test state/facade độc lập
```

---

## 23. Tư duy thiết kế Service theo DI

Không nên có một service khổng lồ:

```ts
PatientQueueService
- gọi API
- giữ state
- subscribe websocket
- xử lý permission
- transform DTO
- show toast
- navigate
```

Nên tách:

```text
PatientQueueApi
→ chỉ gọi HTTP

PatientQueueState
→ giữ state

PatientQueueRealtimeHandler
→ nhận websocket event và update state

PatientQueueFacade
→ phối hợp use case cho component

PatientQueueMapper
→ map DTO sang ViewModel
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
@Component({...})
export class PatientQueuePage {
  facade = inject(PatientQueueFacade);
  vm$ = this.facade.vm$;

  ngOnInit() {
    this.facade.connectRealtime();
  }
}
```

Tư duy gần Senior hơn:

```text
Component mỏng.
Service có trách nhiệm rõ.
DI scope quyết định vòng đời.
Facade gom use case cho UI.
```

---

## 24. DI và memory leak

DI không tự gây leak, nhưng scope sai có thể giữ object sống lâu hơn mong muốn.

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
Connection service ở root
Feature realtime handler ở route/component scope
Khi feature destroy thì cleanup listener
```

---

## 25. Khi nào dùng DI nâng cao?

### Dùng `InjectionToken` khi:

```text
- Inject config
- Inject interface-like contract
- Inject primitive value
- Inject array/plugin
- Inject function
```

### Dùng `useClass` khi:

```text
- Thay implementation
- Mock service
- Chọn class cụ thể cho abstraction
```

### Dùng `useFactory` khi:

```text
- Cần logic khởi tạo
- Phụ thuộc environment/runtime config
- Cần chọn implementation động
```

### Dùng `useExisting` khi:

```text
- Muốn alias token này sang token khác
- Muốn nhiều abstraction dùng chung một instance
```

### Dùng `multi: true` khi:

```text
- Có nhiều handler/plugin/interceptor/validator cùng đóng góp vào một pipeline
```

### Dùng component provider khi:

```text
- Mỗi component instance cần state riêng
- Modal/wizard/filter/table selection
```

### Dùng route provider khi:

```text
- Feature cần state riêng
- Rời feature thì reset
- Không muốn global service phình to
```

---

## 26. Senior checklist khi review Angular DI

Khi review code Angular, hãy nhìn các điểm này:

```text
1. Service có đang bị provided sai scope không?
2. Service có giữ state nhưng lại đặt root không?
3. Service global có mở connection/timer/subscription không?
4. SharedModule có providers không?
5. Lazy route có vô tình tạo instance mới không?
6. Token có dùng InjectionToken đúng không?
7. useClass/useExisting có bị nhầm không?
8. Factory provider có quá phức tạp không?
9. Có circular dependency không?
10. Có service nào ôm quá nhiều trách nhiệm không?
11. Component có inject quá nhiều service không?
12. Có thể gom use case qua facade không?
13. Test có dễ override provider không?
14. Có config hard-code thay vì InjectionToken không?
15. Có multi provider nào cần thứ tự xử lý rõ ràng không?
```

---

## 27. Cách nói trong phỏng vấn

Một câu trả lời tốt:

> Dependency Injection trong Angular là cơ chế để class không tự tạo dependency, mà khai báo dependency cần dùng; Angular injector sẽ resolve dependency dựa trên provider. Điểm quan trọng của Angular DI là injector có phân cấp, nên cùng một service có thể là singleton toàn app, scoped theo route/feature, hoặc scoped theo component instance. Vì vậy khi thiết kế service, em không chỉ hỏi “inject được không”, mà hỏi service này nên sống bao lâu, state có dùng chung không, có cần reset khi rời màn hình không, và có cần thay implementation để test hoặc chạy theo environment không.

Câu này thể hiện bạn hiểu:

```text
- DI
- Provider
- Injector hierarchy
- Scope
- Lifecycle
- Testability
- Architecture
```

---

## 28. Tóm tắt nhanh để note

```text
Dependency = thứ class cần để hoạt động.

Provider = cấu hình nói với Angular cách tạo/trả dependency.

Injector = nơi lưu provider và resolve dependency.

Angular DI là hierarchical:
Component hỏi injector gần nhất trước,
không thấy thì đi lên injector cha.

providedIn: 'root':
Service dùng chung toàn app, thường là singleton trong root injector.

providers ở component:
Tạo instance riêng cho component và subtree.

providers ở route/feature:
Tạo service scoped theo feature/route.

InjectionToken:
Dùng khi dependency không có runtime type như interface, config, primitive, array, function.

useClass:
Token A dùng implementation class B.

useValue:
Token A trả về value cố định.

useFactory:
Token A được tạo bằng function có logic.

useExisting:
Token A là alias tới token B, dùng chung instance.

multi provider:
Nhiều provider cùng đóng góp vào một token, injector trả về array.

Senior mindset:
DI không chỉ để inject service.
DI dùng để kiểm soát scope, lifecycle, testability, architecture, và khả năng thay implementation.
```

---

## 29. Lộ trình học tiếp

Sau DI, nên học tiếp theo thứ tự:

```text
1. Angular Injector Hierarchy
2. Service scope và state lifetime
3. RxJS state trong service
4. Facade pattern trong Angular
5. HTTP Interceptor + DI
6. InjectionToken nâng cao
7. Route-level providers
8. Standalone APIs
9. DI trong testing
10. Circular dependency và cách refactor
```

---

## 30. Kết luận

Middle thường biết cách inject service vào component.

Senior cần hiểu sâu hơn:

```text
Service này nên provide ở đâu?
Nó sống bao lâu?
Có bao nhiêu instance?
State của nó là global, feature-level hay component-level?
Có cần reset khi rời màn hình không?
Có cần thay implementation để test hoặc chạy theo environment không?
Có nguy cơ circular dependency không?
```

Chốt lại:

> Dependency Injection trong Angular không chỉ là kỹ thuật inject service. Nó là công cụ kiến trúc để kiểm soát dependency, lifecycle, scope, state, testability và khả năng mở rộng của ứng dụng.
