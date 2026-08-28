# Hangfire trong ASP.NET Core

**Hangfire** là thư viện thực thi các method .NET ở chế độ nền và lưu thông tin thực thi vào một storage bền vững. Một method được đưa vào Hangfire được gọi là **background job**. Job có thể tiếp tục được xử lý sau khi HTTP request kết thúc, ứng dụng khởi động lại hoặc một worker khác thay thế worker đã dừng.

Bài viết sử dụng một luồng xuyên suốt: xác nhận hồ sơ, sinh PDF và gửi email thông báo. Từ luồng này, bạn sẽ lần lượt cấu hình job đầu tiên, quan sát vòng đời, xử lý retry và đưa hệ thống lên production.

## Phạm vi và phiên bản

Các ví dụ giả định:

- ASP.NET Core trên .NET 8.
- Hangfire 1.8.
- SQL Server làm job storage.
- Ứng dụng đã sử dụng dependency injection và `async`/`await`.

Các khái niệm về job, retry và idempotency áp dụng cho mọi storage. Cơ chế dequeue, distributed lock, thứ tự queue và schema database phụ thuộc vào từng provider; phần tương ứng sẽ ghi rõ khi mô tả riêng SQL Server.

## Bài toán xử lý nền

Giả sử API xác nhận hồ sơ phải sinh PDF, upload file và gửi email trước khi trả response:

```text
HTTP request
    ↓
Xác nhận hồ sơ
    ↓
Sinh PDF
    ↓
Upload file
    ↓
Gửi email
    ↓
HTTP response
```

Nếu toàn bộ luồng chạy trong request, thời gian phản hồi phụ thuộc vào mọi dịch vụ phía sau. Một lần timeout khi upload hoặc gửi email có thể làm request thất bại dù hồ sơ đã được xác nhận.

Hangfire tách công việc có thể xử lý sau khỏi request:

```text
HTTP request                         Hangfire Server
    ↓                                      ↓
Xác nhận hồ sơ                        Lấy job từ storage
    ↓                                      ↓
Tạo background job                   Sinh PDF và gửi email
    ↓                                      ↓
HTTP response                         Cập nhật trạng thái job
```

Việc tạo job không đồng nghĩa với việc nghiệp vụ chắc chắn hoàn thành đúng một lần. Hangfire cung cấp lưu trữ, điều phối và retry; business method vẫn phải chịu được việc bị gọi lại.

## Kiến trúc Hangfire

Hangfire có ba thành phần xử lý chính:

```text
┌───────────────────┐
│ Client            │
│ Tạo job           │
└─────────┬─────────┘
          │ serialize method và arguments
          ▼
┌───────────────────┐
│ Storage           │
│ Lưu job và state  │
└─────────┬─────────┘
          │ dequeue
          ▼
┌───────────────────┐
│ Server            │
│ Thực thi job      │
└───────────────────┘
```

**Client** nhận một expression mô tả type, method và arguments cần gọi. Client serialize mô tả này rồi ghi job vào storage; nó không gọi business method ngay tại thời điểm enqueue.

**Storage** lưu payload, queue, state, lịch retry, recurring job và thông tin server. Storage bền vững là điểm khác biệt quan trọng giữa Hangfire và một task chỉ tồn tại trong process.

**Server** chứa worker và các background process. Worker lấy job từ storage, resolve dependency, gọi method và ghi state mới. Các process khác chuyển delayed job đến queue, tạo lần chạy cho recurring job, cập nhật heartbeat và dọn dữ liệu hết hạn.

**Dashboard** là giao diện quan sát và quản trị, không phải một thành phần bắt buộc để job chạy.

## Cấu hình job đầu tiên

Phần này tạo một API nhỏ để enqueue job xử lý hồ sơ. Infrastructure như repository, PDF service và email service được thay bằng log để ví dụ có thể chạy độc lập.

### Cài đặt package

```bash
dotnet add package Hangfire.AspNetCore --version 1.8.23
dotnet add package Hangfire.SqlServer --version 1.8.23
```

Tạo database `HangfireDb` trước khi chạy. Mặc định, SQL Server provider sẽ tạo hoặc nâng cấp các object trong schema `HangFire` khi ứng dụng khởi động nếu tài khoản kết nối có đủ quyền.

### Cấu hình ứng dụng

```csharp
using Hangfire;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

builder.Services.AddHangfire(configuration =>
{
    configuration
        .SetDataCompatibilityLevel(CompatibilityLevel.Version_180)
        .UseSimpleAssemblyNameTypeSerializer()
        .UseRecommendedSerializerSettings()
        .UseSqlServerStorage(
            builder.Configuration.GetConnectionString("Hangfire"));
});

builder.Services.AddHangfireServer();
builder.Services.AddScoped<IHealthRecordJob, HealthRecordJob>();

var app = builder.Build();

app.UseRouting();
app.UseHangfireDashboard("/hangfire");
app.MapControllers();

app.Run();
```

