# Hangfire trong ASP.NET Core

Hangfire là framework dùng để lập lịch và thực thi các tác vụ nền trong ứng dụng .NET. Thay vì giữ một thread hoặc object tồn tại trong memory, Hangfire lưu mô tả của công việc vào persistent storage để worker có thể thực thi sau.

Mỗi tác vụ được lưu dưới dạng một background job. Về bản chất, background job là một lời gọi method bền vững, gồm:

- Tên đầy đủ của class hoặc interface chứa method cần gọi.
- Tên method và danh sách kiểu tham số.
- Giá trị các đối số sau khi được serialize.
- Queue tiếp nhận job, thời điểm tạo và metadata phục vụ quá trình thực thi.

Tập thông tin trên được gọi là **method invocation**. Khi nhận job, worker tạo một execution scope mới, khôi phục invocation, resolve các dependency qua DI và gọi method tương ứng. Worker không tiếp tục HTTP request đã tạo ra job.

Invocation được lưu bền vững nên job không phụ thuộc vào process đã tạo ra nó. Nếu API dừng sau khi lưu job, worker trong process khác vẫn có thể tiếp tục xử lý.

Các ví dụ trong chương sử dụng nền tảng sau:

- ASP.NET Core trên .NET 6.
- MySQL làm nơi lưu trữ bền vững cho dữ liệu của Hangfire.
- `Hangfire.MySqlStorage` kết nối Hangfire với MySQL.

Business case xuyên suốt là hệ thống đặt đồ ăn multi-tenant. Sau khi transaction tạo `DonHang` commit, ứng dụng tạo job gửi xác nhận cho khách hàng và đồng bộ dữ liệu của shop.

Hangfire Core định nghĩa contract cho storage provider nhưng không triển khai MySQL storage. `Hangfire.MySqlStorage` ánh xạ thao tác lưu job, chuyển trạng thái và điều phối worker sang bảng và transaction của MySQL.

`Hangfire.MySqlStorage` do cộng đồng duy trì và phát hành độc lập với Hangfire Core. Production phải cố định phiên bản của Hangfire Core, storage provider, MySQL connector và MySQL server.

Mỗi lần nâng cấp cần kiểm tra lại compatibility của tổ hợp phiên bản này và migration tương ứng của storage.

## Request boundary và background processing

HTTP request nên kết thúc khi synchronous business boundary đã hoàn thành. Những công việc không bắt buộc phải hoàn tất trước response, như gửi email, tạo tài liệu, đồng bộ hệ thống ngoài hoặc chạy báo cáo, là ứng viên để chuyển sang background processing.

Email, tài liệu, đồng bộ hệ thống ngoài và báo cáo có thời gian xử lý cùng failure mode riêng. Nếu các tác vụ này chạy trong request, endpoint sẽ phụ thuộc vào toàn bộ các hệ thống phía sau.

Luồng đồng bộ giữ toàn bộ công việc trong request:

```text
POST /api/don-hang
  -> ghi DonHang
  -> gọi email provider
  -> đồng bộ menu
  -> trả response
```

Latency của endpoint bằng tổng latency của mọi dependency. Một timeout từ email provider có thể làm client nhận lỗi dù `DonHang` đã được ghi thành công.

Background processing tách acceptance khỏi execution:

```mermaid
sequenceDiagram
    participant Client
    participant API
    participant BusinessDB as Business MySQL
    participant JobDB as Hangfire MySQL
    participant Worker

    Client->>API: POST /api/don-hang
    API->>BusinessDB: COMMIT DonHang
    API->>JobDB: persist background job
    API-->>Client: 201 Created
    Worker->>JobDB: fetch job
    Worker->>BusinessDB: load current DonHang
    Worker->>Worker: execute side effect
    Worker->>JobDB: persist final state
```

Việc tách nền thay đổi failure model. Hệ thống phải xử lý duplicate execution, retry, process crash, deploy compatibility và reconciliation.

## Xác định yêu cầu trước khi chọn Hangfire

Không phải tác vụ chạy sau HTTP response đều cần Hangfire. Công cụ phù hợp phụ thuộc vào vòng đời, độ bền và cách phục hồi của công việc.

Các tham số cần xác định gồm:

| Tham số | Câu hỏi thiết kế |
| --- | --- |
| Durability | Công việc có được phép mất khi process restart không? |
| Start latency | Job phải bắt đầu sau bao lâu: dưới một giây, vài giây hay vài phút? |
| Throughput | Peak jobs/second và thời gian xử lý trung bình là bao nhiêu? |
| Retry | Failure nào được retry và tối đa bao nhiêu lần? |
| Idempotency | Side effect có chịu được duplicate execution không? |
| Scheduling | Tác vụ chạy ngay, chạy trễ hay chạy theo lịch? |
| Isolation | Job có cần deploy và scale độc lập với API không? |
| Observability | Cần xem trạng thái, history và thao tác retry thủ công không? |
| Workflow | Đây là một method invocation hay workflow dài có nhiều bước và compensation? |

### `Task.Run`, `BackgroundService` và Hangfire

Ba cơ chế giải quyết ba phạm vi khác nhau:

| Cơ chế | Trạng thái công việc | Phục hồi sau restart | Phù hợp |
| --- | --- | --- | --- |
| `Task.Run` | Chỉ nằm trong memory của process | Không | Parallel work gắn với operation hiện tại. |
| `BackgroundService` + in-memory queue | Queue nằm trong process | Không, trừ khi ứng dụng tự bổ sung persistence | Consumer loop nội bộ cho dữ liệu có thể tạo lại. |
| Hangfire | Job, queue và state nằm trong persistent storage | Có recovery và retry | Công việc phải tồn tại sau request hoặc process restart. |

`Task.Run` trong controller không tạo background-processing system. HTTP scope có thể kết thúc trước task; scoped dependencies bị dispose; process restart làm mất task; ứng dụng cũng không có job history để phục hồi.

`BackgroundService` phù hợp khi ứng dụng cần một vòng lặp chạy nền. Cơ chế này không mặc nhiên cung cấp persistent queue.

Nếu tự bổ sung bảng job, claim protocol, retry, scheduling, recovery và Dashboard, ứng dụng đang xây lại các capability cốt lõi mà Hangfire đã cung cấp.

### Hangfire và message broker

Hangfire lưu một lời gọi method để worker .NET xử lý. Message broker lưu message để một hoặc nhiều consumers nhận theo messaging contract.

| Requirement | Hangfire | Message broker |
| --- | --- | --- |
| Chạy method nền trong cùng hệ sinh thái .NET | Phù hợp trực tiếp | Cần consumer contract và host riêng. |
| Delayed/recurring scheduling và Dashboard | Có sẵn | Thường cần công cụ hoặc service bổ sung. |
| Giao tiếp giữa nhiều services/ngôn ngữ | Coupling vào .NET type/method cao | Phù hợp hơn với integration contract. |
| Fan-out cho nhiều consumer độc lập | Không phải mô hình cốt lõi | Là use case tự nhiên của pub/sub. |
| Long retention, replay, stream processing | Không phải mục tiêu chính | Chọn broker/stream platform theo requirement. |

Multi-instance không tự động tạo nhu cầu dùng RabbitMQ. Nhiều Hangfire Servers có thể phối hợp qua cùng MySQL storage.

Message broker chỉ trở thành một lựa chọn phù hợp khi hệ thống cần integration semantics, các consumer độc lập hoặc messaging topology phức tạp. Số lượng replicas không phải tiêu chí quyết định.

## Lộ trình kiến trúc tối thiểu

Giải pháp bắt đầu từ capability nhỏ nhất đáp ứng requirement:

```text
Tác vụ ngắn, không cần tồn tại sau process
  -> xử lý đồng bộ hoặc Task.Run trong operation phù hợp

Consumer loop nội bộ, dữ liệu có thể tạo lại
  -> BackgroundService

Job phải bền vững, có retry/schedule/history
  -> Hangfire + MySQL storage

Business commit và enqueue không được lệch nhau
  -> Outbox + Hangfire dispatcher

Integration event cho consumers độc lập
  -> Outbox + message broker
```

Mỗi bước bổ sung một capability và một chi phí vận hành. Kiến trúc chỉ chuyển sang bước tiếp theo khi requirement hiện tại vượt quá guarantee của bước trước.

## Runtime architecture

Hangfire gồm bốn vai trò: Client, Storage, Server và Dashboard.

```mermaid
flowchart LR
    Client[Hangfire Client] -->|serialize và persist| Storage[(MySQL Storage)]
    Storage -->|poll và fetch| Server[Hangfire Server]
    Server --> Workers[Workers]
    Workers -->|resolve DI và invoke| Method[Job method]
    Workers -->|state transition| Storage
    Dashboard -->|Monitoring API| Storage
```

### Client

Client nhận expression mô tả lời gọi method, serialize invocation và ghi job vào storage. Client không thực thi business method.

```csharp
var jobId = backgroundJobClient.Enqueue<IGuiXacNhanDonHangJob>(
    job => job.ExecuteAsync(donHangId, CancellationToken.None));
```

