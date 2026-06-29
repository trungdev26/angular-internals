# Index trong Database: từ cơ bản đến tư duy Middle/Senior

Index là một cấu trúc dữ liệu phụ giúp database tìm dòng nhanh hơn. Nếu bảng là một cuốn sách, index giống mục lục: thay vì đọc từ đầu đến cuối, database đi theo cấu trúc đã sắp xếp để đến đúng vùng dữ liệu cần tìm.

Nhưng index không phải "cứ thêm là nhanh". Index giúp tăng tốc đọc, đổi lại làm chậm ghi, tốn dung lượng, và có thể khiến optimizer chọn plan sai nếu thiết kế không đúng.

---

## 1. Index giải quyết vấn đề gì?

Khi không có index phù hợp, database thường phải đọc nhiều dòng để tìm kết quả.

```sql
SELECT *
FROM Orders
WHERE CustomerId = 10;
```

Nếu bảng `Orders` có 10 triệu dòng và không có index trên `CustomerId`, database có thể phải quét rất nhiều dòng. Đây thường gọi là **table scan** hoặc **full scan**.

Nếu có index:

```sql
CREATE INDEX IX_Orders_CustomerId ON Orders(CustomerId);
```

Database có thể đi vào index theo `CustomerId = 10`, lấy danh sách row cần đọc, rồi trả kết quả nhanh hơn nhiều.

---

## 2. Hiểu đúng: Index là dữ liệu phụ, không phải phép màu

Một index thường chứa:

- Giá trị của cột được index
- Con trỏ hoặc khóa trỏ về dòng dữ liệu thật
- Cấu trúc sắp xếp giúp tìm kiếm nhanh

Vì là dữ liệu phụ nên mỗi lần `INSERT`, `UPDATE`, `DELETE`, database phải cập nhật cả bảng chính và các index liên quan.

```text
Nhiều index hơn -> đọc có thể nhanh hơn
Nhiều index hơn -> ghi chậm hơn, storage tăng, maintenance nặng hơn
```

Senior không hỏi "có nên thêm index không?" một cách chung chung. Senior hỏi: **query nào đang chậm, pattern truy vấn là gì, index này có đáng với chi phí ghi và dung lượng không?**

---

## 3. Các loại scan/seek thường gặp

Tên gọi khác nhau giữa SQL Server, PostgreSQL, MySQL, nhưng tư duy tương tự.

| Hành vi | Ý nghĩa | Thường tốt/xấu |
|---|---|---|
| Table Scan / Seq Scan | Quét toàn bảng | Xấu nếu bảng lớn và chỉ cần ít dòng |
| Index Scan | Quét một phần/lớn index | Có thể ổn, nhưng vẫn đọc nhiều |
| Index Seek | Nhảy đến vùng index cần tìm | Thường tốt cho filter chọn lọc |
| Key Lookup / Bookmark Lookup | Từ index phụ quay lại bảng lấy cột còn thiếu | Tốt khi ít dòng, xấu khi lặp quá nhiều |

Đừng chỉ thấy `Index Scan` là xấu hoặc `Index Seek` là tốt tuyệt đối. Query trả về 70% bảng thì scan có khi hợp lý hơn seek + lookup hàng triệu lần.

---

## 4. B-Tree Index: loại index phổ biến nhất

Phần lớn index mặc định trong database quan hệ là B-Tree hoặc biến thể gần giống B+Tree.

```text
Root
 └─ Intermediate pages
     └─ Leaf pages
         └─ Key + row locator / data
```

B-Tree tốt cho:

- So sánh bằng: `=`
- So sánh range: `>`, `<`, `BETWEEN`
- Sắp xếp: `ORDER BY`
- Prefix search: `LIKE 'abc%'`
- Join theo khóa

B-Tree thường không tốt cho:

- `LIKE '%abc'` hoặc `LIKE '%abc%'`
- Function bọc quanh cột nếu không có computed/function-based index
- Điều kiện có selectivity quá thấp

---

## 5. Clustered và Nonclustered Index

Trong SQL Server, khái niệm này rất quan trọng.

### 5.1. Clustered Index

Clustered index quyết định thứ tự lưu vật lý hoặc logic gần với thứ tự dữ liệu của bảng. Mỗi bảng thường chỉ có một clustered index.

Ví dụ phổ biến:

```sql
CREATE CLUSTERED INDEX CX_Orders_Id ON Orders(Id);
```