`AddHangfire` cấu hình client và storage. `AddHangfireServer` đăng ký server dưới dạng hosted service để process hiện tại có thể thực thi job. Một ứng dụng chỉ tạo job nhưng không xử lý job có thể bỏ `AddHangfireServer`; khi đó phải có process khác dùng cùng storage để chạy server.

Connection string phát triển cục bộ:

```json
{
  "ConnectionStrings": {
    "Hangfire": "Server=localhost;Database=HangfireDb;User Id=sa;Password=your_password;TrustServerCertificate=True"
  }
}
```

Không commit password thật vào source control. Ở production, lấy secret từ secret store hoặc biến môi trường của nền tảng triển khai.

### Khai báo job

```csharp
public interface IHealthRecordJob
{
    Task ProcessAsync(
        long healthRecordId,
        CancellationToken cancellationToken);
}
```

Job nhận `healthRecordId` thay vì nhận toàn bộ hồ sơ. Worker có thể dùng ID này để đọc trạng thái mới nhất khi thực thi.

```csharp
public sealed class HealthRecordJob : IHealthRecordJob
{
    private readonly ILogger<HealthRecordJob> _logger;

    public HealthRecordJob(ILogger<HealthRecordJob> logger)
    {
        _logger = logger;
    }

    public async Task ProcessAsync(
        long healthRecordId,
        CancellationToken cancellationToken)
    {
        _logger.LogInformation(
            "Bắt đầu xử lý hồ sơ {HealthRecordId}",
            healthRecordId);

        await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken);

        _logger.LogInformation(
            "Đã xử lý hồ sơ {HealthRecordId}",
            healthRecordId);
    }
}
```

Hangfire tạo một DI scope cho mỗi lần thực thi. Vì vậy job có thể nhận scoped service như `DbContext` hoặc repository qua constructor. Scope được dispose sau khi job kết thúc.

### Enqueue từ API

```csharp
using Hangfire;
using Microsoft.AspNetCore.Mvc;

[ApiController]
[Route("api/health-records")]
public sealed class HealthRecordsController : ControllerBase
{
    private readonly IBackgroundJobClient _backgroundJobClient;

    public HealthRecordsController(
        IBackgroundJobClient backgroundJobClient)
    {
        _backgroundJobClient = backgroundJobClient;
    }

    [HttpPost("{healthRecordId:long}/process")]
    public IActionResult Process(long healthRecordId)
    {
        var jobId = _backgroundJobClient.Enqueue<IHealthRecordJob>(
            job => job.ProcessAsync(
                healthRecordId,
                CancellationToken.None));

        return Accepted(new
        {
            healthRecordId,
            jobId,
            trangThai = "Đang xử lý"
        });
    }
}
```

`CancellationToken.None` chỉ là placeholder trong expression. Trước khi gọi method, Hangfire thay nó bằng token gắn với lần thực thi hiện tại.

Quick start giữ authorization mặc định của Dashboard, chỉ cho phép request cục bộ. Phần production sẽ cấu hình authentication và role riêng.

Sau khi gọi API, mở `/hangfire` trên cùng máy và kiểm tra job lần lượt xuất hiện ở `Enqueued`, `Processing` và `Succeeded`. Log của ứng dụng phải chứa cùng `healthRecordId` đã gửi vào API.

## Vòng đời job

Một fire-and-forget job thành công đi qua luồng cơ bản:

```text
Client tạo job
    ↓
Enqueued
    ↓
Worker dequeue job
    ↓
Processing
    ↓
Succeeded
```

Khi business method ném exception, Hangfire tạo `FailedState`. Filter retry mặc định có thể thay state này bằng `ScheduledState`, khiến job quay lại queue sau một khoảng chờ:

```text
Processing
    ↓ exception
FailedState được đề xuất
    ↓ AutomaticRetry filter
Scheduled
    ↓ đến hạn
Enqueued
    ↓
Processing
```

Bảng `Job` lưu state hiện tại để truy vấn nhanh. Bảng `State` lưu lịch sử chuyển state, nên Dashboard có thể hiển thị exception và các lần thực thi trước.

## Các loại job

### Fire-and-forget job

Fire-and-forget job chạy một lần, sớm nhất khi có worker rảnh:

```csharp
var jobId = _backgroundJobClient.Enqueue<IHealthRecordJob>(
    job => job.ProcessAsync(
        healthRecordId,
        CancellationToken.None));
```

API trả về `jobId` ngay sau khi job được ghi thành công vào storage. `jobId` dùng để tra cứu trạng thái kỹ thuật, không nên thay thế định danh nghiệp vụ của hồ sơ.

### Delayed job

Delayed job chạy một lần sau một khoảng thời gian hoặc tại một thời điểm trong tương lai:

```csharp
var jobId = _backgroundJobClient.Schedule<IHealthRecordJob>(
    job => job.ProcessAsync(
        healthRecordId,
        CancellationToken.None),
    TimeSpan.FromMinutes(30));
```

Job ban đầu nằm trong tập scheduled. Schedule poller kiểm tra các job đến hạn, chuyển chúng sang queue, rồi worker mới có thể thực thi. `SchedulePollingInterval` vì vậy có thể tạo thêm một khoảng trễ nhỏ.