Expression trên tạo logical payload:

```text
Type      = IGuiXacNhanDonHangJob
Method    = ExecuteAsync
Arguments = [donHangId, CancellationToken placeholder]
Queue     = default
CreatedAt = enqueue time
```

DI scope, `HttpContext`, connection và transaction của HTTP request không được serialize. Worker tạo execution scope mới tại thời điểm chạy.

### Storage

Storage là nguồn sự thật kỹ thuật cho payload, state history, queue, recurring schedule, server heartbeat và monitoring counters. Persistence cho phép job tồn tại sau process restart.

Storage không thay thế business database. State `Succeeded` mô tả method execution của Hangfire; trạng thái nghiệp vụ của `DonHang` vẫn thuộc database nghiệp vụ.

### Server và worker

Hangfire Server là tập background process chạy trong một .NET process.

| Thành phần | Trách nhiệm |
| --- | --- |
| Worker | Fetch và thực thi job từ queue. |
| Schedule poller | Chuyển delayed hoặc retry job đã đến hạn sang queue. |
| Recurring scheduler | Tạo fire-and-forget job từ recurring definition. |
| Heartbeat process | Cập nhật trạng thái sống của server trong storage. |
| Expiration manager | Dọn dữ liệu hết retention. |
| Counter aggregator | Tổng hợp counter phục vụ monitoring. |

`WorkerCount` là số execution slot của một server, không phải tổng số background process.

### Dashboard

Dashboard là projection vận hành đọc qua Monitoring API của storage. Dashboard không tham gia execution path và không bắt buộc để job chạy.

## Job lifecycle tổng quan

Một job có technical lifecycle riêng, bắt đầu từ lúc được tạo và kết thúc khi Hangfire ghi nhận trạng thái cuối cùng:

```mermaid
flowchart TD
    Create[Create invocation] --> Persist[Persist job]
    Persist --> Waiting{Execution time}
    Waiting -->|Now| Enqueued
    Waiting -->|Future| Scheduled
    Scheduled --> Enqueued
    Enqueued --> Fetch[Worker fetch]
    Fetch --> Processing
    Processing --> Execute[Execute method]
    Execute -->|Return normally| Succeeded
    Execute -->|Throw exception| Retry{Retry policy}
    Retry -->|Còn attempt| Scheduled
    Retry -->|Hết attempt| Failed
```

Một job có thể trải qua nhiều execution attempts trước khi đạt trạng thái cuối cùng. Vì vậy, một `Job` không đồng nghĩa với một lần thực thi.

Job lifecycle chỉ phản ánh trạng thái kỹ thuật của Hangfire. Business lifecycle của `DonHang` vẫn do application và business database quản lý.

## Những boundary không được nhầm lẫn

Hangfire quản lý việc thực thi job; application quản lý tính đúng đắn của nghiệp vụ. Hai phạm vi này liên quan với nhau nhưng không thay thế nhau:

| Hangfire boundary | Business boundary |
| --- | --- |
| Technical job state | Trạng thái nghiệp vụ của aggregate. |
| Hangfire storage | Business database. |
| Hangfire storage transaction | Business transaction. |
| Distributed lock của Hangfire | Concurrency control của aggregate. |
| `CancellationToken` của execution | Quyết định hủy nghiệp vụ. |
| `Succeeded` | Exactly-once side effect. |

Nhầm lẫn các boundary này thường dẫn đến thiết kế sai. Ví dụ, job đạt `Succeeded` chỉ chứng minh method đã return bình thường; nó không chứng minh email provider chỉ nhận đúng một request.

## Persistence model trên MySQL

Hangfire Core định nghĩa storage abstraction; `Hangfire.MySqlStorage` hiện thực abstraction đó bằng bảng, transaction, polling và distributed coordination trên MySQL.

Phần này tách persistence thành hai góc nhìn:

- **Logical model** mô tả job đang ở trạng thái nào, thuộc queue nào và server nào đang xử lý.
- **Physical storage** mô tả cách provider hiện thực các khái niệm đó bằng bảng, transaction, lock và polling.

Tài liệu ưu tiên logical model. Tên bảng, column, index và trình tự SQL cụ thể phụ thuộc vào storage provider và package version.

### Logical schema

```mermaid
erDiagram
    JOB ||--o{ STATE : "state history"
    JOB ||--o{ JOB_PARAMETER : "metadata"
    JOB ||--o| JOB_QUEUE : "queue membership"
    SERVER {
        string id
        datetime lastHeartbeat
        string data
    }
    SET {
        string key
        string value
        float score
    }
    HASH {
        string key
        string field
        string value
    }
    COUNTER {
        string key
        int value
    }
```

Sơ đồ mô tả logical schema và quan hệ trách nhiệm. Physical schema được xác định bởi storage provider, package version và `TablesPrefix`.

| Nhóm bảng | Nội dung | Vai trò vận hành |
| --- | --- | --- |
| `Job` | Invocation payload, arguments, creation time, current state | Truy xuất job và state hiện tại. |
| `State` | State history, reason và state data | Phân tích attempt, exception và retry. |
| `JobParameter` | Metadata phụ gắn với job | Phục vụ filter và internal component. |
| `JobQueue` | Queue item và fetch metadata | Điều phối worker nhận job. |
| `Server` | Identity, heartbeat, queues và worker metadata | Phát hiện server đang hoạt động. |
| `Set`, `Hash`, `List` | Cấu trúc dữ liệu tổng quát | Scheduled set, recurring definition và coordination data. |
| `Counter`, `AggregatedCounter` | Monitoring counters | Cung cấp số liệu cho Dashboard. |
| `Schema` | Storage schema version | Kiểm soát compatibility của provider. |

Business code không truy vấn hoặc cập nhật trực tiếp các bảng này. Thao tác job đi qua Hangfire Client, Monitoring API hoặc Dashboard để giữ compatibility với provider.

### Enqueue transaction

Về mặt logic, fire-and-forget job cần được tạo trong một storage transaction có các thay đổi tương đương:

```text
BEGIN
  Create Job
  Create Enqueued State
  Set current state
  Publish job vào queue
COMMIT
```

`Enqueue` trả `jobId` sau khi storage chấp nhận transaction. Kết quả này xác nhận job đã được lưu, không xác nhận business method đã hoàn thành.

### State model

Current state phục vụ truy vấn nhanh; state history bảo toàn diễn tiến của job.

```mermaid
stateDiagram-v2
    [*] --> Enqueued
    Enqueued --> Processing: worker fetch
    Processing --> Succeeded: method returns
    Processing --> Failed: method throws
    Failed --> Scheduled: retry filter
    Scheduled --> Enqueued: due time
    Failed --> Deleted: state transition
    Succeeded --> [*]
```

Một job retry có thể có history:

```text
Enqueued
Processing  server=worker-a
Failed      TimeoutException
Scheduled   attempt=1
Enqueued
Processing  server=worker-b
Succeeded
```

`Failed` trong history không đồng nghĩa current state là `Failed`; retry filter có thể đã chuyển job sang `Scheduled`.

### State election và apply state

State transition trong Hangfire không chỉ là phép gán một chuỗi. Khi một execution kết thúc, Hangfire trước tiên tạo một **candidate state**. Các state filter có thể thay đổi candidate này trước khi trạng thái cuối cùng được ghi xuống storage.

```mermaid
sequenceDiagram
    participant Worker
    participant Performer as Job Performer
    participant Filter as State Filters
    participant Storage

    Worker->>Performer: invoke job method
    Performer-->>Worker: exception
    Worker->>Filter: elect FailedState
    Filter-->>Worker: ScheduledState nếu còn retry
    Worker->>Storage: apply ScheduledState
    Storage-->>Worker: transition committed
```

`AutomaticRetryAttribute` tham gia state election.

Exception tạo một `FailedState` candidate. Khi vẫn còn retry attempt, filter thay candidate này bằng `ScheduledState`. Vì vậy current state sau transaction có thể là `Scheduled` thay vì `Failed`.

Cơ chế này giải thích ba hiện tượng vận hành:

- Dashboard có failed entry trong history trong khi current state là scheduled.
- Retry delay không giữ worker thread ở trạng thái sleep; worker slot được giải phóng sau khi scheduled state được ghi.
- Process restart không làm mất retry schedule vì due time nằm trong storage.

State filter là infrastructure extension point. Nó điều khiển technical state transition của job.

Business invariant như “đơn đã hủy không được gửi xác nhận” vẫn thuộc job, application hoặc domain logic. Invariant đó phải đúng cả khi use case được gọi ngoài Hangfire pipeline.

### Worker fetch loop

Worker thực hiện một vòng lặp logic:

```text
poll configured queues
  -> fetch queue item
  -> create Processing state
  -> deserialize invocation
  -> create DI scope
  -> activate job type
  -> invoke method
  -> elect and persist final state
  -> dispose scope
```

Fetch và `Processing` phục vụ hai mục tiêu khác nhau.