Nếu primary key là `Id` tăng dần, clustered index trên `Id` thường hợp lý vì insert mới ít gây xáo trộn page.

### 5.2. Nonclustered Index

Nonclustered index là index phụ. Nó lưu key riêng và trỏ về dòng thật.

```sql
CREATE INDEX IX_Orders_CustomerId ON Orders(CustomerId);
```

Nếu query cần thêm cột không nằm trong index, database có thể phải lookup về clustered index hoặc heap để lấy thêm dữ liệu.

---

## 6. Primary Key, Unique Constraint và Index

Primary key thường tự tạo index, nhưng không có nghĩa mọi query theo nghiệp vụ đều được tối ưu.

```sql
CREATE TABLE Users (
  Id BIGINT PRIMARY KEY,
  Email NVARCHAR(256) NOT NULL
);
```

Query theo `Id` nhanh, nhưng query theo `Email` vẫn cần index riêng nếu thường xuyên dùng:

```sql
CREATE UNIQUE INDEX UX_Users_Email ON Users(Email);
```

Unique index vừa tăng tốc lookup vừa bảo vệ tính đúng đắn dữ liệu.

---

## 7. Selectivity: độ chọn lọc của index

Index hiệu quả khi điều kiện lọc loại bỏ được nhiều dòng.

```text
Selectivity cao: Email, PhoneNumber, OrderCode, InvoiceNo
Selectivity thấp: Gender, IsActive, IsDeleted, Status chỉ có vài giá trị
```

Index đơn lẻ trên cột `IsDeleted` thường ít giá trị, hiếm khi có ích nếu bảng lớn và đa số dòng có cùng giá trị. Nhưng `IsDeleted` có thể hữu ích khi nằm trong composite index đúng ngữ cảnh:

```sql
CREATE INDEX IX_Orders_Tenant_Status_Created
ON Orders(TenantId, Status, CreatedAt);
```

---

## 8. Composite Index: index nhiều cột

Composite index là nơi nhiều developer middle bắt đầu khác biệt rõ với junior.

```sql
CREATE INDEX IX_Orders_Customer_CreatedAt
ON Orders(CustomerId, CreatedAt);
```

Index này phù hợp với:

```sql
WHERE CustomerId = @customerId
ORDER BY CreatedAt DESC
```

Nó cũng có thể hỗ trợ:

```sql
WHERE CustomerId = @customerId
```

Nhưng thường không hỗ trợ tốt nếu chỉ lọc:

```sql
WHERE CreatedAt >= @fromDate
```

Vì `CreatedAt` không phải cột đầu của index.

---

## 9. Quy tắc Leftmost Prefix

Với composite index `(A, B, C)`, database tận dụng tốt các prefix từ trái sang phải:

| Điều kiện | Dùng index tốt không? |
|---|---|
| `WHERE A = ?` | Có |
| `WHERE A = ? AND B = ?` | Có |
| `WHERE A = ? AND B = ? AND C = ?` | Có |
| `WHERE B = ?` | Thường không tốt |
| `WHERE C = ?` | Thường không tốt |
| `WHERE A = ? AND C = ?` | Dùng tốt phần `A`, phần `C` tùy optimizer |

Thứ tự cột trong composite index là quyết định thiết kế, không phải chuyện thẩm mỹ.

---

## 10. Thứ tự cột trong composite index

Một công thức thực dụng:

```text
Equality columns -> Range columns -> Sort columns -> Include columns
```

Ví dụ:

```sql
SELECT Id, TotalAmount, CreatedAt
FROM Orders
WHERE TenantId = @tenantId
  AND CustomerId = @customerId
  AND CreatedAt >= @fromDate
  AND CreatedAt < @toDate
ORDER BY CreatedAt DESC;
```

Index hợp lý:

```sql
CREATE INDEX IX_Orders_Tenant_Customer_Created
ON Orders(TenantId, CustomerId, CreatedAt DESC)
INCLUDE (TotalAmount);
```

Lý do:

- `TenantId`, `CustomerId`: equality filter
- `CreatedAt`: range và sort
- `TotalAmount`: chỉ cần trả ra, không cần dùng để seek

---

## 11. Covering Index và INCLUDE

Covering index là index chứa đủ dữ liệu query cần, giúp database không phải lookup về bảng chính.