### Recurring job

Recurring job là một định nghĩa lịch được lưu trong storage. Khi lịch đến hạn, recurring scheduler tạo một fire-and-forget job mới; scheduler không trực tiếp gọi business method.

Job tổng hợp dùng một method không cần ID cụ thể:

```csharp
public interface IHealthRecordMaintenanceJob
{
    Task ProcessPendingAsync(CancellationToken cancellationToken);
}
```

Đăng ký lịch bằng một ID ổn định và timezone tường minh:

```csharp
RecurringJob.AddOrUpdate<IHealthRecordMaintenanceJob>(
    "process-pending-health-records",
    job => job.ProcessPendingAsync(CancellationToken.None),
    "0 1 * * *",
    new RecurringJobOptions
    {
        TimeZone = TimeZoneInfo.Utc
    });
```

Ví dụ chạy lúc 01:00 UTC. Khi thực thi, job tự truy vấn một batch hồ sơ đang chờ để giới hạn thời gian chạy và lượng tài nguyên sử dụng.

Recurring scheduler kiểm tra lịch theo phút. Do đó recurring job không phù hợp với lịch yêu cầu độ chính xác theo giây. Server phải luôn hoạt động để tạo lần chạy đúng hạn.

ID `process-pending-health-records` định danh lịch, không định danh một lần chạy. Gọi lại `AddOrUpdate` với cùng ID sẽ cập nhật lịch. ID có thể phân biệt hoa thường tùy storage provider, vì vậy nên dùng một quy ước lowercase ổn định.

Timezone phải được khai báo chủ động. Với lịch theo giờ địa phương, cần kiểm thử thêm thời điểm chuyển daylight saving time; UTC tránh được phần lớn trường hợp giờ bị lặp hoặc bị bỏ qua.

### Continuation job

Continuation tạo một job phụ thuộc vào state cuối của job cha:

```csharp
var processJobId = _backgroundJobClient.Enqueue<IHealthRecordJob>(
    job => job.ProcessAsync(
        healthRecordId,
        CancellationToken.None));

_backgroundJobClient.ContinueJobWith<IHealthRecordNotificationJob>(
    processJobId,
    job => job.NotifyAsync(
        healthRecordId,
        CancellationToken.None),
    JobContinuationOptions.OnlyOnSucceededState);
```

`OnlyOnSucceededState` phù hợp khi email chỉ được gửi sau khi xử lý thành công. `OnAnyFinishedState` phù hợp với cleanup hoặc thông báo kết quả bất kể job cha thành công hay thất bại.

Continuation phù hợp với chuỗi ngắn. Workflow nhiều nhánh, cần compensation hoặc có state nghiệp vụ dài hạn nên lưu state workflow trong database hoặc dùng một orchestrator chuyên biệt.

## Job arguments và dependency injection

Hangfire serialize type, method và arguments khi tạo job. Worker có thể chạy vài phút hoặc vài ngày sau đó, trên một process khác với process đã enqueue.

Truyền ID thay vì toàn bộ entity để payload nhỏ và worker có thể đọc dữ liệu mới nhất:

```csharp
_backgroundJobClient.Enqueue<IHealthRecordJob>(
    job => job.ProcessAsync(
        healthRecord.Id,
        CancellationToken.None));
```

Không đưa các giá trị sau vào arguments:

- `DbContext`, repository hoặc service instance.
- `HttpContext` hoặc thông tin chỉ tồn tại trong request.
- Stream, database connection hoặc transaction đang mở.
- Access token ngắn hạn và secret.
- Object graph lớn hoặc chứa dữ liệu nhạy cảm.

Khi chỉ truyền ID, job phải xử lý được trường hợp dữ liệu đã bị xóa hoặc state nghiệp vụ đã thay đổi. Đây là hành vi bình thường của xử lý bất đồng bộ, không phải lỗi serialization.

## Cancellation và graceful shutdown

Cancellation trong Hangfire là cơ chế **hợp tác**. Hangfire phát tín hiệu yêu cầu dừng qua `CancellationToken`; business method phải quan sát token và tự kết thúc ở một điểm an toàn. Hangfire không dùng `Thread.Abort` và không thể cưỡng bức dừng một database command, HTTP request hoặc SDK đang bỏ qua token.

Job dài nên nhận `CancellationToken` và truyền token xuống mọi API hỗ trợ cancellation:

```csharp
public async Task ProcessAsync(
    long healthRecordId,
    CancellationToken cancellationToken)
{
    var healthRecord = await _repository.GetAsync(
        healthRecordId,
        cancellationToken);

    await _pdfService.GenerateAsync(
        healthRecord,
        cancellationToken);

    cancellationToken.ThrowIfCancellationRequested();

    await _emailService.SendAsync(
        healthRecord,
        cancellationToken);
}
```

`CancellationToken.None` trong expression enqueue không phải token thật của request. Trước khi thực thi, Hangfire thay argument này bằng token gắn với lần chạy hiện tại.

### Nguồn phát tín hiệu cancellation

Hangfire hủy token trong hai nhóm tình huống:

- Host bắt đầu graceful shutdown. Job hợp tác với cancellation dừng sớm hơn và job bị gián đoạn có thể được đưa trở lại queue để một server khác xử lý.
- Job đang chạy không còn ở state `Processing`, chẳng hạn quản trị viên chuyển nó sang `Deleted`. Cancellation watcher phát hiện state đã đổi và hủy token của lần chạy tương ứng.

Việc bấm `Delete` trên Dashboard đối với job đang chạy vì vậy không giết thread ngay lập tức. Luồng thực tế là:

```text
Job đang Processing
    ↓
Dashboard/API chuyển job sang Deleted
    ↓
Cancellation watcher phát hiện state thay đổi
    ↓
CancellationToken được hủy
    ↓
Business method quan sát token
    ↓
OperationCanceledException kết thúc lần chạy
```

Nếu method không nhận token, không truyền token xuống dependency hoặc đang mắc trong một API không hỗ trợ cancellation, code có thể tiếp tục chạy dù Dashboard đã hiển thị `Deleted`.

### Cancel job bằng code

`BackgroundJob.Delete` chuyển job sang `Deleted`. Với job chưa chạy, state mới ngăn worker xử lý job theo luồng bình thường. Với job đang chạy, state mới đồng thời tạo điều kiện để cancellation watcher hủy token:

```csharp
var changed = BackgroundJob.Delete(jobId);

if (!changed)
{
    // Job không tồn tại hoặc state đã thay đổi trong lúc xử lý request.
}
```

Giá trị trả về chỉ cho biết state transition có được áp dụng hay không; nó không chứng minh business method đã dừng. API quản trị nên trả về trạng thái kiểu `Cancellation requested` và tiếp tục quan sát state nghiệp vụ thay vì trả về `Cancelled successfully` ngay lập tức.

Nếu chỉ muốn hủy khi job vẫn đang `Processing`, truyền expected state để tránh xóa nhầm một job vừa hoàn thành do race condition:

```csharp
var changed = BackgroundJob.Delete(
    jobId,
    fromState: ProcessingState.StateName);
```

Đoạn code trên cần `using Hangfire.States;`.

### Cancellation polling interval

Hangfire Server dùng một background process để kiểm tra state của các job có `CancellationToken`. Khoảng kiểm tra mặc định là 5 giây và có thể cấu hình:

```csharp
builder.Services.AddHangfireServer(options =>
{
    options.CancellationCheckInterval = TimeSpan.FromSeconds(2);
});
```

Khoảng ngắn giúp job nhận tín hiệu nhanh hơn nhưng tăng số lần đọc storage. Đây không phải timeout cưỡng bức; sau khi token bị hủy, thời gian dừng vẫn phụ thuộc vào điểm tiếp theo mà business method hoặc dependency quan sát token.

### Xử lý OperationCanceledException

Job có thể log thêm context trước khi kết thúc, nhưng phải ném lại exception thay vì nuốt cancellation và tiếp tục sang bước kế tiếp:

```csharp
public async Task ProcessAsync(
    long healthRecordId,
    CancellationToken cancellationToken)
{
    try
    {
        await _pdfService.GenerateAsync(
            healthRecordId,
            cancellationToken);

        cancellationToken.ThrowIfCancellationRequested();

        await _emailService.SendAsync(
            healthRecordId,
            cancellationToken);
    }
    catch (OperationCanceledException)
        when (cancellationToken.IsCancellationRequested)
    {
        _logger.LogInformation(
            "Đã nhận yêu cầu dừng job của hồ sơ {HealthRecordId}",
            healthRecordId);

        throw;
    }
}
```

`finally` phù hợp để dispose stream hoặc xóa file tạm. Không dùng `finally` để đánh dấu nghiệp vụ `Completed`, vì block này cũng chạy khi job bị cancel hoặc thất bại.

### Trạng thái cancellation của nghiệp vụ

State `Deleted` của Hangfire là trạng thái kỹ thuật và có thể bị dọn theo retention. Với thao tác người dùng như “hủy sinh báo cáo”, ứng dụng nên lưu yêu cầu hủy trong business database:

```text
HealthRecordProcessing
────────────────────────────────────
healthRecordId      123
trangThai           CancelRequested
cancelRequestedAt   ...
cancelRequestedBy   ...
```

Job kiểm tra `CancelRequested` trước mỗi side effect lớn. Cách này cho phép audit, reconciliation và tiếp tục hoạt động ngay cả khi job đã chuyển worker hoặc Hangfire state không còn được lưu.

Xóa một recurring job bằng `RecurringJob.RemoveIfExists` chỉ ngăn scheduler tạo các lần chạy trong tương lai. Nó không tự dừng fire-and-forget job đã được recurring scheduler tạo trước đó; muốn dừng lần chạy hiện tại, cần tìm đúng `jobId` của lần chạy và áp dụng quy trình cancellation riêng.

### Side effect và cleanup

Cancellation không rollback side effect đã hoàn thành. Nếu PDF đã upload trước khi token bị hủy, lần chạy sau vẫn phải nhận biết và xử lý an toàn trạng thái đó.

