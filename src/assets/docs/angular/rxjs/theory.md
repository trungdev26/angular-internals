# RxJS trong Angular từ cơ bản đến nâng cao

Tài liệu này hướng tới Angular developer muốn đi từ mức dùng được RxJS đến mức thiết kế được async flow trong production. Trọng tâm không phải học thuộc operator, mà là hiểu khi nào dùng operator nào, cách tránh lỗi race condition, memory leak, nested subscribe, cache sai và data flow khó maintain.

Các ví dụ dùng RxJS 7 và Angular 17.

---

## 1. Vì sao Angular dùng RxJS?

Frontend có rất nhiều nguồn dữ liệu bất đồng bộ:

```text
- User click, input, scroll
- HTTP request
- Route params, query params
- Form valueChanges
- WebSocket / SignalR
- Timer, polling
- Dialog result
- Store/state thay đổi
```

RxJS giúp biểu diễn các nguồn này thành stream.

```text
Stream = chuỗi giá trị theo thời gian
```

Ví dụ search box:

```text
User gõ:   a ---- an ---- ang ---- angu
API gọi:         search("angu")
UI nhận:                         result
```

Nếu viết imperative thuần, logic dễ rơi vào callback/nested subscribe. Với RxJS, mình mô tả luồng:

```text
input value
-> debounce
-> bỏ value trùng
-> gọi API mới nhất
-> render kết quả
```

---

## 2. Observable là gì?

### 2.1. Observable là nguồn phát dữ liệu

```ts
const numbers$ = new Observable<number>(subscriber => {
  subscriber.next(1);
  subscriber.next(2);
  subscriber.next(3);
  subscriber.complete();
});
```

Subscribe để nhận dữ liệu:

```ts
numbers$.subscribe({
  next: value => console.log(value),
  complete: () => console.log('done')
});
```

Kết quả:

```text
1
2
3
done
```

### 2.2. Observable có 3 loại tín hiệu

```text
next(value)
-> phát giá trị

error(err)
-> stream lỗi và kết thúc

complete()
-> stream hoàn thành
```

Một Observable có thể:

```text
- phát 1 giá trị rồi complete: HTTP request
- phát nhiều giá trị rồi complete: from([1, 2, 3])
- phát nhiều giá trị và không complete: DOM events, form valueChanges, route params
- error: API lỗi, custom stream lỗi
```

### 2.3. Quy ước đặt tên `$`

Trong Angular, biến Observable thường có hậu tố `$`:

```ts
patients$: Observable<Patient[]>;
loading$: Observable<boolean>;
keyword$: Observable<string>;
```

Quy ước này giúp đọc code nhanh:

```text
patients  -> giá trị hiện tại
patients$ -> stream phát ra patients theo thời gian
```

---

## 3. Observable, Observer, Subscription

### 3.1. Observer

Observer là object nhận dữ liệu:

```ts
const observer = {
  next: (value: number) => console.log(value),
  error: (err: unknown) => console.error(err),
  complete: () => console.log('complete')
};

numbers$.subscribe(observer);
```

### 3.2. Subscription

`subscribe()` trả về `Subscription`. Gọi `unsubscribe()` để ngừng nhận dữ liệu.

```ts
const sub = interval(1000).subscribe(value => {
  console.log(value);
});

sub.unsubscribe();
```

Với stream không tự complete như `interval`, DOM event, `valueChanges`, route params, nếu subscribe thủ công mà không unsubscribe thì dễ memory leak.

### 3.3. Cold và hot Observable

Cold Observable bắt đầu chạy khi có subscribe:

```ts
const request$ = this.http.get('/api/patients');

request$.subscribe(); // gọi API lần 1
request$.subscribe(); // gọi API lần 2
```

HTTP Observable trong Angular là cold. Mỗi subscribe thường tạo request mới.

Hot Observable chia sẻ cùng một nguồn phát:

```text
DOM click event
Form valueChanges
Subject
WebSocket
```

Tư duy cần nhớ:

```text
Cold: mỗi subscriber có execution riêng.
Hot: nhiều subscriber nghe cùng một nguồn.
```

---

## 4. Pipe và operator

### 4.1. pipe là gì?

