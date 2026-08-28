# Middleware trong ASP.NET Core

Middleware là một đoạn code nằm trên đường đi của mỗi HTTP request trong ASP.NET Core. Trước khi request đến controller action, middleware có thể kiểm tra hoặc bổ sung thông tin; sau khi action xử lý xong, nó có thể tiếp tục kiểm tra hoặc thay đổi response.

ASP.NET Core có hai cách khai báo endpoint: Controller (`ControllerBase`, `[ApiController]`) và Minimal API (`MapGet`, `MapPost` gọi trực tiếp trên `WebApplication`). Middleware — `Use`, `Run`, `Map`, class middleware — xử lý ở tầng `IApplicationBuilder`, trước khi routing chọn ra endpoint cụ thể, nên hoạt động giống nhau ở cả hai cách khai báo. Các ví dụ dưới đây dùng Controller cho endpoint và class cho middleware.

---

## 1. Middleware là gì

Hãy hình dung request là một người đi qua nhiều trạm kiểm soát. Mỗi trạm là một middleware. Trạm có thể cho đi tiếp, trả kết quả ngay, hoặc xử lý việc gì đó trước và sau trạm kế tiếp.

| Khái niệm | Ý nghĩa đơn giản |
| --- | --- |
| Request | Dữ liệu client gửi lên, ví dụ `GET /api/orders/10`. |
| Response | Kết quả API trả về: status code, header và body. |
| `HttpContext` | Đối tượng chứa toàn bộ thông tin của request/response hiện tại. |
| Endpoint | Điểm xử lý cuối: controller action, health check, SignalR hub... |
| Pipeline | Thứ tự các middleware và endpoint mà request đi qua. |
| `next` | Lệnh chuyển request sang middleware hoặc endpoint tiếp theo. |

Ví dụ: middleware xác thực đọc `Authorization` header và đặt người dùng đã xác thực vào `HttpContext.User`; middleware phân quyền đọc user đó để quyết định endpoint có được chạy hay không.

> **Lưu ý:** Middleware xử lý chính sách chung cho HTTP. Nghiệp vụ cụ thể của đơn hàng, thanh toán hay bệnh án nên ở application/domain layer, không đặt tại đây.

## 2. Cài đặt và cấu hình tối thiểu

Tạo project ASP.NET Core Web API dùng Controller:

```bash
dotnet new webapi --use-controllers -o SampleApi
cd SampleApi
```

`Program.cs` sau khi khởi tạo có cấu trúc tối thiểu sau:

```csharp
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();

var app = builder.Build();

app.UseHttpsRedirection();
app.UseAuthorization();

app.MapControllers();

app.Run();
```

| Dòng | Vai trò |
| --- | --- |
| `builder.Services.AddControllers()` | Đăng ký các service MVC cần thiết để controller hoạt động: model binding, action result, validation... |
| `app.Build()` | Tạo `WebApplication`, đồng thời là `IApplicationBuilder` để đăng ký middleware. |
| `app.Use...(...)` | Thêm middleware vào pipeline, theo đúng thứ tự sẽ thực thi. |
| `app.MapControllers()` | Đăng ký endpoint dựa trên route attribute (`[Route]`, `[HttpGet]`...) khai báo trên controller. |

Controller mẫu dùng xuyên suốt tài liệu:

```csharp
[ApiController]
[Route("api/[controller]")]
public sealed class PingController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok("pong");
}
```

## 3. Mô hình thực thi

Một middleware nhận `HttpContext` và một delegate đại diện cho bước kế tiếp (`RequestDelegate`).

```text
Request  -->  A (before) --> B (before) --> Endpoint
Response <--  A (after)  <-- B (after)  <-- Endpoint
```

Ví dụ ngắn nhất, thêm hai middleware trước `PingController`. Middleware ở đây là một class implement quy ước `InvokeAsync(HttpContext)`, không phải lambda khai báo trực tiếp trong `Program.cs`:

```csharp
public sealed class LabeledLoggingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly string _label;

    public LabeledLoggingMiddleware(RequestDelegate next, string label)
    {
        _next = next;
        _label = label;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        Console.WriteLine($"{_label}: before");
        await _next(context);
        Console.WriteLine($"{_label}: after");
    }
}
```

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();

var app = builder.Build();

app.UseMiddleware<LabeledLoggingMiddleware>("A");
app.UseMiddleware<LabeledLoggingMiddleware>("B");

app.MapControllers();

app.Run();
```

```csharp
[ApiController]
[Route("api/[controller]")]
public sealed class PingController : ControllerBase
{
    [HttpGet]
    public IActionResult Get()
    {
        Console.WriteLine("Endpoint");
        return Ok("pong");
    }
}
```

`UseMiddleware<T>(...)` chấp nhận thêm tham số ngoài `RequestDelegate`; các tham số đó được truyền vào constructor của middleware sau `next`, ở đây là chuỗi `"A"` và `"B"` để phân biệt hai instance cùng loại.

Gọi `GET /api/ping` sẽ in:

```text
A: before
B: before
Endpoint
B: after
A: after
```

`await _next(context)` là ranh giới quan trọng. Code trước nó xử lý request đi vào; code sau nó xử lý response đi ra. Nếu không gọi `_next`, các bước sau và endpoint sẽ không chạy.

## 4. Ba cách thêm middleware

### `Use`: bao quanh bước tiếp theo

`Use` phù hợp khi cần làm việc ở cả hai chiều.

```csharp
public sealed class TimingMiddleware
{
    private readonly RequestDelegate _next;