Mỗi stage nên có ranh giới rõ ràng:

```text
Kiểm tra cancellation
    ↓
Tạo file tạm
    ↓
Kiểm tra cancellation
    ↓
Upload với idempotency key
    ↓
Ghi state nghiệp vụ
    ↓
Kiểm tra cancellation
    ↓
Gửi email với idempotency key
```

Nếu SDK ngoài không hỗ trợ `CancellationToken`, cấu hình timeout của chính SDK và dùng cancellation API của provider nếu có. Không bọc một blocking call bằng `Task.Run` rồi coi đó là cancel an toàn; code bên trong vẫn có thể tiếp tục tạo side effect sau khi task phía ngoài đã dừng chờ.

## Retry và at-least-once processing

`AutomaticRetryAttribute` điều khiển số lần retry tự động sau lần chạy ban đầu. Khi enqueue qua interface, đặt filter trên method của interface để expression và filter metadata cùng tham chiếu một method:

```csharp
public interface IHealthRecordJob
{
    [AutomaticRetry(
        Attempts = 3,
        OnAttemptsExceeded = AttemptsExceededAction.Fail)]
    Task ProcessAsync(
        long healthRecordId,
        CancellationToken cancellationToken);
}
```

`Attempts = 3` tạo tối đa bốn lần thực thi:

```text
Lần chạy ban đầu
    ↓ lỗi
Retry 1
    ↓ lỗi
Retry 2
    ↓ lỗi
Retry 3
    ↓ lỗi
Failed
```

Nếu không cấu hình lại, filter toàn cục của Hangfire cho phép 10 lần retry tự động với delay tăng dần. Không nên retry giống nhau cho mọi exception:

- Timeout, lỗi mạng tạm thời và HTTP `429` thường có thể retry.
- Validation error, dữ liệu không tồn tại theo nghiệp vụ hoặc cấu hình sai thường cần dừng và cảnh báo.
- Retry với API ngoài phải tôn trọng rate limit và nên có backoff phù hợp.

Ngay cả khi đặt `Attempts = 0`, job vẫn có thể chạy lại do worker shutdown hoặc compensation logic của storage. Mô hình an toàn là **at-least-once processing**: hệ thống cố gắng xử lý job ít nhất một lần, nhưng một lần xử lý có thể bị lặp.

Ví dụ điển hình:

```text
Worker gửi email thành công
    ↓
Process crash trước khi ghi Succeeded
    ↓
Storage phục hồi job
    ↓
Worker khác gọi lại method
    ↓
Email có nguy cơ được gửi lần hai
```

## Idempotency

Một operation idempotent có thể được gọi lại với cùng business key mà không tạo thêm kết quả nghiệp vụ ngoài ý muốn.

Kiểm tra một cột trạng thái trước khi xử lý chỉ là lớp bảo vệ cơ bản:

```csharp
if (healthRecord.pdfStatus == PdfStatus.Completed)
{
    return;
}
```

Đoạn kiểm tra này không đủ khi hai worker cùng đọc state cũ, hoặc process crash sau khi tạo PDF nhưng trước khi lưu `Completed`.

### Ràng buộc duy nhất và compare-and-set

Với side effect nằm hoàn toàn trong database, dùng unique constraint hoặc một câu lệnh compare-and-set trong transaction:

```sql
UPDATE health_record
SET pdfStatus = 'Processing'
WHERE id = @healthRecordId
  AND pdfStatus = 'Pending';
```

Chỉ worker nhận `rowsAffected = 1` được quyền tiếp tục. Thiết kế phải có chiến lược phục hồi state `Processing` khi worker chết, chẳng hạn lease có `expiresAt` hoặc một reconciliation job.

### Idempotency key cho hệ thống ngoài

Nếu email provider, payment gateway hoặc API đích hỗ trợ idempotency key, dùng business key ổn định:

```csharp
var idempotencyKey = $"health-record-email:{healthRecordId}";

await _emailGateway.SendAsync(
    recipient: healthRecord.email,
    template: "health-record-completed",
    idempotencyKey,
    cancellationToken);
```

Lần retry sử dụng lại cùng key. Provider có thể trả về kết quả cũ thay vì tạo thêm một lần gửi.

### Bảng execution

Khi tự quản lý idempotency, bảng execution cần tối thiểu:

```text
JobExecution
────────────────────────────────────────
businessKey      health-record:123
operation        generate-pdf
status           Processing
attempt          2
leaseExpiresAt   ...
completedAt      ...
```

Tạo unique constraint trên `(businessKey, operation)`. Việc acquire phải là một thao tác atomic; chỉ kiểm tra bằng `SELECT` rồi `INSERT` không đủ để chống race condition.

## Giới hạn chạy đồng thời

Reliable dequeue ngăn nhiều worker bình thường cùng nhận một queue item tại cùng thời điểm. Cơ chế cụ thể thuộc về storage provider, không nên mô hình hóa thành một distributed lock riêng cho từng `JobId`.