`pipe()` cho phép nối nhiều operator để biến đổi stream.

```ts
this.keyword$
  .pipe(
    debounceTime(300),
    distinctUntilChanged(),
    switchMap(keyword => this.api.search(keyword))
  )
  .subscribe(result => {
    this.result = result;
  });
```

Đọc từ trên xuống:

```text
keyword
-> chờ user ngừng gõ 300ms
-> bỏ qua nếu giống value trước
-> gọi API search
-> nhận result
```

### 4.2. Operator là hàm biến đổi stream

```text
map
-> đổi value này thành value khác

filter
-> chỉ cho value thỏa điều kiện đi tiếp

tap
-> side effect, không đổi value

switchMap / mergeMap / concatMap / exhaustMap
-> nhận value, chuyển sang Observable khác

catchError
-> xử lý lỗi

shareReplay
-> chia sẻ kết quả cho nhiều subscriber
```

---

## 5. Nhóm operator nền tảng

### 5.1. map

Biến đổi từng value.

```ts
of(1, 2, 3)
  .pipe(map(x => x * 10))
  .subscribe(console.log);
```

Kết quả:

```text
10
20
30
```

Trong Angular:

```ts
patientsVm$ = this.api.getPatients().pipe(
  map(patients =>
    patients.map(patient => ({
      id: patient.id,
      displayName: `${patient.code} - ${patient.fullName}`,
      isWarning: patient.debt > 0
    }))
  )
);
```

### 5.2. filter

Chỉ cho value hợp lệ đi tiếp.

```ts
this.route.paramMap
  .pipe(
    map(params => params.get('id')),
    filter((id): id is string => !!id)
  )
  .subscribe(id => {
    this.load(id);
  });
```

### 5.3. tap

Dùng cho side effect như log, set loading, tracking.

```ts
this.api.getPatients().pipe(
  tap(() => console.log('loaded patients'))
);
```

Không nên dùng `tap` để biến đổi dữ liệu chính. Nếu cần transform, dùng `map`.

### 5.4. distinctUntilChanged

Bỏ value trùng liên tiếp.

```ts
this.searchControl.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged()
);
```

Với object, mặc định so sánh reference:

```ts
distinctUntilChanged((a, b) => a.keyword === b.keyword && a.page === b.page)
```

### 5.5. startWith

Phát giá trị ban đầu trước khi stream thật emit.

```ts
keyword$ = this.searchControl.valueChanges.pipe(
  startWith(this.searchControl.value ?? '')
);
```

Hay dùng với form/control để load dữ liệu lần đầu.

### 5.6. debounceTime và throttleTime

`debounceTime`: chờ yên một khoảng rồi mới phát.

```ts
this.searchControl.valueChanges.pipe(
  debounceTime(300)
);
```

Phù hợp search input.

`throttleTime`: phát value đầu, sau đó chặn trong một khoảng.

```ts
fromEvent(window, 'scroll').pipe(
  throttleTime(100)
);
```

Phù hợp scroll/mousemove nếu chỉ cần sampling.

---

## 6. Higher-order Observable

### 6.1. Vấn đề

Khi một stream phát ra value, và mỗi value lại cần gọi API, ta có stream lồng stream.

```text
keyword$
-> mỗi keyword tạo ra http.get(...)
-> Observable<Observable<Result>>
```

Các operator như `switchMap`, `mergeMap`, `concatMap`, `exhaustMap` dùng để flatten stream lồng nhau.

### 6.2. switchMap

Hủy request cũ, chỉ giữ request mới nhất.

```ts
results$ = this.searchControl.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged(),
  switchMap(keyword => this.api.searchPatients(keyword))
);
```

Phù hợp:

```text
- Search box
- Route params đổi load detail
- Query params đổi load list
- Typeahead/autocomplete
```

Vì sao quan trọng?

```text
User gõ "a" -> API A chậm
User gõ "an" -> API B nhanh

Nếu không hủy A, kết quả A có thể về sau và ghi đè kết quả B.
switchMap giúp chỉ lấy request mới nhất.
```

### 6.3. mergeMap

Chạy song song nhiều inner Observable.