    public TimingMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var startedAt = Stopwatch.GetTimestamp();
        await _next(context);

        var elapsedMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
        Console.WriteLine($"{context.Response.StatusCode} in {elapsedMs:N0} ms");
    }
}
```

```csharp
app.UseMiddleware<TimingMiddleware>();
```

### `Run`: middleware kết thúc pipeline

`Run` không có `next`; request luôn dừng tại đây.

```csharp
public static class NotFoundHandler
{
    public static async Task HandleAsync(HttpContext context)
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        await context.Response.WriteAsync("No endpoint matched");
    }
}
```

```csharp
app.Run(NotFoundHandler.HandleAsync);
```

Đặt `Run` trước `MapControllers` hoặc middleware khác sẽ làm các bước sau không thể chạy. Vì vậy nó thường chỉ xuất hiện ở cuối pipeline hoặc trong nhánh riêng.

### `Map` và `UseWhen`: rẽ nhánh

`Map` tạo một nhánh theo path và loại bỏ phần prefix đã match khỏi `Request.Path` trong lúc chạy nhánh.

```csharp
public sealed class InternalKeyAuthMiddleware
{
    private readonly RequestDelegate _next;

    public InternalKeyAuthMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (!context.Request.Headers.ContainsKey("X-Internal-Key"))
        {
            context.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }

        await _next(context);
    }
}

public static class InternalBranch
{
    public static void Configure(IApplicationBuilder internalApp)
    {
        internalApp.UseMiddleware<InternalKeyAuthMiddleware>();
        internalApp.Run(HandleAsync);
    }

    private static Task HandleAsync(HttpContext context) =>
        context.Response.WriteAsync("Internal API");
}
```

```csharp
app.Map("/internal", InternalBranch.Configure);
```

`UseWhen` rẽ nhánh theo điều kiện nhưng sau khi nhánh hoàn tất có thể quay lại pipeline chính.

```csharp
public sealed class ApiHeaderMiddleware
{
    private readonly RequestDelegate _next;

    public ApiHeaderMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        context.Response.Headers["X-Api"] = "true";
        await _next(context);
    }
}

public static class ApiBranch
{
    public static bool IsApiRequest(HttpContext context) =>
        context.Request.Path.StartsWithSegments("/api");

    public static void Configure(IApplicationBuilder apiApp) =>
        apiApp.UseMiddleware<ApiHeaderMiddleware>();
}
```

```csharp
app.UseWhen(ApiBranch.IsApiRequest, ApiBranch.Configure);
```

Chọn `Map` cho khu vực tách biệt rõ ràng như `/internal` hoặc `/metrics`; chọn `UseWhen` cho behavior điều kiện vẫn cần tiếp tục pipeline chung.

## 5. Khi nào nên dùng middleware

Middleware phù hợp cho concern có phạm vi HTTP toàn cục hoặc theo nhánh:

- Chuẩn hóa lỗi, correlation ID, logging, metric, security header.
- CORS, HTTPS redirect, authentication, authorization, rate limiting.
- Kiểm tra bảo trì, tenant context, giới hạn request body, cache response.

Không nên để business rule cụ thể trong middleware, ví dụ "đơn đã duyệt không được sửa" hay "bác sĩ chỉ xem phiếu khám được phân công". Những rule đó cần dữ liệu nghiệp vụ, authorization theo resource và transaction rõ ràng; chúng thuộc application/domain layer.

## 6. Thứ tự pipeline thực tế

Thứ tự quyết định tính đúng đắn. Một cấu hình API thường có dạng:

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();

var app = builder.Build();

app.UseExceptionHandler("/error");
app.UseForwardedHeaders();
app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();
app.UseCors("frontend");
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapControllers();
app.MapHealthChecks("/health");

app.Run();
```

Các quan hệ cần giữ:

| Thành phần | Lý do đặt vị trí này |
| --- | --- |
| Exception handler | Đặt sớm để bao được exception từ các bước phía sau. |
| Forwarded headers | Đặt trước HTTPS redirect và code đọc scheme/IP thật. Chỉ tin proxy đã được cấu hình rõ. |
| Static files | Có thể trả file ngay, tránh đi qua controller. |
| Routing | Chọn endpoint và metadata. |
| CORS | Sau routing để dùng endpoint metadata, trước auth/authorization để preflight được trả đúng. |
| Authentication | Tạo `HttpContext.User`. |
| Authorization | Đọc user và metadata `[Authorize]` / policy của endpoint. |
| Rate limiting | Có thể chọn policy theo endpoint hoặc identity đã xác thực. |

Trong hosting hiện đại, `MapControllers()` đăng ký endpoint theo route attribute; routing/endpoint middleware thường được framework tự thêm khi không gọi tường minh. Gọi `UseRouting()` là hữu ích khi cần đặt middleware giữa routing và endpoint execution.

## 7. Tạo middleware tùy chỉnh

Middleware nên là một class riêng khi behavior có tên riêng, được dùng lại, cần test hoặc có dependency.

### Ví dụ minh họa: thêm request ID

Ví dụ này tạo middleware tùy chỉnh, thêm `X-Request-ID` vào response, sau đó controller action trả lại chính ID đó.

```csharp
public sealed class RequestIdMiddleware
{
    private readonly RequestDelegate _next;

    public RequestIdMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var requestId = context.Request.Headers["X-Request-ID"].FirstOrDefault();
        context.TraceIdentifier = string.IsNullOrWhiteSpace(requestId)
            ? Guid.NewGuid().ToString("N")
            : requestId;

        context.Response.Headers["X-Request-ID"] = context.TraceIdentifier;
        await _next(context);
    }
}
```

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();