Fetch xác lập quyền xử lý tạm thời của một worker đối với queue item. State `Processing` ghi nhận execution attempt trong state history của job.

Process có thể dừng sau khi fetch nhưng trước khi ghi `Processing`.

Process cũng có thể dừng sau khi tạo side effect nhưng trước khi ghi final state.

Trong cả hai trường hợp, storage chỉ biết execution chưa hoàn tất. Storage không có đủ dữ liệu để kết luận side effect đã xảy ra hay chưa.

Khoảng thời gian giữa **business side effect** và **persist final state** là crash window quan trọng. Nếu process chết tại đây, job có thể được chạy lại dù side effect trước đó đã thành công. Đây là nguồn gốc trực tiếp của at-least-once execution và yêu cầu idempotency.

### Server heartbeat và abandoned execution

Mỗi Hangfire Server định kỳ ghi heartbeat vào storage. Heartbeat chỉ cho biết Hangfire Server vẫn còn giao tiếp với storage. Nó không chứng minh từng job bên trong server vẫn đang tiến triển bình thường.

```text
Server heartbeat mới + job Processing lâu
  -> job thực sự dài
  -> dependency bị treo
  -> code không quan sát cancellation

Server heartbeat cũ + nhiều job Processing
  -> process chết hoặc mất kết nối storage
  -> chờ recovery theo provider
```

Recovery tạo khả năng redelivery vì storage không có đủ bằng chứng để kết luận execution đã `Succeeded` hoặc `Failed`. Đây là nguồn gốc của at-least-once semantics.

### MySQL transaction và distributed coordination

Storage provider dùng MySQL transaction để giữ consistency giữa queue, job và state. Distributed coordination dùng shared database thay vì memory lock trong từng process.

Một in-memory `lock` chỉ serialize threads trong một replica:

```text
API A: lock object A
API B: lock object B
```

Hai object không có quan hệ với nhau. Multi-instance coordination phải dựa trên resource chung như row/transaction/lock primitive của MySQL provider.

Lock của Hangfire chỉ bảo vệ Hangfire resource. Business row có transaction và lock lifecycle riêng:

```text
Hangfire storage transaction
  -> fetch JobQueue
  -> write State

Business transaction
  -> update DonHang
  -> reserve TonKho
```

Hai transaction không atomic chỉ vì chúng cùng chạy trên MySQL hoặc cùng một physical server.

## Cấu hình .NET 6 và MySQL

### Package và database

```bash
dotnet add package Hangfire.AspNetCore --version 1.8.23
dotnet add package Hangfire.MySqlStorage --version 2.0.3
```

Các version trên là tổ hợp minh họa được pin cho chương này, không phải khuyến nghị về version mới nhất. Production phải đánh giá release hiện hành và compatibility giữa Hangfire Core, MySQL provider, connector và MySQL server trước khi nâng cấp.

```sql
CREATE DATABASE food_jobs
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
```

```json
{
  "ConnectionStrings": {
    "Hangfire": "Server=localhost;Port=3306;Database=food_jobs;User Id=hangfire_app;Password=secret;Allow User Variables=True"
  }
}
```

`Allow User Variables=True` là requirement của provider. Production secret thuộc secret store hoặc environment configuration.

### Service registration

```csharp
using System.Data;
using Hangfire;
using Hangfire.MySql;

var builder = WebApplication.CreateBuilder(args);

var connectionString = builder.Configuration
    .GetConnectionString("Hangfire")
    ?? throw new InvalidOperationException("Missing Hangfire connection string.");

builder.Services.AddHangfire(configuration => configuration
    .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
    .UseSimpleAssemblyNameTypeSerializer()
    .UseRecommendedSerializerSettings()
    .UseStorage(new MySqlStorage(
        connectionString,
        new MySqlStorageOptions
        {
            TransactionIsolationLevel = IsolationLevel.ReadCommitted,
            QueuePollInterval = TimeSpan.FromSeconds(5),
            JobExpirationCheckInterval = TimeSpan.FromHours(1),
            CountersAggregateInterval = TimeSpan.FromMinutes(5),
            PrepareSchemaIfNecessary = false,
            DashboardJobListLimit = 50_000,
            TransactionTimeout = TimeSpan.FromMinutes(1),
            TablesPrefix = "Hangfire"
        })));

builder.Services.AddHangfireServer(options =>
{
    options.Queues = new[] { "critical", "notification", "default" };
    options.WorkerCount = 4;
});
```

`PrepareSchemaIfNecessary = true` phù hợp local development. Production schema được cài bằng deployment step; runtime account chỉ giữ quyền DML cần thiết.

### Storage options

Các option dưới đây thuộc `Hangfire.MySqlStorage`, không phải contract chung của mọi storage provider. Provider khác có thể cung cấp tên option và cơ chế hiện thực khác cho cùng một yêu cầu vận hành.

| Option | Cơ chế | Tác động cấu hình |
| --- | --- | --- |
| `TransactionIsolationLevel` | Isolation của transaction nội bộ provider | `ReadCommitted` là default được provider công bố. |
| `QueuePollInterval` | Chu kỳ tìm queue item | Khoảng ngắn giảm queue latency và tăng query rate. |
| `JobExpirationCheckInterval` | Chu kỳ dọn record hết hạn | Khoảng quá ngắn tạo cleanup pressure. |
| `CountersAggregateInterval` | Chu kỳ tổng hợp counter | Quyết định độ mới của số liệu Dashboard. |
| `PrepareSchemaIfNecessary` | Tự cài physical schema | Liên quan trực tiếp tới quyền DDL runtime. |
| `DashboardJobListLimit` | Giới hạn danh sách job | Giới hạn memory và query volume của Dashboard. |
| `TransactionTimeout` | Timeout storage transaction | Độc lập với timeout business job. |
| `TablesPrefix` | Namespace vật lý của bảng | Phải thống nhất giữa producer và worker. |

MySQL mặc định thường sử dụng `REPEATABLE READ`. Storage provider có thể mở transaction với isolation level được cấu hình riêng, chẳng hạn `ReadCommitted` trong ví dụ trên.

Storage transaction và business `DbContext` transaction là hai transaction độc lập.

Hai phía chỉ chia sẻ atomic boundary khi cùng sử dụng một database connection và một transaction object. Cấu hình Hangfire mặc định không tạo quan hệ này.

## Job contract và execution

### Job method

```csharp
public interface IGuiXacNhanDonHangJob
{
    Task ExecuteAsync(Guid donHangId, CancellationToken cancellationToken);
}
```

Argument chứa business identifier thay vì entity snapshot. Worker đọc trạng thái mới nhất tại execution time và xử lý record đã xóa hoặc state đã thay đổi.

```csharp
public sealed class GuiXacNhanDonHangJob : IGuiXacNhanDonHangJob
{
    private readonly IDonHangRepository _repository;
    private readonly IEmailClient _emailClient;

    public GuiXacNhanDonHangJob(
        IDonHangRepository repository,
        IEmailClient emailClient)
    {
        _repository = repository;
        _emailClient = emailClient;
    }

    [Queue("notification")]
    [AutomaticRetry(Attempts = 5)]
    public async Task ExecuteAsync(
        Guid donHangId,
        CancellationToken cancellationToken)
    {
        var donHang = await _repository.GetRequiredAsync(
            donHangId,
            cancellationToken);

        if (donHang.DaGuiXacNhan)
            return;

        await _emailClient.SendOrderConfirmationAsync(
            donHang.Email,
            donHang,
            $"gui-xac-nhan:{donHang.Id}",
            cancellationToken);

        donHang.DanhDauDaGuiXacNhan();
        await _repository.SaveChangesAsync(cancellationToken);
    }
}
```

Hangfire tạo DI scope cho mỗi execution. Scoped dependency như `DbContext` được resolve trong scope của job và dispose sau execution.

### Job types

| Loại | Cơ chế | Use case |
| --- | --- | --- |
| Fire-and-forget | Enqueue một lần khi có worker | Gửi xác nhận đơn hàng. |
| Delayed | Tạo một execution duy nhất tại thời điểm trong tương lai | Hủy reservation hết hạn. |
| Recurring | Một schedule definition tạo nhiều executions theo lịch | Đồng bộ menu định kỳ. |
| Continuation | Phụ thuộc state cuối của job cha | Gửi notification sau khi PDF hoàn tất. |

```csharp
var jobId = backgroundJobClient.Enqueue<IGuiXacNhanDonHangJob>(
    job => job.ExecuteAsync(donHangId, CancellationToken.None));

backgroundJobClient.Schedule<IHuyGiuChoJob>(
    job => job.ExecuteAsync(donHangId, CancellationToken.None),
    TimeSpan.FromMinutes(15));

RecurringJob.AddOrUpdate<IDongBoMenuJob>(
    $"sync-menu:{tenantId:N}:{shopId:N}",
    job => job.ExecuteAsync(tenantId, shopId, CancellationToken.None),
    "*/10 * * * *",
    new RecurringJobOptions { TimeZone = TimeZoneInfo.Utc });
```