```ts
from(selectedIds).pipe(
  mergeMap(id => this.api.deletePatient(id))
);
```

Phù hợp:

```text
- Gửi nhiều request độc lập
- Không cần giữ thứ tự
- Không muốn cancel request cũ
```

Cẩn thận: nếu source emit quá nhanh, `mergeMap` có thể tạo quá nhiều request cùng lúc.

Giới hạn concurrency:

```ts
from(ids).pipe(
  mergeMap(id => this.api.syncItem(id), 3)
);
```

### 6.4. concatMap

Chạy lần lượt, giữ thứ tự.

```ts
from(commands).pipe(
  concatMap(command => this.api.saveCommand(command))
);
```

Phù hợp:

```text
- Queue save
- Các request phụ thuộc thứ tự
- Audit log
- Gửi command không được đảo thứ tự
```

Nhược điểm: request sau phải chờ request trước xong.

### 6.5. exhaustMap

Bỏ qua value mới trong khi request hiện tại chưa xong.

```ts
submit$ = fromEvent(this.submitButton.nativeElement, 'click').pipe(
  exhaustMap(() => this.api.submitForm(this.form.getRawValue()))
);
```

Phù hợp:

```text
- Submit button chống double click
- Login
- Thanh toán
- Action không muốn chạy song song
```

Nếu user click liên tục, request đầu tiên chạy, click sau bị bỏ qua cho đến khi request xong.

### 6.6. Bảng chọn nhanh

| Operator | Khi source emit value mới | Dùng khi |
|---|---|---|
| `switchMap` | Hủy cái cũ, lấy cái mới | Search, route/query params, latest data |
| `mergeMap` | Chạy song song | Request độc lập, bulk action |
| `concatMap` | Xếp hàng, chạy tuần tự | Save theo thứ tự, queue command |
| `exhaustMap` | Đang chạy thì bỏ value mới | Submit, login, chống double click |

Câu nhớ:

```text
switchMap = latest wins
mergeMap = parallel
concatMap = queue
exhaustMap = ignore while busy
```

---

## 7. Combining streams

### 7.1. combineLatest

Phát khi bất kỳ stream nào đổi, sau khi tất cả stream đã có ít nhất một value.

```ts
query$ = combineLatest([
  this.keywordControl.valueChanges.pipe(startWith('')),
  this.statusControl.valueChanges.pipe(startWith('all')),
  this.page$.pipe(startWith(1))
]).pipe(
  map(([keyword, status, page]) => ({ keyword, status, page }))
);
```

Phù hợp filter list.

### 7.2. withLatestFrom

Source chính emit thì lấy thêm value mới nhất từ stream phụ.

```ts
saveClick$.pipe(
  withLatestFrom(this.formValue$),
  switchMap(([_, value]) => this.api.save(value))
);
```

Khác `combineLatest`:

```text
combineLatest:
Bất kỳ stream nào đổi cũng emit.

withLatestFrom:
Chỉ source chính emit mới phát.
```

### 7.3. forkJoin

Chờ tất cả Observable complete, rồi phát kết quả cuối.

```ts
forkJoin({
  patient: this.api.getPatient(id),
  visits: this.api.getVisits(id),
  insurances: this.api.getInsurances(id)
}).subscribe(data => {
  this.data = data;
});
```

Phù hợp gọi nhiều HTTP request độc lập và cần tất cả xong.

Không phù hợp với stream không complete như `valueChanges`, `interval`.

### 7.4. zip

Ghép value theo cặp cùng thứ tự.

```ts
zip(names$, ages$).subscribe(([name, age]) => {});
```

Ít dùng hơn `combineLatest` trong Angular app, nhưng hữu ích khi cần pairing chính xác.

---

## 8. Error handling

### 8.1. catchError

```ts
patients$ = this.api.getPatients().pipe(
  catchError(error => {
    this.message.error('Không tải được danh sách');
    return of([]);
  })
);
```

`catchError` phải return một Observable mới.

### 8.2. Đặt catchError ở đâu?

Vị trí `catchError` rất quan trọng.

Sai trong search:

```ts
results$ = this.keyword$.pipe(
  switchMap(keyword => this.api.search(keyword)),
  catchError(() => of([]))
);
```