var app = builder.Build();

app.UseMiddleware<RequestIdMiddleware>();

app.MapControllers();

app.Run();
```

```csharp
[ApiController]
[Route("api/[controller]")]
public sealed class PingController : ControllerBase
{
    [HttpGet]
    public IActionResult Get() => Ok(new
    {
        message = "pong",
        requestId = HttpContext.TraceIdentifier
    });
}
```

Gọi `GET /api/ping`. Nếu client gửi `X-Request-ID: demo-001`, response header và JSON body đều có `demo-001`; nếu không gửi, ứng dụng tạo một ID mới. Đây là mẫu đơn giản để hiểu ba việc cốt lõi: nhận `HttpContext`, làm việc trước `next`, rồi chuyển request đi tiếp.

### Tách registration thành extension method

Ví dụ middleware đo thời gian và thêm response header, lần này có logger được inject qua DI:

```csharp
using System.Diagnostics;

public sealed class RequestTimingMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<RequestTimingMiddleware> _logger;

    public RequestTimingMiddleware(
        RequestDelegate next,
        ILogger<RequestTimingMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var startedAt = Stopwatch.GetTimestamp();

        await _next(context);

        var elapsedMs = Stopwatch.GetElapsedTime(startedAt).TotalMilliseconds;
        context.Response.Headers["X-Response-Time-Ms"] = elapsedMs.ToString("F0");

        _logger.LogInformation(
            "HTTP {Method} {Path} returned {StatusCode} in {ElapsedMs:0.0} ms",
            context.Request.Method,
            context.Request.Path,
            context.Response.StatusCode,
            elapsedMs);
    }
}

public static class RequestTimingMiddlewareExtensions
{
    public static IApplicationBuilder UseRequestTiming(this IApplicationBuilder app) =>
        app.UseMiddleware<RequestTimingMiddleware>();
}
```

Đăng ký vào pipeline:

```csharp
app.UseRequestTiming();
```

`RequestDelegate` được inject qua constructor. Dependency scoped không được inject trực tiếp vào constructor middleware kiểu này vì instance middleware có thể được tái sử dụng trong toàn bộ vòng đời ứng dụng. Hãy inject dependency scoped vào `InvokeAsync`:

```csharp
public async Task InvokeAsync(HttpContext context, IRequestAuditWriter auditWriter)
{
    await _next(context);
    await auditWriter.WriteAsync(context.TraceIdentifier, context.Response.StatusCode);
}
```

Hoặc dùng middleware theo `IMiddleware`, khi container tạo instance theo lifetime đã đăng ký:

```csharp
public sealed class AuditMiddleware : IMiddleware
{
    private readonly IRequestAuditWriter _auditWriter;

    public AuditMiddleware(IRequestAuditWriter auditWriter) => _auditWriter = auditWriter;

    public async Task InvokeAsync(HttpContext context, RequestDelegate next)
    {
        await next(context);
        await _auditWriter.WriteAsync(context.TraceIdentifier, context.Response.StatusCode);
    }
}

builder.Services.AddScoped<AuditMiddleware>();
builder.Services.AddScoped<IRequestAuditWriter, RequestAuditWriter>();

app.UseMiddleware<AuditMiddleware>();
```

## 8. Ví dụ hoàn chỉnh: correlation ID, log và lỗi chuẩn

Mỗi request nhận một correlation ID. ID này được trả về client, đặt trong scope log và đưa vào `ProblemDetails` khi có lỗi để việc truy vết giữa log, gateway và client nhất quán.

```csharp
public sealed class GlobalExceptionHandler : IExceptionHandler
{
    private readonly ILogger<GlobalExceptionHandler> _logger;

    public GlobalExceptionHandler(ILogger<GlobalExceptionHandler> logger) => _logger = logger;

    public async ValueTask<bool> TryHandleAsync(
        HttpContext context,
        Exception exception,
        CancellationToken cancellationToken)
    {
        _logger.LogError(exception, "Unhandled exception. TraceId: {TraceId}", context.TraceIdentifier);

        var problem = new ProblemDetails
        {
            Status = StatusCodes.Status500InternalServerError,
            Title = "An unexpected error occurred",
            Instance = context.Request.Path
        };
        problem.Extensions["traceId"] = context.TraceIdentifier;

        context.Response.StatusCode = problem.Status.Value;
        await context.Response.WriteAsJsonAsync(problem, cancellationToken);
        return true;
    }
}
```

```csharp
public sealed class CorrelationIdMiddleware
{
    private const string HeaderName = "X-Correlation-ID";

    private readonly RequestDelegate _next;
    private readonly ILoggerFactory _loggerFactory;

    public CorrelationIdMiddleware(RequestDelegate next, ILoggerFactory loggerFactory)
    {
        _next = next;
        _loggerFactory = loggerFactory;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var correlationId = context.Request.Headers[HeaderName].FirstOrDefault();

        if (string.IsNullOrWhiteSpace(correlationId) || correlationId.Length > 128)
            correlationId = Guid.NewGuid().ToString("N");

        context.TraceIdentifier = correlationId;
        context.Response.Headers[HeaderName] = correlationId;

        var logger = _loggerFactory.CreateLogger("Request");
        using (logger.BeginScope(new Dictionary<string, object> { ["CorrelationId"] = correlationId }))
        {
            await _next(context);
        }
    }
}
```

```csharp
var builder = WebApplication.CreateBuilder(args);
builder.Services.AddControllers();
builder.Services.AddProblemDetails();
builder.Services.AddExceptionHandler<GlobalExceptionHandler>();

