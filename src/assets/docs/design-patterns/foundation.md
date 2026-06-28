# Design Patterns trong .NET Core - Nền tảng tư duy thiết kế

Design Pattern không phải là bộ công thức để "nhét vào code cho sang". Pattern là cách đặt tên cho những lời giải đã được kiểm chứng khi code bắt đầu gặp các vấn đề lặp lại: logic bị copy nhiều nơi, class phụ thuộc chặt vào nhau, thay đổi một yêu cầu nhỏ làm vỡ nhiều module, test khó, deploy khó, hoặc business logic bị trộn với infrastructure.

Với định hướng middle/senior, mục tiêu không phải là nhớ thật nhiều tên pattern. Mục tiêu là nhìn được **lực kéo thiết kế** trong một bài toán: chỗ nào đang thay đổi thường xuyên, chỗ nào cần ổn định, chỗ nào nên trừu tượng hóa, chỗ nào nên giữ đơn giản.

---

## 1. Pattern giải quyết vấn đề gì?

Một pattern tốt thường giải quyết một hoặc nhiều vấn đề sau:

- **Giảm coupling**: module này không cần biết quá nhiều chi tiết của module khác.
- **Tăng cohesion**: một class/module tập trung vào một trách nhiệm rõ ràng.
- **Cô lập thay đổi**: khi business thay đổi, chỉ một vùng code nhỏ cần sửa.
- **Tăng khả năng test**: business logic có thể test mà không cần database, HTTP, file system hoặc service thật.
- **Tái sử dụng đúng chỗ**: reuse hành vi ổn định, không ép reuse các use case khác bản chất.
- **Làm code có ngôn ngữ chung**: khi nói "Strategy", "Repository", "Decorator", team hiểu cùng một kiểu cấu trúc.

Ví dụ trong .NET Core:

```csharp
public class OrderService
{
    private readonly SqlConnection _connection;
    private readonly EmailClient _emailClient;

    public OrderService()
    {
        _connection = new SqlConnection("...");
        _emailClient = new EmailClient("...");
    }
}
```

Code trên chạy được, nhưng thiết kế có vấn đề:

- `OrderService` tự tạo dependency, rất khó test.
- Business logic bị dính với SQL và email infrastructure.
- Muốn đổi email provider hoặc database connection phải sửa trực tiếp service.

Một hướng thiết kế tốt hơn là đảo ngược dependency:

```csharp
public interface IOrderRepository
{
    Task<Order?> GetAsync(Guid id, CancellationToken cancellationToken);
    Task SaveAsync(Order order, CancellationToken cancellationToken);
}

public interface IEmailSender
{
    Task SendAsync(EmailMessage message, CancellationToken cancellationToken);
}

public class OrderService
{
    private readonly IOrderRepository _orders;
    private readonly IEmailSender _emailSender;

    public OrderService(IOrderRepository orders, IEmailSender emailSender)
    {
        _orders = orders;
        _emailSender = emailSender;
    }
}
```

Đây chưa cần gọi tên là pattern gì vội. Nhưng tư duy phía sau đã là nền tảng của nhiều pattern: Dependency Injection, Repository, Adapter, Strategy, Clean Architecture.

---

## 2. Nguyên tắc trước, pattern sau

Pattern là biểu hiện cụ thể. Nguyên tắc thiết kế mới là gốc.

Nếu chưa hiểu nguyên tắc, rất dễ dùng pattern sai: thấy database là tạo Repository, thấy nhiều `if` là tạo Strategy, thấy nhiều service là tạo Mediator, thấy hệ thống lớn là nhảy vào CQRS. Senior không chọn pattern vì tên nghe chuyên nghiệp, mà vì nó giải quyết đúng áp lực hiện tại của hệ thống.

---

## 3. SOLID trong thực tế .NET Core

### 3.1 Single Responsibility Principle

Một class nên có một lý do chính để thay đổi.

Sai lầm phổ biến là hiểu SRP thành "mỗi class chỉ có một method". Không phải. SRP nói về **lý do thay đổi**, không nói về số dòng code.