Nếu API lỗi, toàn bộ `results$` có thể kết thúc, search sau không chạy tiếp như mong đợi.

Tốt hơn:

```ts
results$ = this.keyword$.pipe(
  switchMap(keyword =>
    this.api.search(keyword).pipe(
      catchError(() => of([]))
    )
  )
);
```

Lỗi của từng request được xử lý bên trong inner stream, source `keyword$` vẫn sống.

### 8.3. retry

```ts
this.api.getReport().pipe(
  retry(2),
  catchError(error => {
    this.message.error('Không tải được báo cáo');
    return EMPTY;
  })
);
```

Không retry bừa với request tạo dữ liệu như submit/payment nếu backend không idempotent.

### 8.4. EMPTY, NEVER, throwError

```text
EMPTY
-> complete ngay, không emit value

NEVER
-> không emit, không complete

throwError
-> tạo stream lỗi
```

Trong guard/resolver, `EMPTY` có thể làm navigation treo hoặc cancel khó hiểu nếu dùng sai. Thường nên return value rõ ràng, `UrlTree`, hoặc xử lý error cụ thể.

---

## 9. Subject, BehaviorSubject, ReplaySubject

### 9.1. Subject

`Subject` vừa là Observable vừa là Observer.

```ts
private refreshSubject = new Subject<void>();
refresh$ = this.refreshSubject.asObservable();

refresh(): void {
  this.refreshSubject.next();
}
```

Phù hợp cho event nội bộ.

### 9.2. BehaviorSubject

Giữ giá trị hiện tại và phát ngay cho subscriber mới.

```ts
private userSubject = new BehaviorSubject<User | null>(null);
user$ = this.userSubject.asObservable();

setUser(user: User | null): void {
  this.userSubject.next(user);
}
```

Phù hợp cho state có current value như user, selected branch, theme, filters.

### 9.3. ReplaySubject

Replay lại N value gần nhất cho subscriber mới.

```ts
const logs$ = new ReplaySubject<string>(3);
```

Ít dùng hơn `BehaviorSubject` trong app state thường ngày. Cẩn thận replay quá nhiều gây tốn memory.

### 9.4. Không expose Subject trực tiếp

Không nên:

```ts
user$ = new BehaviorSubject<User | null>(null);
```

Vì component bên ngoài có thể `.next()` lung tung.

Nên:

```ts
private userSubject = new BehaviorSubject<User | null>(null);
user$ = this.userSubject.asObservable();
```

Service kiểm soát cách state thay đổi.

---

## 10. Angular pattern: async pipe

### 10.1. Vì sao nên dùng async pipe?

```html
<ng-container *ngIf="patients$ | async as patients">
  <app-patient-table [patients]="patients"></app-patient-table>
</ng-container>
```

`async pipe` giúp:

```text
- subscribe tự động
- unsubscribe khi component destroy
- markForCheck khi value mới đến
- code component gọn hơn
```

### 10.2. Tránh subscribe chỉ để gán field

Không tốt:

```ts
patients: Patient[] = [];

ngOnInit(): void {
  this.api.getPatients().subscribe(patients => {
    this.patients = patients;
  });
}
```

Tốt hơn:

```ts
patients$ = this.api.getPatients();
```

Template:

```html
<app-patient-table [patients]="patients$ | async"></app-patient-table>
```

Subscribe thủ công vẫn cần trong một số case side effect rõ ràng, nhưng default nên nghĩ đến `async pipe`.

### 10.3. ViewModel stream

Senior Angular thường gom state màn hình thành `vm$`.

```ts
vm$ = combineLatest({
  patients: this.patients$,
  loading: this.loading$,
  error: this.error$
}).pipe(
  map(({ patients, loading, error }) => ({
    patients,
    loading,
    error,
    hasData: patients.length > 0
  }))
);
```

Template:

```html
<ng-container *ngIf="vm$ | async as vm">
  <nz-alert *ngIf="vm.error" nzType="error" [nzMessage]="vm.error"></nz-alert>
  <app-loading *ngIf="vm.loading"></app-loading>
  <app-patient-table *ngIf="vm.hasData" [patients]="vm.patients"></app-patient-table>
</ng-container>
```