```sql
CREATE INDEX IX_Orders_Customer_Created
ON Orders(CustomerId, CreatedAt DESC)
INCLUDE (TotalAmount, Status);
```

Query:

```sql
SELECT CreatedAt, TotalAmount, Status
FROM Orders
WHERE CustomerId = @customerId
ORDER BY CreatedAt DESC;
```

Nếu index đã có đủ `CreatedAt`, `TotalAmount`, `Status`, database có thể trả dữ liệu từ index.

Trade-off:

- Đọc nhanh hơn
- Index lớn hơn
- Ghi chậm hơn
- Dễ tạo quá nhiều index gần giống nhau nếu không kiểm soát

---

## 12. Filtered / Partial Index

Filtered index chỉ index một phần dữ liệu.

SQL Server:

```sql
CREATE INDEX IX_Orders_Active_Created
ON Orders(CreatedAt)
WHERE IsDeleted = 0;
```

PostgreSQL:

```sql
CREATE INDEX IX_Orders_Active_Created
ON Orders(CreatedAt)
WHERE IsDeleted = false;
```

Phù hợp khi query luôn lọc một nhóm nhỏ:

- Dòng chưa xóa mềm
- Đơn hàng đang mở
- Job đang pending
- Dữ liệu active trong khi dữ liệu archive rất lớn

Filtered index rất mạnh nhưng phải chắc rằng query có điều kiện khớp filter, nếu không optimizer không dùng được.

---

## 13. Index cho JOIN

Join nhanh khi cột dùng để join có index hợp lý, đặc biệt ở bảng bị lookup nhiều lần.

```sql
SELECT o.Id, c.Name
FROM Orders o
JOIN Customers c ON c.Id = o.CustomerId
WHERE o.CreatedAt >= @fromDate;
```

Thường cần:

- `Customers.Id`: primary key, đã có index
- `Orders.CreatedAt`: hỗ trợ filter theo thời gian
- `Orders.CustomerId`: có thể cần nếu join theo hướng từ customer sang order

Không có một index chung cho mọi hướng join. Phải xem query bắt đầu từ bảng nào, filter ở đâu, cardinality ra sao.

---

## 14. Index cho ORDER BY

Index có thể giúp tránh sort tốn tài nguyên.

```sql
SELECT TOP 50 Id, CreatedAt
FROM Orders
WHERE TenantId = @tenantId
ORDER BY CreatedAt DESC;
```

Index:

```sql
CREATE INDEX IX_Orders_Tenant_Created
ON Orders(TenantId, CreatedAt DESC);
```

Nếu filter và sort cùng nằm trong index đúng thứ tự, database có thể đọc sẵn theo thứ tự cần trả.

---

## 15. Index cho phân trang

Offset pagination dễ chậm khi page sâu.

```sql
SELECT Id, CreatedAt
FROM Orders
WHERE TenantId = @tenantId
ORDER BY CreatedAt DESC
OFFSET 100000 ROWS FETCH NEXT 50 ROWS ONLY;
```

Database vẫn phải đi qua nhiều dòng trước khi lấy 50 dòng tiếp theo.

Với dữ liệu lớn, cân nhắc keyset pagination:

```sql
SELECT TOP 50 Id, CreatedAt
FROM Orders
WHERE TenantId = @tenantId
  AND (CreatedAt < @lastCreatedAt OR (CreatedAt = @lastCreatedAt AND Id < @lastId))
ORDER BY CreatedAt DESC, Id DESC;
```

Index:

```sql
CREATE INDEX IX_Orders_Tenant_Created_Id
ON Orders(TenantId, CreatedAt DESC, Id DESC);
```

Keyset pagination thường ổn định hơn khi dữ liệu lớn và người dùng đi sâu qua nhiều trang.

---

## 16. Những câu SQL làm index mất tác dụng

### 16.1. Function bọc quanh cột

```sql
WHERE YEAR(CreatedAt) = 2026
```

Nên đổi thành range:

```sql
WHERE CreatedAt >= '2026-01-01'
  AND CreatedAt < '2027-01-01'
```

### 16.2. Leading wildcard

```sql
WHERE Name LIKE '%an'
```

B-Tree index thường không seek tốt được vì phần đầu chuỗi bị bỏ qua.

### 16.3. Ép kiểu ngầm

```sql
WHERE PhoneNumber = 84901234567
```