var app = builder.Build();

app.UseExceptionHandler();
app.UseMiddleware<CorrelationIdMiddleware>();

app.MapControllers();

app.Run();
```

```csharp
[ApiController]
[Route("api/[controller]")]
public sealed class OrdersController : ControllerBase
{
    [HttpGet("{id:int}")]
    public IActionResult Get(int id)
    {
        if (id == 0) throw new InvalidOperationException("Demo failure");
        return Ok(new { id, status = "created" });
    }
}
```

`IExceptionHandler` (từ .NET 8) tách xử lý exception ra một class riêng thay vì nhánh lambda; `builder.Services.AddExceptionHandler<GlobalExceptionHandler>()` đăng ký nó và `app.UseExceptionHandler()` (không tham số) kích hoạt middleware đọc danh sách handler đã đăng ký.

Lưu ý: không đưa stack trace, connection string, token hoặc dữ liệu cá nhân vào response. Log nội bộ có thể giữ exception đầy đủ theo chính sách bảo mật; response chỉ trả thông tin an toàn và `traceId` để hỗ trợ tra cứu.

## 9. Short-circuit đúng cách: chế độ bảo trì

Middleware có thể dừng request có chủ đích. Ví dụ dưới đây chỉ cho phép health check đi qua trong thời gian bảo trì.

```csharp
public sealed class MaintenanceModeMiddleware
{
    private readonly RequestDelegate _next;
    private readonly IOptionsMonitor<MaintenanceOptions> _options;

    public MaintenanceModeMiddleware(
        RequestDelegate next,
        IOptionsMonitor<MaintenanceOptions> options)
    {
        _next = next;
        _options = options;
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var options = _options.CurrentValue;
        var isHealthCheck = context.Request.Path.StartsWithSegments("/health");

        if (options.Enabled && !isHealthCheck)
        {
            context.Response.StatusCode = StatusCodes.Status503ServiceUnavailable;
            context.Response.Headers.RetryAfter = options.RetryAfterSeconds.ToString();
            await context.Response.WriteAsJsonAsync(new
            {
                title = "Service is under maintenance",
                retryAfterSeconds = options.RetryAfterSeconds
            });
            return;
        }

        await _next(context);
    }
}

public sealed class MaintenanceOptions
{
    public bool Enabled { get; init; }
    public int RetryAfterSeconds { get; init; } = 60;
}
```

```csharp
builder.Services.AddOptions<MaintenanceOptions>()
    .BindConfiguration("Maintenance")
    .Validate(x => x.RetryAfterSeconds > 0, "RetryAfterSeconds must be positive");

app.UseMiddleware<MaintenanceModeMiddleware>();
app.MapHealthChecks("/health");
```

`appsettings.json`:

```json
{
  "Maintenance": {
    "Enabled": false,
    "RetryAfterSeconds": 60
  }
}
```

Đừng short-circuit mơ hồ. Middleware phải trả status code, content type và body nhất quán để frontend/client có thể xử lý rõ ràng.

## 10. Làm việc an toàn với response

Sau khi response bắt đầu gửi, header và status code không còn thay đổi được. Kiểm tra `HasStarted` trước khi cố ghi lỗi thay thế:

```csharp
try
{
    await _next(context);
}
catch (Exception ex) when (!context.Response.HasStarted)
{
    context.Response.Clear();
    context.Response.StatusCode = StatusCodes.Status500InternalServerError;
    await context.Response.WriteAsJsonAsync(new { error = "Unexpected error" });
}
```

Nếu response đã bắt đầu, không thể trả một JSON 500 sạch mà không làm hỏng payload đang stream. Hãy log exception và để server đóng/hoàn tất response theo cơ chế phù hợp. Đây là lý do exception handler cần ở sớm và endpoint streaming phải được thiết kế, quan sát riêng.

`Response.OnStarting` phù hợp khi cần thêm header ngay trước lúc header được gửi:

```csharp
context.Response.OnStarting(() =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    return Task.CompletedTask;
});
```

Không đọc hoặc thay thế `Response.Body` chỉ để log body nếu chưa đo được nhu cầu. Cách này tăng allocation, phá streaming và có nguy cơ ghi log dữ liệu nhạy cảm.

## 11. Request body: đọc một lần và buffering có chủ đích

Request body là stream. Nếu middleware đọc hết body, model binder hoặc endpoint phía sau có thể không còn gì để đọc.

```csharp
public sealed class RequestBodyBufferingMiddleware
{
    private readonly RequestDelegate _next;

    public RequestBodyBufferingMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        if (context.Request.ContentLength is > 0 &&
            context.Request.ContentType?.Contains("application/json") == true)
        {
            context.Request.EnableBuffering(bufferThreshold: 30 * 1024, bufferLimit: 100 * 1024);

            using var reader = new StreamReader(
                context.Request.Body,
                leaveOpen: true);
            var body = await reader.ReadToEndAsync(context.RequestAborted);
            context.Request.Body.Position = 0;

            // Chỉ log metadata hoặc body đã được redaction; không log token/password.
        }