Lợi ích:

```text
- Template ít async pipe rải rác
- State màn hình rõ
- Dễ test transform
- Dễ chuyển sang OnPush
```

---

## 11. Angular pattern: search list production

### 11.1. Bài toán

Màn hình list có:

```text
- keyword
- status
- page
- pageSize
- loading
- error
- refresh button
```

### 11.2. Query stream

```ts
private refreshSubject = new Subject<void>();

keyword$ = this.keywordControl.valueChanges.pipe(
  startWith(this.keywordControl.value ?? ''),
  debounceTime(300),
  distinctUntilChanged()
);

status$ = this.statusControl.valueChanges.pipe(
  startWith(this.statusControl.value ?? 'all'),
  distinctUntilChanged()
);

page$ = this.pageSubject.asObservable().pipe(startWith(1));

query$ = combineLatest([this.keyword$, this.status$, this.page$]).pipe(
  map(([keyword, status, page]) => ({ keyword, status, page })),
  distinctUntilChanged((a, b) =>
    a.keyword === b.keyword &&
    a.status === b.status &&
    a.page === b.page
  )
);
```

### 11.3. Load data

```ts
result$ = combineLatest([
  this.query$,
  this.refreshSubject.pipe(startWith(void 0))
]).pipe(
  switchMap(([query]) =>
    this.api.searchPatients(query).pipe(
      map(data => ({ data, loading: false, error: null as string | null })),
      startWith({ data: null, loading: true, error: null }),
      catchError(() => of({ data: null, loading: false, error: 'Không tải được dữ liệu' }))
    )
  ),
  shareReplay({ bufferSize: 1, refCount: true })
);
```

### 11.4. Vì sao dùng switchMap?

Search/filter/page đổi thì request cũ không còn đáng tin. `switchMap` đảm bảo latest query thắng.

```text
Query cũ chậm về sau
-> bị hủy/ignore
-> không ghi đè result mới
```

---

## 12. Angular pattern: route params load detail

```ts
patient$ = this.route.paramMap.pipe(
  map(params => params.get('id')),
  filter((id): id is string => !!id),
  distinctUntilChanged(),
  switchMap(id =>
    this.api.getPatient(id).pipe(
      catchError(() => of(null))
    )
  ),
  shareReplay({ bufferSize: 1, refCount: true })
);
```

Vì sao không chỉ dùng snapshot?

```text
/patients/1 -> /patients/2
Angular có thể reuse component instance.
paramMap emit lại, ngOnInit không chạy lại.
```

Vì sao `switchMap`?

```text
Nếu user chuyển detail nhanh, chỉ detail mới nhất nên được render.
```

---

## 13. Angular pattern: Reactive Form

### 13.1. Tính field phụ thuộc field khác

```ts
total$ = combineLatest([
  this.form.get('quantity')!.valueChanges.pipe(startWith(this.form.get('quantity')!.value)),
  this.form.get('price')!.valueChanges.pipe(startWith(this.form.get('price')!.value))
]).pipe(
  map(([quantity, price]) => (quantity || 0) * (price || 0))
);
```

Nếu cần patch vào field `total`:

```ts
this.total$
  .pipe(takeUntilDestroyed(this.destroyRef))
  .subscribe(total => {
    this.form.patchValue({ total }, { emitEvent: false });
  });
```

`emitEvent: false` tránh loop nếu `total` cũng nằm trong `form.valueChanges`.

### 13.2. Async validator có debounce

```ts
export function usernameAvailableValidator(api: UserApiService): AsyncValidatorFn {
  return control => {
    return timer(300).pipe(
      switchMap(() => api.isUsernameAvailable(control.value)),
      map(isAvailable => (isAvailable ? null : { usernameTaken: true })),
      catchError(() => of(null))
    );
  };
}
```

Nếu validator gọi API liên tục theo từng phím, cân nhắc `updateOn: 'blur'`.

---

## 14. Unsubscribe và memory leak

### 14.1. Stream nào thường tự complete?

```text
HTTP request
-> complete sau khi response về

MatDialog/NzModal afterClose
-> thường complete sau khi đóng
```