Ví dụ service vừa xử lý nghiệp vụ, vừa format PDF, vừa gửi email, vừa ghi audit log:

```csharp
public class InvoiceService
{
    public Task ApproveInvoiceAsync(Guid invoiceId)
    {
        // Validate invoice
        // Update status
        // Generate PDF
        // Send email
        // Write audit log
    }
}
```

Ở mức nhỏ có thể chấp nhận. Nhưng khi logic phình ra, nên tách trách nhiệm:

- `InvoiceService`: điều phối use case nghiệp vụ.
- `IInvoiceRepository`: đọc/ghi invoice.
- `IPdfRenderer`: tạo file PDF.
- `IEmailSender`: gửi email.
- `IAuditLogger`: ghi log nghiệp vụ.

Tách không phải để "đẹp", mà để khi format PDF đổi, không làm rủi ro logic approve invoice.

### 3.2 Open/Closed Principle

Code nên mở cho mở rộng, đóng với sửa đổi.

Ví dụ tính phí vận chuyển theo nhiều phương thức:

```csharp
public decimal CalculateShipping(Order order, string method)
{
    if (method == "standard") return 30000;
    if (method == "express") return 60000;
    if (method == "same-day") return 120000;

    throw new NotSupportedException();
}
```

Khi business thêm phương thức mới, method này bị sửa liên tục. Nếu rule phức tạp và thay đổi thường xuyên, có thể dùng Strategy:

```csharp
public interface IShippingFeeCalculator
{
    string Method { get; }
    decimal Calculate(Order order);
}

public class ExpressShippingFeeCalculator : IShippingFeeCalculator
{
    public string Method => "express";

    public decimal Calculate(Order order)
    {
        return order.TotalAmount > 1_000_000 ? 0 : 60000;
    }
}
```

Use case chính chỉ chọn strategy phù hợp:

```csharp
public class ShippingService
{
    private readonly IReadOnlyDictionary<string, IShippingFeeCalculator> _calculators;

    public ShippingService(IEnumerable<IShippingFeeCalculator> calculators)
    {
        _calculators = calculators.ToDictionary(x => x.Method);
    }

    public decimal Calculate(Order order, string method)
    {
        if (!_calculators.TryGetValue(method, out var calculator))
        {
            throw new NotSupportedException($"Shipping method '{method}' is not supported.");
        }

        return calculator.Calculate(order);
    }
}
```

Nhưng lưu ý: nếu chỉ có 2 case đơn giản và ít thay đổi, `if` rõ ràng vẫn tốt hơn tạo 5 class.

### 3.3 Liskov Substitution Principle

Class con phải thay thế được class cha mà không làm hỏng kỳ vọng của caller.

Ví dụ sai:

```csharp
public abstract class ReportExporter
{
    public abstract byte[] Export(ReportData data);
}

public class EmailReportExporter : ReportExporter
{
    public override byte[] Export(ReportData data)
    {
        throw new NotSupportedException("Email exporter does not return bytes.");
    }
}
```

Nếu class con phải throw vì không làm được contract của class cha, abstraction đang sai. Nên tách interface theo hành vi thật:

```csharp
public interface IFileReportExporter
{
    byte[] Export(ReportData data);
}

public interface IReportSender
{
    Task SendAsync(ReportData data, CancellationToken cancellationToken);
}
```

### 3.4 Interface Segregation Principle

Không bắt client phụ thuộc vào những method nó không dùng.

Ví dụ interface quá to:

```csharp
public interface IUserService
{
    Task<User> GetAsync(Guid id);
    Task CreateAsync(User user);
    Task DeleteAsync(Guid id);
    Task ResetPasswordAsync(Guid id);
    Task ExportUsersAsync();
    Task ImportUsersAsync(Stream file);
}
```

Các consumer chỉ cần đọc user nhưng vẫn bị kéo theo toàn bộ contract. Có thể tách:

- `IUserReader`
- `IUserWriter`
- `IUserPasswordService`
- `IUserImportExportService`