        await _next(context);
    }
}
```

```csharp
app.UseMiddleware<RequestBodyBufferingMiddleware>();
```

Chỉ bật buffering cho path/content type cần thiết, giới hạn kích thước và luôn reset `Position`. Với upload hoặc payload lớn, ưu tiên log metadata như content length, hash, file name đã được kiểm soát thay vì copy toàn bộ dữ liệu vào memory/disk.

## 12. Cancellation và outbound call

`HttpContext.RequestAborted` được kích hoạt khi client ngắt kết nối hoặc request bị abort. Trong controller action, model binder tự bind tham số kiểu `CancellationToken` vào `HttpContext.RequestAborted`; truyền token này xuống I/O để giải phóng tài nguyên sớm:

```csharp
[ApiController]
[Route("api/[controller]")]
public sealed class CatalogController : ControllerBase
{
    private readonly IHttpClientFactory _httpClientFactory;

    public CatalogController(IHttpClientFactory httpClientFactory) =>
        _httpClientFactory = httpClientFactory;

    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var client = _httpClientFactory.CreateClient("catalog");
        using var response = await client.GetAsync("/products", cancellationToken);

        response.EnsureSuccessStatusCode();
        var payload = await response.Content.ReadAsStringAsync(cancellationToken);
        return Content(payload, "application/json");
    }
}
```

Không truyền token cancellation này vào công việc cần hoàn tất độc lập sau khi client rời đi, chẳng hạn message outbox đã commit. Khi đó cần workflow nền, retry và cancellation policy riêng.

## 13. Endpoint metadata: bỏ qua middleware theo endpoint

Middleware có thể đọc endpoint đã được routing chọn để dùng metadata. Ví dụ tạo attribute đánh dấu action không cần audit:

```csharp
[AttributeUsage(AttributeTargets.Method | AttributeTargets.Class)]
public sealed class SkipAuditAttribute : Attribute;

[ApiController]
[Route("api/[controller]")]
public sealed class PingController : ControllerBase
{
    [HttpGet]
    [SkipAudit]
    public IActionResult Get() => Ok("pong");
}
```

```csharp
public sealed class EndpointAuditMiddleware
{
    private readonly RequestDelegate _next;

    public EndpointAuditMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(HttpContext context)
    {
        var endpoint = context.GetEndpoint();
        var skipAudit = endpoint?.Metadata.GetMetadata<SkipAuditAttribute>() is not null;

        if (!skipAudit)
        {
            // Ghi audit metadata; không ghi secret hoặc request body thô.
        }

        await _next(context);
    }
}
```

```csharp
app.UseRouting();
app.UseMiddleware<EndpointAuditMiddleware>();
app.MapControllers();
```

Middleware này phải đứng sau routing; trước routing, `context.GetEndpoint()` chưa có kết quả. Metadata giúp tránh `if (path == ...)` rải rác và làm ý định của endpoint rõ ràng.

## 14. Kiểm thử middleware

Kiểm thử đơn vị có thể tạo `DefaultHttpContext` và fake `RequestDelegate`.

```csharp
[Fact]
public async Task Adds_request_id_when_client_did_not_send_one()
{
    var context = new DefaultHttpContext();
    var nextCalled = false;
    RequestDelegate next = _ =>
    {
        nextCalled = true;
        return Task.CompletedTask;
    };

    var middleware = new RequestIdMiddleware(next);

    await middleware.InvokeAsync(context);

    Assert.True(nextCalled);
    Assert.True(context.Response.Headers.ContainsKey("X-Request-ID"));
}
```

Kiểm thử integration nên dùng `WebApplicationFactory<Program>` để xác nhận thứ tự pipeline, status code, header và response thực tế:

```csharp
[Fact]
public async Task Maintenance_mode_returns_503_for_api()
{
    await using var app = new WebApplicationFactory<Program>()
        .WithWebHostBuilder(builder => builder.UseSetting("Maintenance:Enabled", "true"));
    var client = app.CreateClient();

    var response = await client.GetAsync("/api/orders/10");

    Assert.Equal(HttpStatusCode.ServiceUnavailable, response.StatusCode);
    Assert.True(response.Headers.Contains("Retry-After"));
}
```

## 15. Tư duy thiết kế middleware từ yêu cầu thực tế

Biết cú pháp `UseMiddleware<T>()` chưa đủ để thiết kế pipeline. Điểm khó là xác định một yêu cầu có thật sự thuộc HTTP pipeline hay không, middleware cần đứng ở đâu và state nào phải tồn tại trước khi nó chạy.

Phần này dùng một luồng xuyên suốt: khách hàng gọi `POST /api/don-hang` trên hệ thống đặt đồ ăn multi-tenant. Host có thể là `live.food.com.vn` hoặc subdomain riêng như `banhmycay.food.com.vn`. Token xác định người dùng; host và quyền truy cập xác định tenant; body chứa `shopId` và các món cần đặt.

### 15.1. Pipeline là Chain of Responsibility có chiều quay về

Mỗi middleware giữ một `RequestDelegate` trỏ tới bước kế tiếp. Nó có ba lựa chọn:

1. Xử lý rồi gọi `next`.
2. Không gọi `next` và tự tạo response, gọi là **short-circuit**.
3. Bao quanh `next` bằng code chạy trước và sau.

Đây là hình thức thực tế của **Chain of Responsibility**: request lần lượt đi qua các handler cho đến khi một handler dừng chuỗi hoặc endpoint xử lý nó. Vì `await next(context)` trả quyền điều khiển về middleware trước đó, pipeline đồng thời có hành vi giống các **Decorator** lồng nhau.

```text
Request
  -> ExceptionHandling before
    -> CorrelationId before
      -> TenantResolution before
        -> Authentication
          -> Authorization
            -> Endpoint
          <- Authorization
        <- TenantResolution after
      <- CorrelationId after
  <- ExceptionHandling catch/after