### 14.2. Stream nào thường không tự complete?

```text
FormControl.valueChanges
ActivatedRoute.paramMap/queryParamMap
fromEvent
interval/timer lặp
Subject sống trong service
WebSocket
```

### 14.3. takeUntilDestroyed

Angular mới có `takeUntilDestroyed`.

```ts
constructor(private destroyRef: DestroyRef) {}

ngOnInit(): void {
  this.form.valueChanges
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe(value => {
      this.saveDraft(value);
    });
}
```

### 14.4. destroy$ pattern

```ts
private destroy$ = new Subject<void>();

ngOnInit(): void {
  this.form.valueChanges
    .pipe(takeUntil(this.destroy$))
    .subscribe();
}

ngOnDestroy(): void {
  this.destroy$.next();
  this.destroy$.complete();
}
```

### 14.5. Khi nào không cần unsubscribe thủ công?

```text
- Dùng async pipe trong template
- HTTP subscribe một lần và complete
- Observable được framework đảm bảo complete
```

Dù vậy, trong code review nên hỏi:

```text
Stream này có complete không?
Component có bị destroy/recreate nhiều lần không?
Subscribe này có side effect gì không?
```

---

## 15. shareReplay và cache

### 15.1. Vấn đề nhiều subscribe gọi API nhiều lần

```ts
patients$ = this.api.getPatients();
```

Nếu template hoặc service subscribe nhiều nơi, HTTP có thể chạy nhiều lần.

### 15.2. shareReplay

```ts
patients$ = this.api.getPatients().pipe(
  shareReplay({ bufferSize: 1, refCount: true })
);
```

Ý nghĩa:

```text
bufferSize: 1
-> giữ lại value mới nhất

refCount: true
-> khi không còn subscriber, unsubscribe source
```

### 15.3. Cache có invalidation

Cache mà không có cách refresh dễ stale.

```ts
private refreshSubject = new Subject<void>();

patients$ = this.refreshSubject.pipe(
  startWith(void 0),
  switchMap(() => this.api.getPatients()),
  shareReplay({ bufferSize: 1, refCount: true })
);

refresh(): void {
  this.refreshSubject.next();
}
```

### 15.4. Cẩn thận với shareReplay không refCount

```ts
shareReplay(1)
```

Cú pháp này có thể giữ subscription lâu hơn mong muốn trong một số case. Trong app Angular, nên explicit:

```ts
shareReplay({ bufferSize: 1, refCount: true })
```

Không phải lúc nào `refCount: true` cũng đúng tuyệt đối, nhưng nó làm intent rõ hơn và tránh nhiều lỗi leak/cache ngầm.

---

## 16. Loading, error, empty state

### 16.1. Không chỉ trả data

Production UI cần biết:

```text
- loading không?
- có lỗi không?
- data rỗng không?
- có đang refresh không?
```

### 16.2. Result state pattern

```ts
type LoadState<T> =
  | { status: 'loading'; data: T | null; error: null }
  | { status: 'success'; data: T; error: null }
  | { status: 'error'; data: T | null; error: string };
```

Stream:

```ts
patientsState$ = this.query$.pipe(
  switchMap(query =>
    this.api.searchPatients(query).pipe(
      map(data => ({ status: 'success', data, error: null } as const)),
      startWith({ status: 'loading', data: null, error: null } as const),
      catchError(() =>
        of({ status: 'error', data: null, error: 'Không tải được dữ liệu' } as const)
      )
    )
  )
);
```

Template xử lý rõ:

```html
<ng-container *ngIf="patientsState$ | async as state">
  <app-loading *ngIf="state.status === 'loading'"></app-loading>
  <nz-alert *ngIf="state.status === 'error'" nzType="error" [nzMessage]="state.error"></nz-alert>
  <app-patient-table *ngIf="state.status === 'success'" [patients]="state.data"></app-patient-table>
</ng-container>
```

---

## 17. Anti-pattern thường gặp

### 17.1. Nested subscribe

Không tốt:

```ts
this.route.paramMap.subscribe(params => {
  const id = params.get('id')!;

  this.api.getPatient(id).subscribe(patient => {
    this.patient = patient;
  });
});
```