`CancellationToken.None` là placeholder trong expression. Hangfire thay argument này bằng execution token khi method được gọi.

Recurring ID chứa cả tenant và shop scope. Cấu trúc này ngăn recurring definition của một shop ghi đè definition của shop khác.

### Fire-and-forget lifecycle

Fire-and-forget yêu cầu job được thực thi sớm nhất khi worker có capacity. Loại job này không cung cấp exactly-once guarantee.

Producer nhận `jobId` ngay sau storage commit. Worker có thể bắt đầu trước hoặc sau HTTP response, tùy thời điểm fetch và worker availability.

```text
t0  producer persist Job + Enqueued state
t1  Enqueue trả jobId
t2  worker fetch
t3  method bắt đầu
t4  method kết thúc
t5  Succeeded được persist
```

Client chỉ quan sát được mốc `t1`. Business API cần endpoint trạng thái riêng nếu client phải theo dõi kết quả nghiệp vụ; `jobId` không thay business identifier.

### Delayed job internals

Delayed job chưa nằm trong executable queue. Storage giữ job trong scheduled structure với score/due time. Schedule poller chuyển job đến hạn sang `Enqueued`.

```mermaid
flowchart LR
    Client --> Scheduled[(Scheduled set<br/>dueAt)]
    Scheduled -->|poller: dueAt <= now| Queue[(JobQueue)]
    Queue --> Worker
```

Độ trễ thực tế gồm scheduling interval, queue wait và worker availability:

```text
actualStartAt - requestedDueAt
  = schedulePollingDelay
  + queueDelay
  + workerContention
```

Delayed job không phù hợp với hard realtime deadline. Business deadline cần persistence, late-execution policy và reconciliation riêng.

### Recurring job internals

Recurring job là một schedule definition, không phải execution record.

Definition chứa recurring ID, cron expression, timezone, queue và invocation metadata. Tại mỗi due time, scheduler tạo một fire-and-forget job độc lập với `jobId` riêng.

```text
Recurring definition: sync-menu:T1:S1
  -> execution job 1001 at 10:00
  -> execution job 1048 at 10:10
  -> execution job 1102 at 10:20
```

`AddOrUpdate` là upsert theo recurring ID. ID scope sai tạo configuration collision:

```text
sync-menu              -> tenant sau ghi đè tenant trước
sync-menu:{tenantId}   -> tách tenant, chưa tách shop
sync-menu:{tenantId}:{shopId} -> đúng scope tenant và shop
```

Timezone là một phần của recurring contract. Nếu business schedule dựa trên giờ địa phương, timezone phải được cấu hình tường minh thay vì phụ thuộc vào timezone của machine. Hệ thống hoạt động tại vùng có DST cần xác định thêm policy cho local time bị lặp hoặc bị bỏ qua.

Nhiều replicas có thể cùng chạy recurring scheduler. Các schedulers phối hợp qua shared storage để xử lý recurring definition ở cấp cluster; mục tiêu là không tạo một execution riêng chỉ vì có thêm replica.

Coordination của scheduler không loại bỏ duplicate execution do worker crash hoặc retry. Job method vẫn cần idempotency để bảo vệ business side effect.

### Continuation semantics

Continuation liên kết creation của job con với final state của job cha.

```csharp
var taoPdfJobId = backgroundJobClient.Enqueue<ITaoHoaDonPdfJob>(
    job => job.ExecuteAsync(donHangId, CancellationToken.None));

backgroundJobClient.ContinueJobWith<IGuiHoaDonJob>(
    taoPdfJobId,
    job => job.ExecuteAsync(donHangId, CancellationToken.None),
    JobContinuationOptions.OnlyOnSucceededState);
```

`OnlyOnSucceededState` phù hợp khi job con yêu cầu output hợp lệ từ job cha. `OnAnyFinishedState` phù hợp cho cleanup hoặc notification tổng quát.

Continuation biểu diễn dependency ngắn giữa hai jobs.

Workflow nhiều nhánh, có compensation, manual approval hoặc state tồn tại nhiều ngày cần business workflow state. Chuỗi continuation trong technical storage không biểu diễn đầy đủ các yêu cầu đó.

## Serialization và Job Activator

### Invocation compatibility

Hangfire serialize type identity, method identity, parameter types và argument values. Payload đang chờ tạo một compatibility contract giữa producer version và worker version.

Các thay đổi có blast radius tới queued jobs:

- Đổi namespace hoặc assembly của job type.
- Đổi interface implementation registration.
- Đổi method name hoặc parameter list.
- Đổi argument DTO làm JSON cũ không deserialize.
- Xóa constructor dependency khỏi DI hoặc thiếu registration mới.

Rolling deployment an toàn dùng expand-and-contract:

```text
worker V2 hiểu payload V1 và V2
  -> producer bắt đầu ghi V2
  -> V1 queue, scheduled jobs và retries drain
  -> worker loại support V1
```

Đây là cách áp dụng **expand-and-contract** cho durable job contract.

### Argument design

Argument là durable message contract, không phải tiện ích truyền object giữa hai method.

| Argument | Đặc tính |
| --- | --- |
| `donHangId` | Nhỏ, ổn định, worker đọc state mới nhất. |
| `tenantId`, `shopId` | Khôi phục execution scope khi không thể suy ra an toàn từ aggregate ID. |
| Entity graph | Payload lớn, stale state, dễ vỡ serialization. |
| Access token | Secret bị persist và hết hạn trước execution. |
| Stream/connection/DbContext | Không serialize được và gắn với process cũ. |

Payload size ảnh hưởng storage growth, lượng dữ liệu xuất hiện trên Dashboard và serialization latency.

Business snapshot chỉ được truyền khi immutable snapshot là requirement của use case. Contract khi đó sử dụng DTO có version thay vì domain entity.

### DI scope

Job Activator tạo scope cho từng execution. Job instance và scoped dependencies sống trong scope đó:

```text
Execution attempt
  -> IServiceScope
      -> Job instance
      -> DbContext
      -> repositories
      -> scoped tenant context
  -> dispose scope
```

Retry attempt mới tạo scope mới. Change tracker, transaction và scoped cache từ attempt trước không tồn tại. Singleton không được giữ scoped dependency hoặc mutable tenant state.

## Job filters

Job filter là extension point cho các mối quan tâm cắt ngang execution pipeline:

| Filter | Thời điểm tham gia | Use case |
| --- | --- | --- |
| Client filter | Trước và sau khi client tạo job | Enrich metadata, logging hoặc validation kỹ thuật. |
| Server filter | Trước và sau khi worker gọi method | Metrics, tracing hoặc execution context. |
| State election filter | Khi Hangfire chọn candidate state | Automatic retry hoặc custom state policy. |
| Apply-state filter | Trước và sau khi state được persist | Audit và metrics cho state transition. |

Filter phù hợp với logging, metrics, context enrichment và technical state policy. Business invariant không nên chỉ tồn tại trong filter, vì use case có thể được gọi từ một entry point không đi qua Hangfire pipeline.

## Concurrency control

### Worker concurrency

Tổng execution concurrency bằng tổng `WorkerCount` của mọi active servers lắng nghe cùng queues.

```text
ClusterConcurrency = Σ WorkerCount của các servers lắng nghe queue
3 replicas × 8 workers = tối đa 24 concurrent executions
```

Capacity model cho I/O-bound jobs:

```text
requiredConcurrency ≈ arrivalRate × averageDuration
```

Little's Law cho baseline sizing không thay load test. Connection pool, external rate limit, MySQL lock time và tail latency tạo giới hạn thấp hơn công thức CPU mặc định.

### Method-level exclusion

`DisableConcurrentExecution` giảm concurrent invocation của cùng method qua distributed coordination. Cơ chế này hữu ích cho maintenance task nhưng không tạo exactly-once guarantee.

> Không dùng `DisableConcurrentExecution` làm cơ chế duy nhất để bảo vệ correctness của business aggregate.

Các giới hạn:

- Lock lifetime phụ thuộc storage connection/lease.
- Process hoặc network failure làm ownership trở nên không chắc chắn.
- Method-level key có thể serialize toàn bộ tenants và shops không cần thiết.
- Side effect ngoài storage không trở thành atomic.

Resource-level concurrency thuộc business storage. Ví dụ unique constraint, optimistic version hoặc atomic conditional update bảo vệ đúng aggregate/resource scope.

### Tenant-scoped concurrency

Một global recurring job đồng bộ menu có thể tạo contention giữa tenants. Phân scope theo tenant/shop cho phép isolation và capacity control:

```text
queue: menu-sync
business key: {tenantId}:{shopId}:{menuVersion}
unique execution key: sync-menu:{tenantId}:{shopId}:{menuVersion}
```

Queue vẫn là shared execution channel; unique key và query predicate mới bảo vệ business scope.

## Cancellation và graceful shutdown

### Cancellation sources

Execution token có thể được signal bởi server shutdown, job deletion, state change hoặc cancellation request mà Hangfire quan sát qua storage.