Response
```

Tên pattern giúp mô tả cấu trúc, nhưng không quyết định thiết kế. Quyết định phải bắt đầu từ dữ liệu đầu vào, phạm vi tác động và failure mode.

### 15.2. Decision tree chọn đúng extension point

Đặt lần lượt các câu hỏi sau:

```text
Concern có áp dụng cho hầu hết HTTP request hoặc một nhánh route?
  Có -> Middleware
  Không
    Concern cần endpoint metadata, model binding hoặc action result?
      Có -> MVC filter / endpoint filter
      Không
        Concern là quyền trên một resource cụ thể?
          Có -> Authorization policy/handler hoặc application service
          Không
            Concern bảo vệ invariant nghiệp vụ?
              Có -> Aggregate / domain service
              Không -> Application service hoặc decorator quanh use case
```

Áp dụng vào hệ thống đặt hàng:

| Yêu cầu | Vị trí | Lý do |
| --- | --- | --- |
| Gắn `correlationId` cho mọi request | Middleware | Chính sách HTTP toàn cục, không cần model nghiệp vụ. |
| Phân giải tenant từ host | Middleware | Nhiều bước phía sau cần cùng một `tenantId`. |
| Endpoint chỉ dành cho shop owner | Authorization policy | Cần identity và metadata quyền của endpoint. |
| Kiểm tra `shopId` thuộc tenant hiện tại | Application service và query predicate | Đây là resource authorization gắn với dữ liệu, chỉ đọc host là chưa đủ. |
| Không cho đặt món đã ngừng bán | Aggregate/application service | Đây là invariant nghiệp vụ và phải đúng cả khi gọi từ HTTP lẫn background job. |
| Đo thời gian mọi handler của một use case | Application decorator | Concern bao quanh application handler, không phụ thuộc HTTP. |

Middleware không phải lựa chọn mặc định cho mọi cross-cutting concern. Nếu cùng một rule phải chạy từ consumer hoặc scheduled job, đặt nó trong middleware sẽ tạo một đường đi bỏ qua rule.

### 15.3. Suy ra thứ tự từ dependency

Không học thuộc một danh sách cố định. Với mỗi middleware, ghi rõ **đầu vào nó cần** và **state nó tạo ra**. Sau đó sắp xếp theo dependency.

| Middleware | State cần trước khi chạy | State tạo ra |
| --- | --- | --- |
| `ExceptionHandling` | Không có | Error response thống nhất cho lỗi phía sau. |
| `CorrelationId` | Header request | `TraceIdentifier`, response header, log scope. |
| `ForwardedHeaders` | Cấu hình trusted proxy | Scheme, host và client IP đã chuẩn hóa. |
| `TenantResolution` | Host thật sau proxy | `TenantContext`. |
| `Routing` | Path | Endpoint và metadata. |
| `Authentication` | Credential, có thể cần tenant | `HttpContext.User`. |
| `Authorization` | User và endpoint metadata | Quyết định cho phép hoặc 401/403. |

Từ bảng này có thể suy ra:

- `ForwardedHeaders` phải đứng trước code đọc host nếu ứng dụng chạy sau reverse proxy.
- `TenantResolution` phải đứng trước service/query cần `tenantId`.
- `Authentication` phải đứng trước `Authorization` vì authorization đọc `HttpContext.User`.
- Middleware đọc `GetEndpoint()` phải đứng sau routing.
- `ExceptionHandling` phải đứng ngoài các middleware có thể throw nếu muốn chuẩn hóa lỗi của chúng.

```csharp
app.UseExceptionHandler();
app.UseMiddleware<CorrelationIdMiddleware>();
app.UseForwardedHeaders();
app.UseMiddleware<TenantResolutionMiddleware>();

app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();
```

Thứ tự giữa `CorrelationId` và exception handler là một trade-off. Đặt correlation trước exception handler giúp handler đọc ID nhưng correlation middleware không được handler bao lỗi. Đặt exception handler trước correlation bao được lỗi của correlation middleware, nhưng handler phải dùng `TraceIdentifier` mặc định nếu lỗi xảy ra trước khi ID được gắn. Với middleware correlation nhỏ và có validation đơn giản, cả hai hợp lệ; cần chọn rõ failure nào quan trọng hơn.

### 15.4. Bước 1: định nghĩa invariant ở HTTP boundary

Trước khi viết code, ghi các điều kiện phải luôn đúng:

```text
1. Mỗi request có một correlationId hợp lệ để truy vết.
2. Request vào API tenant phải phân giải được đúng một tenant đang hoạt động.
3. Client không được tự quyết định tenantId bằng body hoặc query string.
4. Mọi query dữ liệu tenant phải có tenant predicate ở data/application boundary.
5. Lỗi trước khi response started phải có error contract thống nhất.
```

Điều 3 giải thích vì sao không nhận `tenantId` từ payload làm nguồn tin cậy. Điều 4 giải thích giới hạn của middleware: `TenantContext` chỉ cung cấp context; nó không tự động làm Dapper query an toàn.

### 15.5. Bước 2: tạo request-scoped Tenant Context

`TenantContext` là state của request hiện tại nên dùng scoped lifetime. Chưa cần interface nếu chỉ có một implementation và không có boundary cần thay thế.

```csharp
public sealed class TenantContext
{
    public Guid? TenantId { get; private set; }