Không cần tách cực đoan ngay từ đầu. Tách khi interface bắt đầu phục vụ nhiều nhóm client khác nhau.

### 3.5 Dependency Inversion Principle

Module cấp cao không nên phụ thuộc trực tiếp vào module cấp thấp. Cả hai nên phụ thuộc vào abstraction.

Trong .NET Core, nguyên tắc này đi cùng DI container:

```csharp
services.AddScoped<IOrderRepository, EfCoreOrderRepository>();
services.AddScoped<IEmailSender, SendGridEmailSender>();
services.AddScoped<OrderService>();
```

`OrderService` không biết repository dùng EF Core, Dapper, HTTP API hay fake in-memory trong test. Nó chỉ biết contract nghiệp vụ cần dùng.

---

## 4. DRY, KISS, YAGNI - ba nguyên tắc dễ hiểu sai

### 4.1 DRY không phải là gom mọi đoạn code giống nhau

DRY là "Don't Repeat Yourself", nhưng cái cần tránh lặp là **knowledge**, không phải mọi đoạn text giống nhau.

Hai đoạn code giống nhau về hình dạng nhưng khác lý do thay đổi thì không nên gom.

Ví dụ:

- Validate `Customer.PhoneNumber`
- Validate `Supplier.PhoneNumber`

Ban đầu cả hai cùng là 10 số. Nhưng nếu sau này supplier cho phép số quốc tế, còn customer chỉ cho số nội địa, việc gom chung từ sớm sẽ tạo coupling sai.

Quy tắc middle/senior:

```text
Trùng code + cùng lý do thay đổi       -> cân nhắc abstraction
Trùng code + khác lý do thay đổi       -> chấp nhận duplicate tạm thời
Chưa rõ lý do thay đổi có giống không  -> đợi thêm tín hiệu
```

### 4.2 KISS không có nghĩa là code sơ sài

KISS là giữ thiết kế đơn giản nhất có thể, nhưng vẫn đủ đúng cho bài toán.

Code đơn giản tốt:

- Dễ đọc.
- Ít tầng gián tiếp.
- Ít magic.
- Dependency rõ.
- Test được.

Code "đơn giản giả":

- Dồn hết vào một service 1000 dòng.
- Không tách transaction boundary.
- Không có validation rõ.
- Hard-code provider, connection string, file path.
- Khó test vì mọi thứ trộn vào nhau.

### 4.3 YAGNI không có nghĩa là không thiết kế

YAGNI là "You Aren't Gonna Need It": đừng xây tính năng/abstraction khi chưa có nhu cầu thật.

Nhưng YAGNI không cấm mình thiết kế điểm mở rộng hợp lý. Nó nhắc mình không nên đoán quá xa.

Ví dụ:

- Chưa cần microservices chỉ vì "sau này scale".
- Chưa cần CQRS nếu CRUD hiện tại rõ ràng và không có áp lực read/write khác nhau.
- Chưa cần generic repository nếu EF Core `DbContext` đã đủ express query rõ.
- Chưa cần event sourcing nếu nghiệp vụ không cần replay toàn bộ lịch sử state.

---

## 5. Coupling và Cohesion

### 5.1 Coupling

Coupling là mức độ một phần code biết/phụ thuộc vào phần khác.

Coupling cao thường có dấu hiệu:

- Service A new trực tiếp Service B.
- Business logic gọi trực tiếp `HttpClient`, `SqlConnection`, file system.
- Một thay đổi nhỏ ở module B làm nhiều module khác phải sửa.
- Test một method phải dựng cả database, cache, queue, email.

Giảm coupling bằng:

- Interface ở đúng boundary.
- Dependency Injection.
- Adapter cho external service.
- Event hoặc message khi không cần gọi đồng bộ.
- Tách business logic khỏi infrastructure.

### 5.2 Cohesion

Cohesion là mức độ các phần trong một module thật sự thuộc về nhau.

Cohesion thấp thường có dấu hiệu:

- Class tên rất chung: `CommonService`, `HelperService`, `Manager`, `Utils`.
- Một service chứa nhiều use case không liên quan.
- Method trong class dùng các nhóm field khác nhau hoàn toàn.
- Team không biết ai sở hữu logic đó.

Tăng cohesion bằng:

- Đặt tên theo nghiệp vụ/use case.
- Tách module theo boundary nghiệp vụ.
- Tách service theo trách nhiệm thay đổi.
- Đưa logic domain về gần entity/value object/domain service nếu phù hợp.

---

## 6. Composition over Inheritance

Ưu tiên composition hơn inheritance là một nguyên tắc quan trọng khi thiết kế hệ thống lớn.

Inheritance hợp lý khi quan hệ thật sự là "is-a" và contract của class cha ổn định.

Composition hợp lý khi ta muốn lắp ghép hành vi:

```csharp
public class OrderProcessor
{
    private readonly IOrderValidator _validator;
    private readonly IPricingService _pricing;
    private readonly IPaymentGateway _paymentGateway;
    private readonly IOrderRepository _orders;

    public OrderProcessor(
        IOrderValidator validator,
        IPricingService pricing,
        IPaymentGateway paymentGateway,
        IOrderRepository orders)
    {
        _validator = validator;
        _pricing = pricing;
        _paymentGateway = paymentGateway;
        _orders = orders;
    }
}
```

Ở đây `OrderProcessor` không cần kế thừa `BaseProcessor`. Nó compose các hành vi cần dùng.

Inheritance dễ gây vấn đề khi:

- Base class ngày càng phình.
- Class con override nhiều method để "né" logic cha.
- Thứ tự gọi `base.Method()` trở thành bẫy.
- Một thay đổi ở base làm vỡ nhiều class con.

Quy tắc nhanh:

```text
Cần tái sử dụng hành vi linh hoạt -> Composition
Cần biểu diễn phân cấp thật sự ổn định -> Inheritance
Không chắc -> Composition trước
```

---

## 7. Abstraction đúng và abstraction giả

Abstraction đúng giúp che chi tiết không quan trọng và làm rõ ý định nghiệp vụ.

Ví dụ abstraction tốt:

```csharp
public interface IPaymentGateway
{
    Task<PaymentResult> ChargeAsync(PaymentRequest request, CancellationToken cancellationToken);
}
```

Use case không cần biết provider là Stripe, OnePay, VNPay hay mock trong test.

Abstraction giả thường có dạng:

```csharp
public interface IUserRepository
{
    Task<User> GetByIdAsync(Guid id);
    Task<List<User>> GetAllAsync();
    Task AddAsync(User user);
    Task UpdateAsync(User user);
    Task DeleteAsync(Guid id);
}
```

Interface này chưa chắc sai. Nhưng nếu nó chỉ mirror CRUD của EF Core, không thêm ý nghĩa nghiệp vụ, không giúp test, không che complexity thật, thì có thể chỉ là một tầng gián tiếp dư thừa.

Trước khi thêm abstraction, hỏi:

1. Có ít nhất hai implementation thật hoặc khả năng thay đổi provider rõ ràng không?
2. Abstraction có che được chi tiết infrastructure không?
3. Nó có làm business logic dễ test hơn không?
4. Nó có làm code đọc theo ngôn ngữ nghiệp vụ hơn không?
5. Nó có giảm coupling thật, hay chỉ đổi coupling từ class sang interface?

---

## 8. Tư duy chọn pattern

Khi gặp một vấn đề thiết kế, đừng bắt đầu bằng câu hỏi "dùng pattern nào?". Hãy bắt đầu bằng các câu hỏi sau:

1. Vấn đề hiện tại là gì: duplicate, coupling, khó test, thay đổi nhiều, performance, consistency hay reliability?
2. Phần nào thay đổi thường xuyên nhất?
3. Phần nào nên ổn định?
4. Có boundary rõ giữa business và infrastructure chưa?
5. Nếu thêm một biến thể mới, mình phải sửa bao nhiêu nơi?
6. Nếu test use case này, mình có cần dựng external dependency thật không?
7. Pattern được chọn có làm code dễ đọc hơn với team hiện tại không?
8. Chi phí thêm tầng abstraction có đáng với lợi ích không?