Token này thuộc execution attempt hiện tại. Nó không phải `RequestAborted` của HTTP request đã enqueue job.

Cancellation delivery có polling latency. Khoảng polling ngắn tăng responsiveness và storage reads; khoảng dài giảm storage load và kéo dài shutdown/cancel reaction.

### Safe cancellation points

```csharp
public async Task ExecuteAsync(Guid donHangId, CancellationToken cancellationToken)
{
    var donHang = await _repository.GetAsync(donHangId, cancellationToken);

    cancellationToken.ThrowIfCancellationRequested();
    await _documentStore.UploadAsync(donHangId, cancellationToken);

    cancellationToken.ThrowIfCancellationRequested();
    await _repository.MarkDocumentReadyAsync(donHangId, cancellationToken);
}
```

Safe point nằm giữa các stage có outcome bền vững. Cancellation giữa external side effect và persistence tạo unknown outcome giống process crash.

`OperationCanceledException` phải đi ra khỏi job method để execution pipeline ghi nhận cancellation/failure semantics phù hợp. Catch để thêm context log vẫn cần rethrow:

```csharp
try
{
    await ExecuteCoreAsync(cancellationToken);
}
catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
{
    _logger.LogInformation("Job cancellation observed");
    throw;
}
```

### Business cancellation

Hangfire technical state có retention và không phải business audit. Yêu cầu “hủy xuất báo cáo” cần business state:

```text
Pending -> CancellationRequested -> Cancelled
Pending -> Processing -> Completed
Processing -> CancellationRequested -> Cancelled | Completed
```

Race giữa completion và cancellation được giải quyết bằng atomic state transition hoặc optimistic concurrency trên business record.

### Graceful shutdown

Khi host dừng theo quy trình bình thường, Hangfire signal execution token và chờ workers kết thúc trong giới hạn shutdown timeout. Job method quan sát token tại safe point, lưu lại business state cần thiết rồi thoát.

Graceful shutdown giảm số execution bị gián đoạn nhưng không loại bỏ crash.

Process có thể bị kill, máy chủ có thể hỏng hoặc kết nối storage có thể mất trước khi cleanup chạy. Vì vậy recovery và idempotency vẫn phải đúng khi shutdown hook không được thực thi.

## Multiple instances

### Shared-storage topology

Nhiều Hangfire Server dùng chung MySQL storage. Mỗi server có identity và heartbeat riêng; worker cạnh tranh fetch thông qua provider.

```mermaid
flowchart TB
    LB[Load Balancer]
    A[API A<br/>4 workers]
    B[API B<br/>4 workers]
    C[API C<br/>4 workers]
    HF[(MySQL Hangfire Storage)]
    Biz[(Business MySQL)]

    LB --> A
    LB --> B
    LB --> C
    A <--> HF
    B <--> HF
    C <--> HF
    A --> Biz
    B --> Biz
    C --> Biz
```

Ba replicas với `WorkerCount = 4` tạo tối đa 12 execution slots. Autoscaling HTTP replicas đồng thời thay đổi background concurrency nếu mỗi API process chạy `AddHangfireServer`.

`WorkerCount` được xác định từ capacity toàn cụm: MySQL connection pool, external rate limit, CPU, memory và job duration. CPU-based formula không phản ánh các giới hạn I/O này.

### Worker Service topology

```mermaid
flowchart LR
    API[API replicas<br/>Hangfire Client] --> HF[(MySQL Hangfire Storage)]
    HF --> Notify[Notification workers]
    HF --> Export[Export workers]
    Notify --> Biz[(Business MySQL)]
    Export --> Files[(Object Storage)]
```

API đăng ký `AddHangfire` để tạo job nhưng không đăng ký `AddHangfireServer`, vì API không thực thi job.

Worker Service đăng ký cả storage và `AddHangfireServer`. API và Worker Service phải dùng cùng connection string, `TablesPrefix`, provider version, queue names, serializer settings và job contract.

Worker riêng phù hợp với workload cần scale độc lập hoặc cô lập CPU/RAM. In-process server giữ topology đơn giản hơn cho workload nhỏ.

### Queue isolation và polling

Queue cô lập workload và cho phép scale từng worker pool. Queue không tạo priority guarantee nếu provider không cam kết processing order tương ứng với vị trí trong `options.Queues`.

Job trong queue không có worker giữ state `Enqueued`. Dashboard biểu diễn queue length và oldest-job age tăng trong khi server coverage bằng không.

`QueuePollInterval` kiểm soát trade-off giữa queue latency và MySQL query rate:

```text
Queue latency cao, MySQL còn capacity
  -> giảm polling interval hoặc tăng worker có kiểm soát

MySQL CPU/connection cao, queue tiếp tục tăng
  -> tăng worker làm tăng contention
  -> giảm concurrency, profile storage query hoặc tách workload
```

## Delivery semantics và correctness

### At-least-once execution

Reliable dequeue ưu tiên không làm mất job. Job có thể chạy lại khi worker chết hoặc state cuối chưa được ghi.

```mermaid
sequenceDiagram
    participant W1 as Worker A
    participant Mail as Email Provider
    participant S as Hangfire Storage
    participant W2 as Worker B
    W1->>S: fetch, state = Processing
    W1->>Mail: send succeeds
    Note over W1: process dies before Succeeded
    S-->>S: recover fetched job
    W2->>S: fetch again
    W2->>Mail: duplicate without idempotency
```

Hangfire không cung cấp exactly-once side effect. Correctness boundary nằm tại business database hoặc external provider.

### Idempotency và retry

Idempotency key cho email xác nhận:

```text
gui-xac-nhan:{donHangId}
```

Provider hỗ trợ idempotency key trả cùng logical result cho các request trùng key. Nếu provider không hỗ trợ, adapter sử dụng execution record với unique constraint trên `(tenantId, businessKey, operation)`.

```sql
CREATE TABLE JobExecution (
    id CHAR(36) NOT NULL,
    tenantId CHAR(36) NOT NULL,
    businessKey VARCHAR(100) NOT NULL,
    operation VARCHAR(100) NOT NULL,
    status VARCHAR(30) NOT NULL,
    updatedAt DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_job_execution_scope
        (tenantId, businessKey, operation)
);
```

Retry phù hợp với transient failure như timeout, connection reset, HTTP 429 hoặc một số HTTP 5xx. Những lỗi này có khả năng biến mất mà không cần sửa input hoặc deploy code mới.

Validation error, missing configuration và malformed recipient là permanent failure. Lặp lại cùng input trong cùng điều kiện không làm kết quả thay đổi.

Retry làm business method có thể chạy nhiều lần. Vì vậy mọi mutation nằm trong retry boundary cần idempotency trước khi tăng số attempts.

### Failure classification và retry policy

Sau khi xác định idempotency boundary, retry policy được suy ra từ error taxonomy:

| Failure | Ví dụ | Policy |
| --- | --- | --- |
| Transient | timeout, connection reset, HTTP 429, temporary 5xx | Retry với backoff và giới hạn attempts. |
| Permanent input | email sai format, shop không tồn tại | Fail ngay; sửa dữ liệu hoặc bỏ job. |
| Permanent configuration | thiếu API key, route cấu hình sai | Fail và alert; retry tự động chỉ tạo noise. |
| Concurrency conflict | optimistic conflict, duplicate claim | Reload và đánh giá lại, hoặc coi operation đã hoàn tất. |
| Unknown outcome | timeout sau external request | Query provider hoặc idempotency record trước khi retry. |

```csharp
[AutomaticRetry(
    Attempts = 5,
    DelaysInSeconds = new[] { 10, 30, 120, 300, 900 },
    OnAttemptsExceeded = AttemptsExceededAction.Fail)]
public Task ExecuteAsync(Guid donHangId, CancellationToken cancellationToken)
{
    // ...
}
```

Backoff giảm request amplification khi dependency lỗi diện rộng. Nếu nhiều jobs lỗi cùng lúc, layer gọi dependency có thể cần thêm jitter để tránh tất cả attempts quay lại tại cùng một thời điểm.

### Retry budget

Retry budget phải được tính ở cấp queue, không chỉ ở cấp một job. Khi dependency lỗi diện rộng, số attempts có thể khuếch đại lượng request:

```text
10.000 jobs × 5 attempts = tối đa 50.000 external calls
```

Budget phụ thuộc vào backlog, maximum attempts, backoff, worker concurrency và rate limit của dependency. Circuit breaker hoặc rate limiter ở adapter bảo vệ dependency khi retry policy của từng job vẫn tạo tổng tải quá lớn.

### Retry boundary

Retry toàn method sẽ lặp lại mọi bước trước điểm lỗi:

```text
Attempt 1
  reserve stock        success
  create invoice       success
  send email           timeout

Attempt 2
  reserve stock        duplicate risk
  create invoice       duplicate risk
  send email           retry
```

Mỗi stage cần idempotency riêng hoặc workflow state ghi nhận stage đã hoàn tất.