    public Guid RequireTenantId() => TenantId
        ?? throw new InvalidOperationException("Tenant has not been resolved.");

    public void Set(Guid tenantId)
    {
        if (TenantId is not null)
            throw new InvalidOperationException("Tenant was already resolved.");

        TenantId = tenantId;
    }
}

builder.Services.AddScoped<TenantContext>();
```

`Set` chỉ cho ghi một lần để middleware phía sau không thể âm thầm đổi tenant giữa request. `RequireTenantId` fail fast thay vì trả `Guid.Empty`, vì `Guid.Empty` có thể biến lỗi cấu hình thành query sai dữ liệu.

### 15.6. Bước 3: phân giải tenant bằng middleware

Repository dưới đây đại diện cho hạ tầng đọc mapping `host -> tenant`. Code cache hoặc database cụ thể được bỏ qua vì không thay đổi invariant.

```csharp
public sealed class TenantResolutionMiddleware
{
    private readonly RequestDelegate _next;

    public TenantResolutionMiddleware(RequestDelegate next) => _next = next;

    public async Task InvokeAsync(
        HttpContext context,
        TenantContext tenantContext,
        ITenantHostLookup tenantLookup)
    {
        var host = context.Request.Host.Host.Trim().ToLowerInvariant();
        var tenantId = await tenantLookup.FindActiveTenantIdAsync(
            host,
            context.RequestAborted);

        if (tenantId is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            await context.Response.WriteAsJsonAsync(
                new ProblemDetails
                {
                    Status = StatusCodes.Status404NotFound,
                    Title = "Tenant was not found"
                },
                context.RequestAborted);
            return;
        }

        tenantContext.Set(tenantId.Value);
        await _next(context);
    }
}
```

`TenantContext` và `ITenantHostLookup` được inject vào `InvokeAsync`, không giữ trong constructor của conventional middleware. Lý do là middleware instance có vòng đời dài, còn hai dependency thuộc request scope.

Với host chung như `live.food.com.vn`, host không đủ để chọn một tenant cụ thể. Luồng đăng nhập chung cần một quy tắc riêng: tenant có thể đến từ claim đã được server ký hoặc người dùng chọn sau đăng nhập. Khi đó không nên nhét hai chiến lược mơ hồ vào một middleware lớn; endpoint chung có thể được đánh dấu metadata để bỏ qua host resolution, sau đó authentication/application flow chọn tenant theo contract rõ ràng.

### 15.7. Bước 4: sử dụng context nhưng vẫn bảo vệ query

EF Core có thể áp dụng global query filter. Dapper không biết `TenantContext` nếu câu SQL không dùng nó.

```csharp
public async Task<ShopDto?> GetShopAsync(Guid shopId, CancellationToken ct)
{
    var tenantId = _tenantContext.RequireTenantId();

    const string sql = """
        SELECT id, tenShop
        FROM Shop
        WHERE id = @shopId
          AND tenantId = @tenantId
          AND deletedAt IS NULL
        """;

    return await _connection.QuerySingleOrDefaultAsync<ShopDto>(
        new CommandDefinition(sql, new { shopId, tenantId }, cancellationToken: ct));
}
```

Failure case:

```text
Request A thuộc tenant X gọi GET /shops/42
Shop 42 thực tế thuộc tenant Y
SQL chỉ có WHERE id = @shopId
Middleware đã phân giải đúng X nhưng query vẫn trả dữ liệu của Y
```

Vì vậy tenant middleware giải quyết **context propagation**, không giải quyết toàn bộ **data isolation**. Database predicate, unique constraint đúng scope và authorization theo resource vẫn phải được thiết kế riêng.

### 15.8. Bước 5: giữ business rule ngoài middleware

Ví dụ sai:

```csharp
if (context.Request.Path.StartsWithSegments("/api/don-hang") && shop.DangDongCua)
{
    context.Response.StatusCode = StatusCodes.Status409Conflict;
    return;
}
```

Rule “shop đóng cửa thì không nhận đơn” phụ thuộc shop, khung giờ, loại đơn và có thể được gọi từ HTTP, scheduled order hoặc consumer. Đặt rule trong middleware làm nó phụ thuộc path và bị bỏ qua ở các entry point khác.

```csharp
public sealed class DonHangService
{
    public async Task<Guid> TaoAsync(TaoDonHangCommand command, CancellationToken ct)
    {
        var tenantId = _tenantContext.RequireTenantId();
        var shop = await _shopRepository.GetRequiredAsync(tenantId, command.ShopId, ct);

        shop.DamBaoDangNhanDon(_clock.UtcNow);

        var donHang = DonHang.Tao(tenantId, shop.Id, command.MonAn);
        await _donHangRepository.AddAsync(donHang, ct);
        return donHang.Id;
    }
}
```

Middleware xác định request thuộc tenant nào. Application service điều phối use case. Aggregate bảo vệ invariant nhận đơn. Mỗi layer giữ một loại quyết định, nên worker sau này có thể gọi cùng application/domain logic mà không cần giả lập `HttpContext`.

### 15.9. Pattern catalogue theo dấu hiệu

| Dấu hiệu trong yêu cầu | Pattern/cơ chế nên xem xét | Câu hỏi xác nhận |
| --- | --- | --- |
| “Mọi request đều phải...” | Middleware / Chain of Responsibility | Có entry point ngoài HTTP cần cùng rule không? |
| “Làm trước và sau bước kế tiếp” | Decorator-like middleware | Response có thể đã started không? |
| “Nếu điều kiện sai thì trả ngay” | Short-circuit | Status, body, header và log có thống nhất không? |
| “Chỉ route `/internal`” | `Map` | Có cần quay lại pipeline chính không? |
| “Chỉ endpoint có metadata X” | Middleware sau routing hoặc filter | Metadata đã tồn tại tại vị trí này chưa? |
| “Dependency scoped cho mỗi request” | Inject vào `InvokeAsync` hoặc `IMiddleware` | Có vô tình giữ scoped service trong singleton không? |
| “Bao quanh mọi command handler” | Application decorator | Concern có thật sự phụ thuộc HTTP không? |
| “Đơn hàng phải luôn...” | Aggregate/domain service | Rule có cần đúng ở worker và message consumer không? |

Pattern là kết quả của constraint, không phải mục tiêu. Không tạo base middleware, generic pipeline builder hoặc custom framework khi hai class độc lập đã rõ hơn.

### 15.10. Failure walkthrough: hai request đặt món đồng thời

Hai khách cùng đặt phần hàng hóa cuối cùng:

```text
Request A -> TenantResolution -> DonHangService -> đọc soLuong = 1
Request B -> TenantResolution -> DonHangService -> đọc soLuong = 1
A tạo đơn và trừ kho
B tạo đơn và trừ kho
Kết quả: oversell
```

Thêm middleware lock theo URL không phải lời giải tốt:

- Lock chỉ có hiệu lực trong một process nếu dùng memory.
- Nhiều instance ứng dụng vẫn chạy đồng thời.
- URL không phải aggregate boundary.
- Lock toàn route làm giảm throughput của các shop không liên quan.

Correctness phải được bảo vệ tại nơi ghi dữ liệu, ví dụ atomic update:

```sql
UPDATE TonKho
SET soLuong = soLuong - @soLuongDat
WHERE tenantId = @tenantId
  AND shopId = @shopId
  AND hangHoaId = @hangHoaId
  AND soLuong >= @soLuongDat;