Nếu `PhoneNumber` là chuỗi, database có thể phải convert cột, làm index khó dùng. Nên truyền đúng kiểu:

```sql
WHERE PhoneNumber = '84901234567'
```

### 16.4. OR quá rộng

```sql
WHERE CustomerId = @id OR PhoneNumber = @phone
```

Có thể phải tách query, dùng `UNION ALL`, hoặc tạo index phù hợp cho từng nhánh tùy case.

---

## 17. Execution Plan: đọc plan trước khi đoán

Không nên thêm index chỉ vì "nghe có vẻ đúng". Hãy xem execution plan.

Cần quan sát:

- Query đang scan hay seek?
- Estimated rows và actual rows lệch nhiều không?
- Có key lookup lặp hàng nghìn/hàng triệu lần không?
- Sort/hash/join nào tốn chi phí?
- Missing index suggestion có hợp lý hay chỉ là gợi ý máy móc?
- Query trả ít dòng hay nhiều dòng?
- Predicate có SARGable không?

SARGable nghĩa là điều kiện có thể tận dụng index seek hiệu quả.

```text
Tốt: WHERE CreatedAt >= @fromDate AND CreatedAt < @toDate
Kém: WHERE CONVERT(date, CreatedAt) = @date
```

---

## 18. Statistics: vì sao có index vẫn chậm?

Optimizer chọn plan dựa trên statistics. Nếu statistics cũ hoặc phân bố dữ liệu lệch, optimizer có thể ước lượng sai số dòng.

Ví dụ:

- Bảng có 100 triệu dòng
- `Status = 'Pending'` chỉ có 1.000 dòng hôm qua
- Hôm nay batch import làm `Pending` thành 20 triệu dòng
- Statistics chưa cập nhật

Optimizer vẫn tưởng `Pending` ít, chọn plan lookup nhiều lần, query chậm nặng.

Vì vậy index tuning không chỉ là tạo index, mà còn gồm:

- Cập nhật statistics
- Theo dõi plan regression
- Kiểm tra parameter sniffing
- Rebuild/reorganize index khi fragmentation thật sự gây vấn đề

---

## 19. Parameter Sniffing

Parameter sniffing xảy ra khi database compile plan dựa trên giá trị parameter đầu tiên, rồi tái sử dụng plan đó cho giá trị khác có phân bố rất khác.

Ví dụ:

```sql
WHERE TenantId = @tenantId
```

Tenant nhỏ có 1.000 đơn, tenant lớn có 50 triệu đơn. Một plan tối ưu cho tenant nhỏ có thể rất tệ cho tenant lớn.

Hướng xử lý tùy database và mức độ vấn đề:

- Tách query theo case dữ liệu lớn/nhỏ
- Cập nhật statistics
- Dùng recompile có kiểm soát
- Tối ưu index theo pattern thật
- Tránh fix mù bằng hint nếu chưa hiểu tác dụng phụ

---

## 20. Index và write workload

Mỗi index thêm vào làm tăng chi phí ghi.

```text
INSERT: phải thêm entry vào từng index
UPDATE cột được index: phải cập nhật index
DELETE: phải xóa entry khỏi index
```

Với bảng giao dịch ghi nhiều như log, audit, order item, stock transaction, việc tạo quá nhiều index sẽ làm hệ thống chậm ở luồng ghi.

Nguyên tắc:

- Index theo query quan trọng, không index theo cảm giác
- Tránh index trùng hoặc gần trùng
- Với bảng append-only lớn, ưu tiên index phục vụ truy vấn theo thời gian, tenant, shop, loại nghiệp vụ
- Với báo cáo nặng, cân nhắc bảng tổng hợp/materialized view thay vì ép một bảng giao dịch phục vụ mọi kiểu report

---

## 21. Index trùng và index dư thừa

Nếu đã có index:

```sql
IX_Orders_Tenant_Customer_Created (TenantId, CustomerId, CreatedAt)
```

Thì index này có thể dư trong nhiều trường hợp:

```sql
IX_Orders_Tenant (TenantId)
```

Vì composite index có thể phục vụ prefix `TenantId`.

Nhưng không phải lúc nào cũng xóa được index ngắn hơn. Index ngắn có thể nhỏ hơn nhiều và phù hợp hơn cho query chỉ cần `TenantId`. Cần xem usage, size, plan và workload thật.

---

## 22. Index cho soft delete, multi-tenant và phân quyền dữ liệu