Job chứa quá nhiều stages tạo retry boundary lớn: lỗi ở bước cuối khiến mọi bước trước được gọi lại. Ngược lại, tách mỗi câu lệnh thành một job riêng làm orchestration và state management phức tạp.

Job boundary phù hợp thường trùng với một business operation có outcome và idempotency key rõ ràng.

### Poison job

Poison job lặp lại permanent failure trên mọi attempt. Dấu hiệu gồm cùng exception type và message, duration ngắn, cùng business key và attempts tăng đều.

Quy trình xử lý gồm:

1. Dừng automatic retry khi đã phân loại permanent.
2. Bảo toàn job ID, business key và failure reason.
3. Sửa configuration, code hoặc input source.
4. Retry có kiểm soát sau khi precondition đã thay đổi.
5. Reconcile business state sau execution.

Delete technical job không rollback side effect hoặc thay đổi business state.

### Distributed lock và business concurrency

Distributed lock của storage phối hợp scheduler và server processes. Nó không khóa row `DonHang`, không chống oversell và không kết hợp business database với external API thành atomic transaction.

Stock reservation thuộc business database:

```sql
UPDATE TonKho
SET soLuong = soLuong - @soLuongDat
WHERE tenantId = @tenantId
  AND shopId = @shopId
  AND hangHoaId = @hangHoaId
  AND soLuong >= @soLuongDat;
```

`rowsAffected = 1` xác nhận reservation thành công. `rowsAffected = 0` biểu diễn conflict hoặc không đủ tồn theo use-case contract.

### Outbox

Transactional Outbox bảo vệ **enqueue intent** khi business transaction và Hangfire storage không cùng một atomic boundary.

Business transaction và Hangfire storage transaction độc lập tạo lost-intent window:

```text
COMMIT DonHang
process crash
chưa enqueue GuiXacNhanDonHang
```

```mermaid
sequenceDiagram
    participant API
    participant DB as Business MySQL
    participant Dispatcher
    participant HF as Hangfire MySQL
    participant Worker
    API->>DB: INSERT DonHang + OutboxMessage
    DB-->>API: COMMIT
    Dispatcher->>DB: claim OutboxMessage
    Dispatcher->>HF: enqueue job
    Dispatcher->>DB: mark dispatched
    HF->>Worker: fetch job
```

Outbox giải quyết trường hợp business transaction đã commit nhưng intent tạo job bị mất. Outbox không giải quyết duplicate execution: dispatcher có thể crash sau enqueue và trước `mark dispatched`, nên consumer idempotency vẫn là requirement độc lập.

## Multi-tenancy

Background job không có HTTP host, request header hoặc authenticated user của request ban đầu. Tenant context được khôi phục từ dữ liệu bền vững.

Một worker process có thể lần lượt xử lý job của nhiều tenants. Vì vậy tenant state không được giữ trong static state hoặc mutable singleton giữa các executions.

Mỗi execution phải thực hiện đủ bốn bước:

1. Xác định tenant từ durable input hoặc business record.
2. Thiết lập tenant scope.
3. Thực thi mọi query và side effect trong scope đó.
4. Dispose scope để tenant context không rò sang execution tiếp theo.

Job contract có thể chứa tenant scope:

```csharp
Task ExecuteAsync(
    Guid tenantId,
    Guid shopId,
    CancellationToken cancellationToken);
```

Một contract khác chỉ nhận `donHangId`, sau đó repository tải `tenantId` từ business record bằng lookup không phụ thuộc current tenant filter.

Sau khi tenant được xác định, execution scope thiết lập `TenantContext` trước tenant-scoped query. Dapper query vẫn có explicit tenant predicate:

```sql
SELECT id, trangThai
FROM DonHang
WHERE id = @donHangId
  AND tenantId = @tenantId;
```

## Dashboard và vận hành

### Information model

```mermaid
flowchart LR
    Dashboard --> Monitoring[Monitoring API]
    Monitoring --> Server[(Server heartbeat)]
    Monitoring --> Queue[(JobQueue)]
    Monitoring --> Jobs[(Job + State)]
    Monitoring --> Schedule[(Set + Hash)]
    Monitoring --> Counters[(Counters)]
```

| Khu vực | Dữ liệu | Ý nghĩa vận hành |
| --- | --- | --- |
| Overview | State counters và history graph | Processing trend tổng quát. |
| Servers | Identity, heartbeat, workers, queues | Trạng thái worker processes. |
| Queues | Queue length và server coverage | Backlog và queue không có consumer. |
| Enqueued | Job chờ fetch | Queue latency và oldest-job age. |
| Processing | Job đang được worker giữ | Long-running hoặc stalled execution. |
| Scheduled | Delayed job và retry | Retry storm hoặc scheduled backlog. |
| Succeeded | Method execution hoàn tất | Không chứng minh side effect exactly-once. |
| Failed | Current failed jobs và exception | Permanent failure hoặc exhausted retry. |
| Recurring Jobs | Cron, timezone, next/last execution | Trạng thái recurring definitions. |

Failure diagnosis:

```text
Không có email xác nhận
  -> không có job: producer hoặc Outbox dispatcher
  -> Enqueued lâu: queue coverage và worker capacity
  -> Scheduled: exception và next retry
  -> Processing lâu: dependency, duration, heartbeat
  -> Failed: transient/permanent classification
  -> Succeeded: provider log, business state, idempotency record
```

`Succeeded` chỉ phản ánh kết quả thực thi method theo góc nhìn của Hangfire. Nếu code bắt exception rồi tiếp tục, technical state sẽ lệch khỏi business result.

### Security

Dashboard hiển thị method, serialized arguments, exception và stack trace; đồng thời cung cấp retry, delete và trigger operations. Endpoint cần authentication, role authorization và network restriction.

```csharp
public sealed class HangfireAuthorizationFilter : IDashboardAuthorizationFilter
{
    public bool Authorize(DashboardContext context)
    {
        var httpContext = context.GetHttpContext();
        return httpContext.User.Identity?.IsAuthenticated == true
            && httpContext.User.IsInRole("HangfireAdmin");
    }
}
```

```csharp
app.UseAuthentication();
app.UseAuthorization();
app.UseHangfireDashboard("/hangfire", new DashboardOptions
{
    Authorization = new[] { new HangfireAuthorizationFilter() },
    IsReadOnlyFunc = context =>
        !context.GetHttpContext().User.IsInRole("HangfireOperator")
});
```

Job arguments không chứa password, access token hoặc dữ liệu cá nhân không cần thiết. Retry, delete và manual trigger thuộc audit trail vận hành.

### Production operation

#### Deployment compatibility

Schema installation thuộc deployment pipeline; runtime account chỉ có DML permission. Rolling deployment giữ compatibility với queued payload:

```text
deploy worker đọc được V1 và V2
  -> deploy producer bắt đầu tạo V2
  -> V1 queue, schedule và retry drain
  -> loại V1 khỏi worker
```

Đổi namespace, assembly, type, method signature hoặc argument DTO trước khi job cũ drain có thể làm worker không deserialize được payload.

#### Observability

Dashboard phục vụ điều tra từng job; monitoring system chịu trách nhiệm alert và historical metrics.

- Queue length và oldest-job age theo queue.
- Enqueue-to-start latency.
- Execution duration và throughput theo job type.
- Failed rate, retry rate và exhausted retries.
- Server heartbeat age.
- MySQL connection utilization, query latency và lock wait.
- External dependency latency, rate limit và error rate.

Structured log của mỗi execution gồm `jobId`, `tenantId`, business key, job type, attempt và trace context.

#### Operational failure cases

##### Queue không có worker

Job giữ state `Enqueued` khi không có worker fetch nó. Theo thời gian, queue length và oldest-job age cùng tăng.

Server view trong Dashboard không hiển thị instance nào đăng ký queue tương ứng. Hai nguyên nhân phổ biến là queue name khác nhau giữa producer và worker, hoặc worker deployment thiếu queue configuration.

##### Retry storm

```mermaid
flowchart LR
    Jobs[10.000 jobs] --> Provider[Provider 503]
    Provider --> Retry[Scheduled retries]
    Retry --> Queue[Backlog]
    Queue --> Provider
```

Worker limit, queue isolation, backoff và circuit/rate policy giới hạn amplification. Permanent error không đi vào cùng retry policy với transient error.

##### Manual retry sau timeout

Timeout không chứng minh provider chưa xử lý request. Manual retry payment hoặc notification dựa trên provider status và idempotency record, không chỉ technical state của Hangfire.

### Schema lifecycle và retention

#### Schema installation

Storage provider cần physical tables và indexes trước khi Client hoặc Server hoạt động. Hai execution modes có mục tiêu khác nhau:

| Mode | `PrepareSchemaIfNecessary` | Database identity |
| --- | --- | --- |
| Local development | `true` | Có quyền tạo/thay đổi object. |
| Production runtime | `false` | Chỉ có quyền DML cần cho Hangfire. |
| Deployment migration | Không chạy application server | Identity riêng có quyền DDL. |

Auto schema creation làm startup của mỗi production replica phụ thuộc vào DDL permission và trạng thái schema tại thời điểm khởi động.