```

Nếu affected rows bằng `0`, use case trả conflict hoặc hết hàng. Middleware vẫn có nhiệm vụ tạo context và error contract; database constraint/transaction giải quyết concurrency. Đây là ví dụ quan trọng để không chọn pattern theo từ khóa “nhiều request cùng lúc”.

### 15.11. Quy trình tự viết middleware

Khi gặp một yêu cầu mới, thực hiện theo thứ tự:

1. Viết một câu mô tả concern và phạm vi: mọi HTTP request, một nhánh hay một use case.
2. Liệt kê input đáng tin, output/state tạo ra và failure response.
3. Kiểm tra entry point ngoài HTTP; nếu rule vẫn phải đúng ở đó, không đặt ownership trong middleware.
4. Viết invariant trước code.
5. Xác định middleware cần state nào từ bước trước và middleware sau cần state nào từ nó.
6. Chọn continue, short-circuit hay wrap `next`.
7. Chọn conventional middleware hay `IMiddleware` theo DI lifetime, không theo sở thích.
8. Viết happy path ngắn nhất trước, rồi thêm đúng các guard ở trust boundary.
9. Kiểm tra `Response.HasStarted`, cancellation, request body size và dữ liệu nhạy cảm nếu concern chạm tới chúng.
10. Viết một integration test xác nhận thứ tự hoặc short-circuit; unit test riêng chỉ khi logic nhánh đủ phức tạp.

Một bản thiết kế ngắn có thể dùng mẫu sau:

```text
Concern: phân giải tenant cho API tenant-scoped.
Scope: HTTP request, trừ endpoint public/shared-host có metadata cho phép bỏ qua.
Trusted input: normalized host sau trusted proxy; signed claim khi dùng shared host.
Produces: request-scoped TenantContext.
Invariant: tenant được set tối đa một lần; query tenant-scoped luôn dùng tenantId.
Ordering: after ForwardedHeaders, before consumers of TenantContext.
Failure: unknown/inactive tenant -> 404; malformed trusted input -> 400/401 tùy nguồn.
Not owned here: shop ownership, menu visibility, stock concurrency.
Verification: integration test known host, unknown host, bypass endpoint và cross-tenant query.
```

## 16. Checklist thiết kế và review

1. Concern này có áp dụng ở HTTP boundary hay là business rule cần nằm trong application/domain layer?
2. Middleware có cần `next()` không? Nếu không, status/header/body khi short-circuit có nhất quán không?
3. Thứ tự có đúng với routing, CORS, authentication, authorization và exception handling không?
4. Có dependency scoped bị giữ trong constructor của middleware thường không?
5. Có xử lý `RequestAborted`/`CancellationToken` cho I/O dài không?
6. Có thay đổi response sau khi `HasStarted` không?
7. Có đọc body lớn, stream hoặc dữ liệu nhạy cảm không? Buffer limit và redaction ở đâu?
8. Log/metric có cardinality hợp lý, không đưa token, email, số điện thoại hoặc request body vào label không?
9. Có integration test cho nhánh thành công, short-circuit và lỗi không?

## Kết luận

Middleware là nơi đặt các chính sách HTTP dùng chung, không phải nơi chứa nghiệp vụ. Pipeline tốt có thứ tự có chủ đích, short-circuit rõ ràng, tôn trọng lifetime DI, cancellation và trạng thái response. Khi các ranh giới này rõ, API dễ quan sát, dễ kiểm thử và ít lỗi khó truy vết hơn.