Hai request vẫn có thể enqueue hai job khác nhau cho cùng một hồ sơ. `[DisableConcurrentExecution]` giảm khả năng hai job gọi cùng method chạy song song. Với cách enqueue qua interface đang dùng, filter được đặt trên interface method:

```csharp
public interface IHealthRecordJob
{
    [DisableConcurrentExecution(timeoutInSeconds: 30)]
    Task ProcessAsync(
        long healthRecordId,
        CancellationToken cancellationToken);
}
```

Filter này dùng distributed lock gắn với resource của method và phụ thuộc vào connection tới storage. Nếu connection bị ngắt, lock có thể mất trong khi business method chưa dừng. Đây là cơ chế best effort, không thay thế unique constraint, transaction, compare-and-set hoặc idempotency key.

Nếu cần giới hạn theo từng hồ sơ thay vì khóa toàn bộ method, business resource phải tham gia vào cơ chế concurrency control. Hangfire.Throttling có mutex động theo argument nhưng thuộc gói thương mại và vẫn không thay thế idempotency.

## Transaction boundary và Outbox Pattern

Business database và Hangfire storage thường là hai transaction độc lập:

```text
Business transaction commit
            ≠
Hangfire storage transaction commit
```

Enqueue trước khi business transaction commit có thể tạo job tham chiếu đến dữ liệu đã rollback. Commit trước rồi enqueue vẫn có một cửa sổ mà process có thể crash khiến job không được tạo.

Outbox Pattern ghi business data và ý định xử lý nền trong cùng transaction:

```text
Business transaction
├── INSERT healthRecord
└── INSERT outboxMessage
        ↓
      COMMIT

Outbox dispatcher
    ↓
Đọc message chưa dispatch
    ↓
Enqueue Hangfire job
    ↓
Đánh dấu message đã dispatch
```

Dispatcher có thể crash sau khi enqueue nhưng trước khi đánh dấu message. Khi chạy lại, nó có thể enqueue thêm một job. Vì vậy Outbox ngăn mất ý định xử lý nhưng vẫn phải kết hợp với idempotency ở consumer.

Với hệ thống nhỏ và nghiệp vụ có thể reconciliation, commit trước rồi enqueue có thể là trade-off hợp lý. Với thanh toán, hóa đơn, xuất kho hoặc tích hợp liên hệ thống, nên dùng Outbox và reconciliation job.

## Queue và worker

Queue tách các nhóm workload để chúng không tranh toàn bộ worker:

```csharp
[Queue("critical")]
public Task ConfirmAsync(
    long healthRecordId,
    CancellationToken cancellationToken)
{
    // ...
}

[Queue("pdf")]
public Task GeneratePdfAsync(
    long healthRecordId,
    CancellationToken cancellationToken)
{
    // ...
}
```

Một server có thể chỉ nghe một số queue:

```csharp
builder.Services.AddHangfireServer(options =>
{
    options.Queues = new[] { "critical", "default" };
    options.WorkerCount = 8;
});
```

Một Worker Service riêng có thể nghe queue PDF:

```csharp
builder.Services.AddHangfireServer(options =>
{
    options.Queues = new[] { "pdf" };
    options.WorkerCount = 2;
});
```

Thứ tự xử lý queue phụ thuộc storage provider. Hangfire.SqlServer dùng thứ tự chữ cái và bỏ qua thứ tự phần tử trong array; Hangfire.Pro.Redis có thể dùng thứ tự array. Queue vì vậy phù hợp để cô lập workload và scale độc lập hơn là biểu diễn priority tuyệt đối.

`WorkerCount` là số job tối đa mà một server có thể xử lý đồng thời. Tăng worker chỉ giúp khi dependency phía sau còn capacity:

- Job I/O-bound bị giới hạn bởi connection pool, rate limit và network throughput.
- Job CPU-bound bị giới hạn bởi CPU, RAM và GC.
- Mỗi job đang `await` vẫn giữ một worker slot của Hangfire cho đến khi method hoàn thành.

Điều chỉnh worker dựa trên queue latency, throughput và saturation của dependency, không dựa riêng vào CPU của process.

## Storage và reliable dequeue

`JobStorage` là abstraction. Mỗi provider tự triển khai enqueue, dequeue, lock, visibility timeout và compensation.

### SQL Server

Với cấu hình polling thông thường, worker truy vấn `JobQueue`, lấy một item hợp lệ và đánh dấu `FetchedAt`. Khi bật sliding invisibility timeout, item đã fetch tạm thời không được worker khác lấy. Worker còn sống gia hạn trạng thái ẩn trong lúc xử lý.

Nếu worker chết trước khi hoàn tất, timeout hết hạn làm item có thể được lấy lại. Cơ chế này là một nguyên nhân của at-least-once processing.

```csharp
builder.Services.AddHangfire(configuration =>
{
    configuration.UseSqlServerStorage(
        builder.Configuration.GetConnectionString("Hangfire"),
        new SqlServerStorageOptions
        {
            CommandBatchMaxTimeout = TimeSpan.FromMinutes(5),
            SlidingInvisibilityTimeout = TimeSpan.FromMinutes(5),
            QueuePollInterval = TimeSpan.Zero,
            UseRecommendedIsolationLevel = true,
            DisableGlobalLocks = true
        });
});
```