Vấn đề:

```text
- Khó unsubscribe
- Khó xử lý error
- Race condition khi param đổi nhanh
- Logic lồng sâu, khó test
```

Tốt hơn:

```ts
patient$ = this.route.paramMap.pipe(
  map(params => params.get('id')!),
  switchMap(id => this.api.getPatient(id))
);
```

### 17.2. Subscribe trong subscribe để gọi API theo form

Không tốt:

```ts
this.form.valueChanges.subscribe(value => {
  this.api.search(value).subscribe(result => {
    this.result = result;
  });
});
```

Tốt hơn:

```ts
result$ = this.form.valueChanges.pipe(
  debounceTime(300),
  switchMap(value => this.api.search(value))
);
```

### 17.3. Dùng Subject thay cho mọi thứ

Subject không phải state management mặc định. Nếu state có thể derive từ stream khác, hãy derive bằng operator.

Không tốt:

```ts
this.loadingSubject.next(true);
this.api.getData().subscribe(data => {
  this.dataSubject.next(data);
  this.loadingSubject.next(false);
});
```

Tốt hơn trong nhiều case:

```ts
state$ = this.refresh$.pipe(
  switchMap(() =>
    this.api.getData().pipe(
      map(data => ({ loading: false, data })),
      startWith({ loading: true, data: null })
    )
  )
);
```

### 17.4. Quên catchError làm stream chết

Nếu stream UI chết, user thao tác tiếp không có gì xảy ra. Với stream dài như search/form/router, xử lý lỗi bên trong inner Observable.

### 17.5. Dùng mergeMap cho search

Search thường cần latest wins. Dùng `mergeMap` có thể khiến request cũ về sau ghi đè request mới.

---

## 18. RxJS và Change Detection

### 18.1. async pipe và OnPush

Khi Observable emit value mới, `async pipe` sẽ mark component for check.

```ts
@Component({
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PatientListComponent {
  patients$ = this.api.getPatients();
}
```

```html
<app-patient-table [patients]="patients$ | async"></app-patient-table>
```

Pattern này rất hợp với OnPush vì input xuống component con đổi theo reference mới.

### 18.2. Không làm việc nặng trong stream emit quá dày

```ts
fromEvent(window, 'scroll').pipe(
  map(() => heavyCalculation())
);
```

Nếu source emit 60 lần/giây, operator nặng sẽ gây lag. Dùng throttle/debounce, chạy ngoài Angular zone nếu cần, hoặc giảm tần suất xử lý.

### 18.3. ViewModel hóa trước khi vào template

Không nên để template gọi method nặng:

```html
<td>{{ calculateScore(patient) }}</td>
```

Nên map thành VM:

```ts
patientsVm$ = this.patients$.pipe(
  map(patients => patients.map(patient => ({
    ...patient,
    scoreText: calculateScore(patient)
  })))
);
```

Template chỉ đọc:

```html
<td>{{ patient.scoreText }}</td>
```

---

## 19. Testing RxJS

### 19.1. Test operator đơn giản

```ts
it('maps patients to vm', done => {
  of([{ id: 1, name: 'An' }]).pipe(
    map(patients => patients.map(p => ({ id: p.id, label: p.name })))
  ).subscribe(vm => {
    expect(vm[0].label).toBe('An');
    done();
  });
});
```

### 19.2. Test debounce với fakeAsync

```ts
it('debounces search input', fakeAsync(() => {
  const control = new FormControl('');
  const values: string[] = [];

  control.valueChanges.pipe(
    debounceTime(300)
  ).subscribe(value => values.push(value ?? ''));

  control.setValue('a');
  tick(100);
  control.setValue('an');
  tick(299);

  expect(values).toEqual([]);

  tick(1);
  expect(values).toEqual(['an']);
}));
```

### 19.3. Test higher-order operator bằng hành vi

Với component/service Angular, thường test behavior là đủ:

```text
- Gõ nhiều lần chỉ gọi API với keyword cuối
- Submit double click chỉ gọi API một lần
- Param đổi thì load detail mới
- API lỗi thì state chuyển error nhưng stream vẫn sống
```