Deployment migration tách schema change khỏi runtime startup. Migration được review và chạy bằng deployment identity trước khi application replicas nhận traffic; runtime identity chỉ giữ các DML permissions cần thiết.

#### Table prefix consistency

`TablesPrefix` là physical namespace. Producer và worker dùng prefix khác nhau hoạt động như hai Hangfire systems độc lập dù cùng connection string:

```text
API prefix     = Hangfire
Worker prefix  = FoodJobs

API enqueue vào HangfireJob...
Worker poll FoodJobsJob...
Kết quả: enqueue thành công, không job nào được xử lý
```

Prefix là immutable deployment contract trừ khi có data migration đầy đủ.

#### Retention model

Succeeded jobs và monitoring data không tồn tại vô hạn. Expiration manager xóa record theo expiration metadata và provider interval.

Retention tạo trade-off:

```text
retention dài
  -> điều tra lịch sử tốt hơn
  -> storage, index và cleanup cost lớn hơn

retention ngắn
  -> storage nhỏ hơn
  -> mất technical evidence sớm hơn
```

Business audit không phụ thuộc retention của Hangfire. Thông tin pháp lý, thanh toán, lịch sử trạng thái đơn hàng và operator action nằm trong business audit store.

#### Index và storage growth

Growth rate phụ thuộc enqueue throughput, state transitions trên mỗi job, retries, argument size và retention:

```text
rowsPerDay ≈ jobsPerDay × (job row + state rows + queue/parameter/counter rows)
```

Retry-heavy workload tăng `State` nhanh hơn số business operations. Dashboard query chậm có thể xuất phát từ storage size, index statistics, counter aggregation hoặc list limit; tăng web timeout không xử lý nguyên nhân.

### Điều tra qua Dashboard

#### Server view

Server view trả lời ba câu hỏi:

1. Process nào còn heartbeat?
2. Mỗi process có bao nhiêu workers?
3. Process lắng nghe queues nào?

Server heartbeat cũ không tự động chứng minh machine chết; network partition hoặc MySQL connectivity failure tạo cùng biểu hiện. Application log và infrastructure health hoàn thiện chẩn đoán.

#### Queue view

Queue length là snapshot backlog. Oldest-job age biểu diễn user impact tốt hơn khi arrival rate thay đổi.

```text
Queue length = 10.000, throughput = 5.000/minute
  -> backlog có thể được giải phóng trong khoảng 2 phút

Queue length = 100, oldest age = 2 giờ
  -> queue có thể thiếu worker hoặc chứa poison/blocked workload
```

Dashboard không mặc định cung cấp đầy đủ SLO calculation. Metrics pipeline cần record enqueue time, start time và final state để tính percentile.

#### Processing view

Processing duration được đối chiếu với job-specific expectation. Một export 20 phút có thể bình thường; một notification 20 phút là stalled dependency hoặc timeout policy thiếu.

Processing job trên server không còn heartbeat có khả năng chờ provider recovery. Manual requeue trước recovery có thể tạo concurrent duplicate execution.

#### Failed và retry view

Investigation record tối thiểu:

```text
Hangfire jobId
tenantId / shopId
business key
job type
current state
state history
attempt number
exception type
external request/idempotency key
worker serverId
```

Exception message không đủ để phân loại unknown outcome. Timeout sau external call cần provider lookup hoặc reconciliation.

#### Operator actions

| Action | Technical effect | Business consequence |
| --- | --- | --- |
| Retry/Requeue | Tạo execution attempt mới | Side effect có thể lặp. |
| Delete | Chuyển hoặc loại job khỏi processing flow | Không rollback business data. |
| Trigger recurring | Tạo execution ngoài schedule thông thường | Có thể chạy song song execution đang tồn tại. |
| Change queue/config | Thay worker routing | Không migrate job nếu provider/API không thực hiện transition tương ứng. |

Operator identity, reason, timestamp, job ID và business key thuộc audit record. Dashboard button không thay approval policy cho payment, refund hoặc document issuance.

## Capacity planning và suy ra cấu hình

Configuration không bắt đầu từ một `WorkerCount` tùy ý. Quá trình suy ra cấu hình gồm ba bước:

1. Xác định workload: arrival rate, duration, start SLO và retry traffic.
2. Xác định bottleneck: external rate limit, database pool, CPU, memory hoặc lock contention.
3. Suy ra worker concurrency, queue isolation, polling interval và retry budget.

Một production configuration được suy ra từ workload contract thay vì sao chép default:

```text
Job type: GuiXacNhanDonHang
arrival rate: 20 jobs/s peak
average duration: 300 ms
p95 duration: 1.2 s
external limit: 50 requests/s
start SLO: 30 s
retry: 10s, 30s, 2m, 5m
idempotency: gui-xac-nhan:{donHangId}
queue: notification
```

Baseline concurrency từ average workload:

```text
20 jobs/s × 0.3 s = 6 concurrent executions
```

P95 burst, retry traffic và headroom có thể đưa baseline lên 10–12 workers toàn cluster, vẫn thấp hơn external limit 50 requests/s. Nếu có ba replicas, `WorkerCount = 4` tạo tổng 12 slots.

Polling interval xuất phát từ start SLO. SLO 30 giây không yêu cầu polling 100 ms. Polling 5 giây vẫn để lại phần lớn latency budget cho thời gian chờ queue và execution, đồng thời giảm áp lực polling lên MySQL.

Queue separation xuất phát từ resource profile:

| Queue | Workload | Constraint |
| --- | --- | --- |
| `critical` | cập nhật deadline ngắn | latency và business priority |
| `notification` | email/SMS | provider rate limit |
| `export` | PDF/Excel | CPU, memory, object storage |

Worker pool cho `export` có concurrency thấp để export không chiếm connection/CPU của notification.

## Chiến lược kiểm chứng

### Business method tests

Job class được kiểm thử như application service, không cần Hangfire runtime cho domain branches:

```text
DonHang tồn tại, chưa gửi
  -> provider được gọi với idempotency key đúng
  -> business state được cập nhật

DonHang đã gửi
  -> method return
  -> provider không được gọi

Provider transient failure
  -> exception đi ra execution boundary
  -> state không được đánh dấu hoàn tất
```

### Storage integration tests

Integration test với MySQL storage thật xác nhận các phần không thể chứng minh bằng mock:

- Invocation serialize và deserialize qua đúng package versions.
- DI activator resolve job và scoped dependencies.
- Queue attribute route tới đúng worker pool.
- Retry filter tạo scheduled transition.
- Recurring definition dùng tenant/shop-scoped ID.
- Hai workers không cùng claim normal queue item trong happy path.
- Process interruption dẫn tới redelivery theo provider recovery.
- Dashboard authorization từ chối identity không đủ role.

### Failure injection

Failure injection phải kiểm tra invariant sau crash, không chỉ xác nhận process đã dừng:

| Failure point | Expected invariant |
| --- | --- |
| API crash trước business commit | Không có business state và không có enqueue intent. |
| Crash sau commit, trước enqueue | Outbox record vẫn ở trạng thái chờ dispatch. |
| Dispatcher crash sau enqueue | Job có thể được enqueue lặp, nhưng logical side effect không lặp. |
| Worker crash sau external call | Retry dùng idempotency key hoặc reconciliation để không lặp logical effect. |
| Hangfire storage outage | Producer và worker báo lỗi quan sát được; enqueue intent không âm thầm biến mất. |

Mỗi invariant xác nhận một mechanism khác nhau: transaction rollback, Outbox, duplicate enqueue, external idempotency và redelivery handling.

### Multi-instance verification

Test topology chạy tối thiểu hai worker processes trên cùng MySQL storage:

1. Enqueue batch có business keys duy nhất.
2. Xác nhận workload được phân phối qua hai server identities.
3. Kill một process giữa execution.
4. Xác nhận abandoned job được recovery.
5. Xác nhận business side effect không duplicate nhờ idempotency.
6. Restart process và xác nhận heartbeat/server view phục hồi.

## Long-running jobs

Job kéo dài làm tăng thời gian worker slot, connection và memory bị chiếm dụng. Nó cũng mở rộng crash window và khiến một lần retry phải lặp lại nhiều công việc hơn.

Trước khi triển khai job chạy hàng chục phút, cần đánh giá:

- `CancellationToken` và các safe cancellation points.
- Timeout riêng của database, HTTP client và object storage.
- Memory growth khi xử lý tệp hoặc tập dữ liệu lớn.
- Worker starvation đối với các job ngắn cùng queue.
- Shutdown timeout và rolling deployment duration.
- Checkpoint bền vững để biết phần nào đã hoàn tất.
- Retry boundary khi execution bị ngắt ở gần cuối.

Không phải job dài nào cũng cần tách. Nếu operation có các stages độc lập và mỗi stage có outcome bền vững, workflow theo stages với durable checkpoint thường phục hồi tốt hơn một execution khổng lồ. Nếu operation không có ranh giới tự nhiên, giữ một job và giới hạn concurrency sẽ đơn giản hơn.