Trong hệ thống nghiệp vụ, query thường có filter mặc định:

```sql
WHERE TenantId = @tenantId
  AND IsDeleted = 0
  AND ShopId = @shopId
```

Đừng quên các cột filter nền này khi thiết kế index. Một index chỉ theo `CreatedAt` có thể kém hiệu quả nếu mọi query thực tế đều lọc theo `TenantId`, `ShopId`, `IsDeleted`.

Ví dụ:

```sql
CREATE INDEX IX_Invoices_Tenant_Shop_Date
ON Invoices(TenantId, ShopId, InvoiceDate DESC)
WHERE IsDeleted = 0;
```

Nếu database không hỗ trợ filtered index hoặc project chưa dùng, có thể đưa `IsDeleted` vào key, nhưng cần đánh giá selectivity.

---

## 23. Index cho báo cáo

Báo cáo thường lọc theo:

- Khoảng ngày
- Chi nhánh/cửa hàng
- Tenant
- Trạng thái
- Loại nghiệp vụ

Ví dụ:

```sql
SELECT ShopId, SUM(TotalAmount)
FROM Invoices
WHERE TenantId = @tenantId
  AND InvoiceDate >= @fromDate
  AND InvoiceDate < @toDate
  AND Status = 'Paid'
GROUP BY ShopId;
```

Index có thể bắt đầu bằng equality filter rồi đến date range:

```sql
CREATE INDEX IX_Invoices_Tenant_Status_Date_Shop
ON Invoices(TenantId, Status, InvoiceDate, ShopId)
INCLUDE (TotalAmount);
```

Nhưng nếu báo cáo tổng hợp quá lớn, index không đủ. Cần cân nhắc:

- Bảng tổng hợp theo ngày/tháng
- Batch job tính trước
- Partition theo thời gian
- Archive dữ liệu cũ
- Read replica hoặc warehouse cho analytics

---

## 24. Index không thay thế thiết kế dữ liệu

Nếu query phải join 12 bảng lớn, filter mơ hồ, sort trên expression phức tạp, rồi export hàng triệu dòng, thêm index chỉ giảm đau một phần.

Các hướng thiết kế cần nghĩ thêm:

- Denormalize có kiểm soát cho màn hình đọc nhiều
- Bảng read model riêng cho report/search
- Tách dữ liệu nóng và dữ liệu lạnh
- Partition theo thời gian hoặc tenant
- Archive dữ liệu cũ
- Full-text search hoặc search engine cho tìm kiếm text phức tạp

Senior biết lúc nào nên tune index, lúc nào nên đổi shape dữ liệu.

---

## 25. Checklist thiết kế index cho một query

Khi gặp query chậm, đi theo thứ tự:

1. Query này phục vụ màn hình/API/report nào?
2. Bảng có bao nhiêu dòng, tăng bao nhiêu mỗi ngày?
3. Query chạy bao nhiêu lần/phút?
4. Query trả bao nhiêu dòng?
5. Điều kiện `WHERE` là equality, range hay text search?
6. Có `ORDER BY`, `GROUP BY`, `JOIN` nào quan trọng?
7. Có filter nền như tenant, shop, soft delete, phân quyền không?
8. Execution plan hiện tại đang scan, seek, lookup hay sort?
9. Index hiện có có bị trùng hoặc sai thứ tự cột không?
10. Index mới làm write workload chậm thêm bao nhiêu?
11. Có cần covering index không, hay lookup ít dòng là đủ?
12. Có cần filtered index, computed column, full-text, partition hoặc read model không?

---

## 26. Checklist review index ở mức Middle/Senior

Một proposal index tốt nên nói rõ:

- Query hoặc nhóm query được tối ưu
- Plan hiện tại và bottleneck
- Index đề xuất
- Vì sao chọn thứ tự cột như vậy
- Có dùng `INCLUDE` không, vì sao
- Tác động đến insert/update/delete
- Dung lượng dự kiến hoặc ít nhất nhận định size
- Index nào có thể trùng/dư
- Cách kiểm chứng sau khi deploy
- Cách rollback nếu write latency tăng

Ví dụ proposal chưa đủ:

```text
Thêm index CustomerId cho nhanh.
```

Ví dụ proposal tốt hơn:

```text
API lịch sử đơn hàng theo khách đang scan Orders khi lọc CustomerId + CreatedAt.
Đề xuất IX_Orders_Tenant_Customer_Created (TenantId, CustomerId, CreatedAt DESC)
INCLUDE (Status, TotalAmount) để phục vụ filter + sort + list columns.
Kiểm tra thêm write latency vì bảng Orders ghi cao vào giờ cao điểm.
```

---

## 27. Công thức nhớ nhanh

```text
Index tốt = khớp query thật + selectivity đủ tốt + thứ tự cột đúng + chi phí ghi chấp nhận được.
```

Một số quy tắc nhanh:

- Query theo `WHERE` nào nhiều thì index theo pattern đó
- Equality thường đứng trước range
- Cột dùng sort có thể nằm sau filter để tránh sort
- `SELECT *` làm covering index khó và dễ tốn lookup
- Function trên cột thường làm index khó dùng
- Index cột ít giá trị không tự động hữu ích
- Composite index dùng tốt từ trái sang phải
- Missing index suggestion chỉ là gợi ý, không phải mệnh lệnh
- Mỗi index đều có hóa đơn phải trả ở write, storage và maintenance

---

## 28. Ví dụ thực tế: màn hình danh sách hóa đơn

Yêu cầu:

- Lọc theo tenant
- Lọc theo chi nhánh
- Chỉ lấy hóa đơn chưa xóa
- Lọc theo khoảng ngày
- Sắp xếp mới nhất trước
- Hiển thị mã hóa đơn, khách hàng, tổng tiền, trạng thái

Query:

```sql
SELECT Id, InvoiceNo, CustomerId, TotalAmount, Status, InvoiceDate
FROM Invoices
WHERE TenantId = @tenantId
  AND ShopId = @shopId
  AND IsDeleted = 0
  AND InvoiceDate >= @fromDate
  AND InvoiceDate < @toDate
ORDER BY InvoiceDate DESC, Id DESC
OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
```

Index đề xuất:

```sql
CREATE INDEX IX_Invoices_Tenant_Shop_Date_Id
ON Invoices(TenantId, ShopId, InvoiceDate DESC, Id DESC)
INCLUDE (InvoiceNo, CustomerId, TotalAmount, Status)
WHERE IsDeleted = 0;
```

Tư duy:

- `TenantId`, `ShopId`: lọc nền, equality
- `InvoiceDate`: range và sort
- `Id`: tie-breaker để sort ổn định
- `INCLUDE`: phục vụ list columns, giảm lookup
- `WHERE IsDeleted = 0`: chỉ index dữ liệu active nếu DB hỗ trợ

Nếu database không hỗ trợ filtered index, cân nhắc:

```sql
CREATE INDEX IX_Invoices_Tenant_Shop_IsDeleted_Date_Id
ON Invoices(TenantId, ShopId, IsDeleted, InvoiceDate DESC, Id DESC)
INCLUDE (InvoiceNo, CustomerId, TotalAmount, Status);
```

---

## 29. Khi nào không nên thêm index?

Không nên thêm index khi:

- Query hiếm khi chạy
- Bảng nhỏ, scan rẻ hơn maintenance index
- Query trả phần lớn bảng
- Cột có selectivity quá thấp và không kết hợp với filter khác
- Đã có index tương đương
- Bottleneck thật nằm ở network, lock, N+1 query, render UI, hoặc service khác
- Report cần kiến trúc đọc riêng chứ không phải thêm index vào bảng giao dịch

Index là thuốc đúng bệnh, không phải vitamin uống hằng ngày.

---

## 30. Tư duy chốt

Junior thường nhìn index như cú pháp:

```sql
CREATE INDEX ...
```

Middle bắt đầu nhìn index theo query pattern:

```text
WHERE gì, JOIN gì, ORDER BY gì, trả bao nhiêu dòng?
```

Senior nhìn index như một quyết định vận hành:

```text
Plan hiện tại ra sao?
Workload đọc/ghi thế nào?
Data phân bố lệch không?
Statistics có đúng không?
Index có trùng không?
Deploy xong đo bằng gì?
Nếu dữ liệu tăng 10 lần thì còn ổn không?
```

**Kết luận**: Index tốt không phải index nhiều. Index tốt là index phục vụ đúng truy vấn quan trọng, giữ được tính đúng đắn, giảm được chi phí đọc rõ ràng, và không làm hệ thống trả giá quá đắt ở ghi, dung lượng và vận hành.