Marble testing mạnh nhưng không phải lúc nào cũng cần. Senior biết dùng khi stream logic đủ phức tạp, không biến mọi test thành marble khó đọc.

---

## 20. Checklist review RxJS

```text
Data flow:
[ ] Source stream rõ chưa?
[ ] Transform bằng operator hay lẫn side effect?
[ ] Có nested subscribe không?
[ ] Có cần vm$ để gom state không?

Operator:
[ ] Search/route/filter có dùng switchMap không?
[ ] Submit có cần exhaustMap không?
[ ] Bulk independent action có cần mergeMap giới hạn concurrency không?
[ ] Command theo thứ tự có cần concatMap không?

Lifecycle:
[ ] Subscribe thủ công có unsubscribe chưa?
[ ] Có dùng async pipe được không?
[ ] Stream có complete không?
[ ] Service có expose Subject trực tiếp không?

Error:
[ ] catchError đặt đúng cấp chưa?
[ ] Stream UI có bị chết sau lỗi không?
[ ] Retry có an toàn với action này không?

Performance:
[ ] Có debounce/throttle source emit dày không?
[ ] Có distinctUntilChanged cho query object không?
[ ] shareReplay có refCount/invalidation phù hợp không?
[ ] Có tạo API request thừa do nhiều subscribe không?

Angular:
[ ] OnPush + async pipe có hoạt động đúng không?
[ ] Form valueChanges có emitEvent false khi patch ngược không?
[ ] Route param đổi có load lại đúng không?
[ ] Query params có gây vòng lặp không?
```

---

## 21. Lộ trình học RxJS để lên middle/senior

### 21.1. Cơ bản cần chắc

```text
- Observable / Observer / Subscription
- next / error / complete
- cold vs hot
- map / filter / tap
- debounceTime / distinctUntilChanged / startWith
- async pipe
```

### 21.2. Middle level

```text
- switchMap / mergeMap / concatMap / exhaustMap
- combineLatest / withLatestFrom / forkJoin
- catchError placement
- Subject / BehaviorSubject
- unsubscribe pattern
- route params + form valueChanges + HTTP flow
```

### 21.3. Senior level

```text
- Thiết kế vm$ cho màn hình phức tạp
- Tách server state và UI state
- Cache + invalidation bằng shareReplay/refresh trigger
- Chọn flattening operator theo business semantics
- Debug race condition
- Review RxJS anti-pattern
- Tối ưu stream emit dày
- Thiết kế facade/service API sạch
```

### 21.4. Câu hỏi tự kiểm tra

```text
1. Nếu user gõ search nhanh, request nào được quyền render?
2. Nếu user click submit 5 lần, API nên gọi mấy lần?
3. Nếu API lỗi một lần, stream còn sống không?
4. Nếu component destroy, subscription có được dọn không?
5. Nếu nhiều component cùng subscribe, API có bị gọi lặp không?
6. Nếu filter object emit liên tục cùng nội dung, có gọi API thừa không?
7. State nào nên nằm trong URL, state nào nên nằm trong service/store?
```

---

## 22. Tóm tắt

```text
RxJS không phải chỉ là subscribe.

RxJS là cách mô hình hóa dữ liệu theo thời gian:
event -> transform -> async work -> state -> template

Middle Angular biết dùng operator đúng.
Senior Angular biết thiết kế async flow đúng, đoán được race condition, kiểm soát lifecycle, error, cache và performance.
```

Nếu chỉ nhớ một bảng:

| Bài toán | Operator/pattern thường dùng |
|---|---|
| Search input | `debounceTime` + `distinctUntilChanged` + `switchMap` |
| Route params load detail | `paramMap` + `distinctUntilChanged` + `switchMap` |
| Submit chống double click | `exhaustMap` |
| Bulk request song song | `mergeMap` với concurrency |
| Queue save theo thứ tự | `concatMap` |
| Filter nhiều control | `combineLatest` |
| Click lấy state mới nhất | `withLatestFrom` |
| Gọi nhiều API và chờ tất cả | `forkJoin` |
| Cache HTTP result | `shareReplay({ bufferSize: 1, refCount: true })` |
| Dọn subscription | `async pipe` hoặc `takeUntilDestroyed` |