## Khi Hangfire không còn là boundary phù hợp

Hangfire phù hợp khi application cần lưu và thực thi các method của .NET dưới dạng job. Giới hạn xuất hiện khi requirement chuyển từ background method execution sang distributed messaging hoặc workflow orchestration.

### Consumer độc lập

Một job gửi email có một worker và một outcome rõ ràng. Một business event như `DonHangDaHoanThanh` có thể cần nhiều consumers:

```text
DonHangDaHoanThanh
  -> Billing
  -> Notification
  -> Analytics
  -> External Integration
```

Nếu các consumers cần deploy, scale, retry và retention độc lập, một integration event qua message broker tạo boundary rõ hơn invocation của một Hangfire method.

### Hợp đồng không phụ thuộc .NET type

Hangfire invocation chứa type và method identity của .NET. Cách biểu diễn này phù hợp giữa producer và worker cùng codebase hoặc cùng release contract.

Khi consumers sử dụng ngôn ngữ khác hoặc thuộc services có release cycle độc lập, message schema ổn định phù hợp hơn .NET method signature. Integration contract khi đó cần versioning, ownership và compatibility policy riêng.

### Fan-out, replay và stream processing

Hangfire queue hướng tới việc một worker xử lý một job. Các requirement sau thuộc messaging hoặc streaming platform:

- Một event được nhiều consumer groups xử lý độc lập.
- Event được lưu dài hạn để replay.
- Consumer tự quản lý offset.
- Xử lý stream theo partition và ordering key.
- Tái tạo projection từ event history.

Việc bổ sung các capability này bằng bảng và filters riêng làm Hangfire storage trở thành một message platform tự xây dựng.

### Workflow dài hạn

Continuation biểu diễn dependency ngắn giữa jobs. Workflow có manual approval, timer nhiều ngày, compensation và nhiều nhánh cần business state machine hoặc workflow engine.

```text
PendingPayment
  -> Paid
  -> Preparing
  -> Delivering
  -> Completed

PaymentFailed
  -> ReleaseInventory
  -> Cancelled
```

Các trạng thái trên là business state và phải tồn tại độc lập với retention của Hangfire technical states.

## Abstraction theo capability

Application layer không phụ thuộc trực tiếp vào tên technology như `IMySqlHangfireService` hoặc `IRabbitMqService`. Interface mô tả capability và guarantee mà use case cần.

### Background job capability

Nếu application cần lập lịch một tác vụ nội bộ:

```csharp
public interface IBackgroundJobScheduler
{
    string Enqueue<TJob>(Expression<Func<TJob, Task>> operation);
}
```

Infrastructure adapter có thể dùng Hangfire. Interface này chỉ phù hợp khi application thực sự cần che Hangfire API hoặc sở hữu một contract riêng.

Nếu chỉ một vài composition-root hoặc infrastructure handlers enqueue job, sử dụng trực tiếp `IBackgroundJobClient` đơn giản hơn. Trường hợp đó chưa cần thêm abstraction.

### Integration event capability

Requirement “phát một integration event bền vững cho consumers độc lập” có semantic khác background method execution:

```csharp
public interface IIntegrationEventPublisher
{
    Task PublishAsync(
        IntegrationEvent message,
        CancellationToken cancellationToken);
}
```

Hai interfaces không được gộp thành `IMessageService`. Background job mang method-invocation semantics; integration event mang durable-message semantics. Interface chung sẽ che mất guarantee mà caller cần hiểu.

### Quy tắc thay đổi

Adapter có thể che thay đổi implementation khi semantic giữ nguyên:

```text
Hangfire MySQL provider A
  -> Hangfire MySQL provider B

semantic vẫn là persistent background job
```

Adapter không nên che thay đổi semantic:

```text
background method invocation
  -> durable integration event cho nhiều consumers
```

Trường hợp thứ hai cần capability và contract mới. Việc giữ nguyên interface chỉ để giảm số file sửa sẽ làm application hiểu sai delivery guarantee.

## Khung quyết định thiết kế

Quy trình thiết kế một background-processing requirement:

```text
Business operation
  -> xác định phần bắt buộc hoàn thành trước response
  -> xác định phần có thể xử lý sau
  -> định lượng throughput, latency và durability
  -> chọn giải pháp nhỏ nhất đáp ứng guarantee
  -> xác định retry boundary và idempotency key
  -> xác định transaction gap và nhu cầu Outbox
  -> xác định topology single/multiple instances
  -> thiết kế metrics, Dashboard access và recovery runbook
  -> chỉ nâng cấp khi requirement vượt guarantee hiện tại
```

Decision record tối thiểu cho một job:

```text
Job: GuiXacNhanDonHang
Trigger: DonHang committed
Queue: notification
Start SLO: 30 seconds
Peak rate: 20 jobs/second
Retryable: timeout, 429, selected 5xx
Permanent: invalid recipient, missing configuration
Idempotency key: gui-xac-nhan:{donHangId}
Tenant source: DonHang.tenantId
Recovery: reconciliation by business status
Storage: shared MySQL Hangfire database
Worker topology: 3 replicas × 4 workers
```

Từ record này, `WorkerCount`, queue, retry, storage và monitoring đều có căn cứ. Configuration không còn là tập giá trị được sao chép từ một dự án khác.

## Keyword reference

| Keyword | Định nghĩa |
| --- | --- |
| Background job | Method invocation được serialize và lưu để thực thi ngoài request hiện tại. |
| Execution attempt | Một lần worker nhận và gọi job method; một job có thể có nhiều attempts. |
| Client | Thành phần tạo và persist job. |
| Storage | Nguồn sự thật kỹ thuật cho job, state, queue và server. |
| Hangfire Server | Tập background process điều phối qua storage. |
| Worker | Execution slot fetch và chạy một job tại một thời điểm. |
| Queue | Kênh logic phân workload tới worker pool. |
| State | Một trạng thái trong history của job. |
| State transition | Việc tạo state mới và cập nhật current state. |
| Filter | Hook quanh job creation, execution hoặc state election. |
| Automatic retry | Filter chuyển failed attempt thành scheduled attempt mới. |
| Scheduled job | Job một lần chờ due time. |
| Recurring job | Cron definition tạo các fire-and-forget job. |
| Continuation | Job phụ thuộc state cuối của job cha. |
| Heartbeat | Tín hiệu định kỳ của Hangfire Server trong storage. |
| Distributed lock | Coordination giữa processes qua shared storage. |
| Job activator | Thành phần tạo job instance và DI scope. |
| Poison job | Job luôn thất bại vì input hoặc permanent error. |
| Unknown outcome | Trạng thái mà caller không biết side effect đã thành công hay chưa, thường xuất hiện sau timeout hoặc process crash. |
| Business key | Identifier ổn định của operation hoặc resource nghiệp vụ. |
| Idempotency key | Key giúp nhiều attempts cùng đại diện cho một logical effect. |
| Crash window | Khoảng giữa hai durable boundaries mà process crash có thể làm kết quả trở nên không chắc chắn. |
| Recovery | Cơ chế đưa job chưa hoàn tất trở lại trạng thái có thể xử lý. |
| Reconciliation | Đối chiếu nguồn sự thật để sửa hoặc xác nhận business state sau failure. |
| Outbox | Processing intent được lưu cùng business transaction. |
| Idempotency | Cùng operation key được áp dụng nhiều lần nhưng chỉ tạo một logical effect. |

## Verification checklist

- Client và worker dùng cùng database, `TablesPrefix` và provider version.
- Mỗi queue có ít nhất một worker pool.
- Tổng worker count phù hợp MySQL và external dependency capacity.
- Job argument nhỏ, ổn định và không chứa secret.
- Tenant context được khôi phục từ dữ liệu bền vững.
- Retry policy phân biệt transient và permanent error.
- Side effect có idempotency key, unique constraint hoặc reconciliation.
- Outbox bảo vệ business operation không chấp nhận lost intent.
- Dashboard có authorization, network restriction và read-only role.
- Rolling deployment giữ compatibility với queued payload.
- Monitoring sử dụng queue age, failure rate và heartbeat.

## Tài liệu tham khảo

- [Hangfire documentation](https://docs.hangfire.io/en/latest/)
- [ASP.NET Core applications](https://docs.hangfire.io/en/latest/getting-started/aspnet-core-applications.html)
- [Processing background jobs](https://docs.hangfire.io/en/latest/background-processing/processing-background-jobs.html)
- [Running multiple server instances](https://docs.hangfire.io/en/latest/background-processing/running-multiple-server-instances.html)
- [Configuring job queues](https://docs.hangfire.io/en/latest/background-processing/configuring-queues.html)
- [Using Dashboard UI](https://docs.hangfire.io/en/latest/configuration/using-dashboard.html)
- [Hangfire.MySqlStorage repository](https://github.com/arnoldasgudas/Hangfire.MySqlStorage)
- [Hangfire.MySqlStorage package](https://www.nuget.org/packages/Hangfire.MySqlStorage/)