`QueuePollInterval = TimeSpan.Zero` chọn đường dequeue độ trễ thấp của provider; nó không phải một busy loop liên tục chạy `SELECT`.

`DisableGlobalLocks = true` yêu cầu SQL Server schema 7 trở lên. Với database đã tồn tại, kiểm tra và triển khai schema migration trước khi bật tùy chọn này.

### Redis và provider khác

Redis provider có thể dùng blocking queue operation để đánh thức worker khi có job. PostgreSQL, MySQL và các storage cộng đồng có schema, lock, queue ordering và timeout riêng.

Không sao chép tuning option hoặc giả định của SQL Server sang provider khác nếu tài liệu provider không xác nhận hành vi tương đương.

### SQL Server schema

Trên Hangfire.SqlServer 1.8, các bảng chính trong schema `HangFire` gồm:

| Bảng | Vai trò |
| --- | --- |
| `Job` | Payload và state hiện tại của job |
| `State` | Lịch sử chuyển state |
| `JobParameter` | Parameter nội bộ gắn với job |
| `JobQueue` | Queue item và thời điểm fetch |
| `Server` | Heartbeat và cấu hình server |
| `Set`, `List`, `Hash` | Cấu trúc dữ liệu cho schedule, recurring job và monitoring |
| `Counter`, `AggregatedCounter` | Số liệu tổng hợp cho Dashboard |
| `Schema` | Phiên bản schema hiện tại |

SQL Server provider hiện tại không tạo bảng `DistributedLock`; một số distributed lock dùng SQL Server application lock. Không suy ra schema của PostgreSQL, MySQL hoặc Redis từ bảng trên.

Schema là implementation detail và có thể thay đổi theo version. Code nghiệp vụ không nên truy vấn hay cập nhật trực tiếp các bảng Hangfire. Dùng client, Dashboard hoặc Monitoring API để thao tác job.

## Topology triển khai

### Server trong API process

Chạy `AddHangfireServer` trong API là lựa chọn đơn giản khi workload nhẹ, thời gian job ngắn và nền tảng bảo đảm ứng dụng luôn hoạt động.

Nhược điểm là job chia sẻ CPU, RAM, connection pool và lifecycle deploy với API. Scale API cũng đồng thời thay đổi số worker nếu mỗi instance đều khởi động Hangfire Server.

### Worker process riêng

Tách worker khi job dùng nhiều CPU/RAM, chạy dài, cần scale độc lập hoặc không nên bị gián đoạn theo nhịp deploy của API:

```text
ASP.NET Core API
    ↓ enqueue
Shared Hangfire Storage
    ↑ dequeue
.NET Worker Service
```

Client và server dùng chung storage phải có code tương thích với các job còn tồn tại. Đổi namespace, assembly, type, method signature hoặc argument DTO có thể khiến job cũ không deserialize hoặc không tìm được method.

Với rolling deployment:

1. Giữ method cũ trong thời gian job cũ còn tồn tại.
2. Thêm method/version mới thay vì đổi signature tại chỗ.
3. Deploy worker hiểu cả payload cũ và mới trước khi producer enqueue định dạng mới.
4. Chỉ xóa code cũ sau khi queue, scheduled job và retry cũ đã được xử lý hoặc migrate.

## Observability và vận hành

Dashboard giúp điều tra từng job nhưng không thay thế monitoring. Hệ thống production nên thu thập:

- Queue length và tuổi của job cũ nhất.
- Thời gian từ `CreatedAt` đến lúc bắt đầu xử lý.
- Processing duration và throughput theo job type.
- Failed rate, retry rate và số job hết retry.
- Worker heartbeat, CPU, RAM và GC.
- Database connection usage và latency của API ngoài.

Log mỗi lần thực thi nên có:

- `jobId` của Hangfire.
- Business key như `healthRecordId`.
- Job type và retry attempt.
- Correlation/trace ID nếu job tiếp tục một request hoặc workflow.

Alert nên dựa trên tác động vận hành, chẳng hạn tuổi backlog vượt SLO hoặc failed rate tăng liên tục. Chỉ alert khi tồn tại một job `Failed` thường tạo quá nhiều nhiễu.

Runbook tối thiểu cần mô tả:

1. Cách xác định lỗi transient hay permanent.
2. Điều kiện được retry hoặc requeue thủ công.
3. Cách sửa poison job hoặc dữ liệu đầu vào sai.
4. Cách xử lý worker mất heartbeat và queue không được lắng nghe.
5. Cách reconciliation các business record không có kết quả tương ứng.

## Dashboard và bảo mật

Dashboard hiển thị method, arguments, exception, stack trace và cung cấp thao tác retry/delete. Không public Dashboard mà không có authorization. Ví dụ dưới đây giả định ứng dụng đã đăng ký authentication và authorization services.

```csharp
using Hangfire.Dashboard;

public sealed class HangfireAuthorizationFilter
    : IDashboardAuthorizationFilter
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

app.UseHangfireDashboard(
    "/hangfire",
    new DashboardOptions
    {
        Authorization = new IDashboardAuthorizationFilter[]
        {
            new HangfireAuthorizationFilter()
        }
    });
```