Ví dụ mapping nhanh:

| Vấn đề | Pattern thường cân nhắc |
|---|---|
| Nhiều thuật toán/rule thay thế nhau | Strategy |
| Cần tạo object phức tạp từng bước | Builder |
| Cần che API phức tạp phía sau | Facade |
| Cần bọc thêm hành vi quanh object | Decorator |
| Cần chuyển đổi interface external service | Adapter |
| Cần tách đọc/ghi vì áp lực khác nhau | CQRS |
| Cần đảm bảo event được publish sau commit DB | Outbox |
| Cần retry lỗi tạm thời external service | Retry + Circuit Breaker |
| Cần query nghiệp vụ tái sử dụng | Specification / Query Object |

---

## 9. Dấu hiệu đang over-engineering

Một thiết kế có thể đang quá tay nếu:

- Một use case đơn giản đi qua quá nhiều tầng nhưng không có lý do rõ.
- Có nhiều interface chỉ có đúng một implementation và không che chi tiết gì quan trọng.
- Tên class toàn pattern name nhưng thiếu ngôn ngữ nghiệp vụ.
- Logic bị chia nhỏ đến mức muốn hiểu flow phải mở 10 file.
- Dùng CQRS/Mediator/Event cho CRUD đơn giản nhưng không có áp lực scale, audit, async hay cross-boundary.
- Team khó debug hơn sau khi thêm pattern.

Pattern tốt phải làm hệ thống dễ thay đổi hơn. Nếu pattern làm code khó hiểu hơn mà không mua lại được lợi ích rõ, đó là nợ thiết kế.

---

## 10. Dấu hiệu cần pattern

Ngược lại, nên cân nhắc pattern khi:

- `if/else` hoặc `switch` tăng liên tục theo biến thể nghiệp vụ.
- Nhiều service gọi external API theo cách giống nhau nhưng xử lý lỗi không đồng nhất.
- Test business logic khó vì dính database, cache, queue, email.
- Một thay đổi nhỏ phải sửa nhiều module.
- Transaction, event, audit, cache invalidation bị xử lý rải rác.
- Có nhiều team/module cùng phụ thuộc vào một vùng code chưa có boundary rõ.

---

## 11. Checklist review thiết kế ở mức middle/senior

Khi review một thiết kế dùng pattern, hãy hỏi:

1. Pattern này giải quyết vấn đề cụ thể nào?
2. Vấn đề đó đã xuất hiện thật chưa, hay đang đoán trước quá xa?
3. Boundary giữa domain/application/infrastructure có rõ hơn không?
4. Thêm một biến thể mới có dễ hơn không?
5. Unit test có dễ hơn không?
6. Debug production có khó hơn nhiều không?
7. Tên abstraction có nói bằng ngôn ngữ nghiệp vụ không?
8. Nếu bỏ pattern này đi, code có đơn giản hơn mà vẫn đủ tốt không?
9. Team hiện tại có hiểu và vận hành được pattern này không?
10. Có pattern nào nhẹ hơn giải quyết được 80% vấn đề không?

---

## 12. Tư duy chốt

Design Pattern là công cụ để quản lý thay đổi. Middle biết dùng pattern để giảm lặp và tăng testability. Senior biết cả khi nào **không** dùng pattern.

Trong .NET Core, hãy bắt đầu từ những nền tảng rất thực tế:

- Dependency Injection để đảo chiều phụ thuộc.
- Interface ở boundary có lý do rõ.
- Service tập trung vào use case.
- Infrastructure được bọc sau abstraction khi cần.
- Composition trước inheritance.
- Pattern chỉ xuất hiện khi nó làm code dễ thay đổi, dễ test, dễ hiểu hơn.

```text
Không có pattern nào miễn phí.
Mỗi pattern mua cho ta một lợi ích, nhưng trả bằng complexity.
Senior design là biết lợi ích nào đáng mua, và lúc nào nên giữ code đơn giản.
```