Ngoài role authorization, nên giới hạn bằng private network, VPN hoặc reverse proxy. Không truyền token, password, dữ liệu y tế hoặc dữ liệu cá nhân vào arguments vì payload có thể xuất hiện trên Dashboard và trong storage.

Mọi thao tác retry, delete hoặc requeue thủ công cần audit theo người thực hiện, thời điểm và lý do.

## Schema migration và retention

SQL Server provider có thể tự chuẩn bị schema khi khởi động. Cách này thuận tiện cho môi trường phát triển nhưng tài khoản runtime ở production không nên mặc định có quyền DDL.

Quy trình production nên:

1. Pin version package thay vì dùng version trôi nổi.
2. Đọc upgrade guide của Hangfire và storage provider.
3. Chạy migration bằng deployment step có quyền riêng.
4. Kiểm tra backward/forward compatibility trước rolling deployment.
5. Theo dõi lock, thời gian migration và kích thước bảng.

Job thành công và dữ liệu monitoring có thời hạn lưu. Retention dài làm storage tăng nhanh; retention quá ngắn làm mất dữ liệu điều tra. Chọn thời hạn theo nhu cầu audit và quan sát, sau đó theo dõi tốc độ tăng của database.

## Kiểm thử job

Business method nên có thể unit test như một service bình thường. Inject `IBackgroundJobClient` giúp test producer mà không phụ thuộc static global state:

```csharp
public sealed class HealthRecordService
{
    private readonly IBackgroundJobClient _backgroundJobClient;

    public HealthRecordService(
        IBackgroundJobClient backgroundJobClient)
    {
        _backgroundJobClient = backgroundJobClient;
    }

    // Producer methods...
}
```

Unit test kiểm tra business branch, idempotency và exception classification. Integration test với storage thật kiểm tra thêm serialization, DI activation, queue routing, retry filter và schema compatibility.

Các kịch bản quan trọng:

- Gọi cùng business key hai lần.
- Crash sau external side effect nhưng trước khi lưu state.
- Cancellation khi job đang xử lý.
- Dữ liệu bị xóa sau khi enqueue.
- Worker cũ nhận payload do producer phiên bản mới tạo.
- Outbox dispatcher enqueue trùng sau khi restart.

## So sánh với Task.Run

```csharp
Task.Run(() => GeneratePdf());
```

Task trên chỉ tồn tại trong process hiện tại. Khi process dừng, ứng dụng không có persistent record để worker khác tiếp tục.

| Khả năng | `Task.Run` | Hangfire |
| --- | --- | --- |
| Persistent storage | Không | Có |
| Retry | Tự xây dựng | Có filter mặc định |
| Scheduled và recurring job | Không có sẵn | Có |
| Multi-server coordination | Không có sẵn | Do storage provider hỗ trợ |
| Dashboard và job history | Không | Có |
| Queue isolation | Không có sẵn | Có |
| Bảo đảm exactly-once | Không | Không |

`Task.Run` phù hợp với parallel work gắn với lifetime của operation hiện tại. Không dùng nó để thay thế một hệ thống background processing khi công việc phải tồn tại sau HTTP response hoặc process restart.

## Tổng kết

- Hangfire lưu lời gọi method vào persistent storage và để server thực thi ngoài HTTP request.
- Client, storage và server là ba thành phần xử lý chính; Dashboard phục vụ quan sát và quản trị.
- Job phải nhận arguments nhỏ, resolve dependency qua DI và hỗ trợ cancellation khi chạy dài.
- Retry và worker recovery tạo mô hình at-least-once; idempotency thuộc trách nhiệm của business operation.
- `DisableConcurrentExecution` và distributed lock chỉ là lớp bảo vệ best effort, không thay thế transaction hoặc unique constraint.
- Outbox ngăn mất ý định xử lý nhưng vẫn có thể tạo duplicate, vì vậy consumer vẫn phải idempotent.
- Production cần queue isolation, topology phù hợp, schema migration có kiểm soát, observability, bảo mật và runbook phục hồi.

## Tài liệu tham khảo

- [Hangfire documentation](https://docs.hangfire.io/en/latest/)
- [ASP.NET Core applications](https://docs.hangfire.io/en/latest/getting-started/aspnet-core-applications.html)
- [Calling methods in background](https://docs.hangfire.io/en/latest/background-methods/calling-methods-in-background.html)
- [Dealing with exceptions](https://docs.hangfire.io/en/latest/background-processing/dealing-with-exceptions.html)
- [Using cancellation tokens](https://docs.hangfire.io/en/latest/background-methods/using-cancellation-tokens.html)
- [Configuring job queues](https://docs.hangfire.io/en/latest/background-processing/configuring-queues.html)
- [Using SQL Server](https://docs.hangfire.io/en/latest/configuration/using-sql-server.html)
- [Concurrency and rate limiting](https://docs.hangfire.io/en/latest/background-processing/throttling.html)
