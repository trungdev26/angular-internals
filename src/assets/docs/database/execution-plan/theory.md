# Execution Plan trong Database

Execution Plan là bản mô tả cách database dự định hoặc đã thực sự chạy một câu SQL.

Nếu SQL là câu hỏi mình gửi cho database, thì execution plan là câu trả lời cho câu hỏi:

```text
Database sẽ lấy dữ liệu bằng cách nào?
Đọc bảng nào trước?
Dùng index nào?
Join kiểu gì?
Sort ở đâu?
Ước lượng bao nhiêu dòng?
Tốn chi phí ở bước nào?
```

Execution Plan là kỹ năng rất quan trọng để lên middle/senior backend, vì nó giúp mình không tối ưu bằng cảm giác.

---

## 1. Vì sao backend developer cần học execution plan?

Khi một API chậm, nguyên nhân có thể nằm ở nhiều chỗ:

- Network
- Application code
- N+1 query
- Query thiếu index
- Index có nhưng sai thứ tự cột
- Statistics cũ
- Parameter sniffing
- Lock/blocking
- Query trả quá nhiều dòng
- Report thiết kế sai hướng

Nếu không đọc plan, mình dễ sửa kiểu đoán:

```text
Thêm đại một index.
Rewrite query theo cảm giác.
Tăng timeout.
Cache tạm.
Đổ lỗi database chậm.
```

Senior không dừng ở "query này chậm". Senior hỏi:

```text
Nó chậm ở operator nào?
Ước lượng row có sai không?
Nó scan vì thiếu index hay vì trả quá nhiều dữ liệu?
Có key lookup lặp quá nhiều không?
Sort/hash có spill không?
Index mới có đáng với chi phí write không?
```

---

## 2. Execution Plan là gì?

Một câu SQL khai báo mình muốn kết quả gì, không nói database phải làm từng bước thế nào.

Ví dụ:

```sql
SELECT Id, CustomerId, TotalAmount
FROM Orders
WHERE CustomerId = @customerId
ORDER BY CreatedAt DESC;
```

Database optimizer sẽ chọn cách chạy:

```text
1. Dùng index nào để tìm Orders?
2. Có cần đọc bảng chính không?
3. Có cần sort không?
4. Có cần lookup thêm cột không?
5. Trả dữ liệu theo thứ tự nào?
```

Execution plan là kết quả của quá trình optimizer chọn kế hoạch đó.

---

## 3. Estimated Plan và Actual Plan

### 3.1. Estimated Execution Plan

Estimated plan là plan database dự đoán sẽ dùng, chưa chạy query thật.

Nó dựa vào:

- Statistics
- Index hiện có
- Constraint
- Cardinality estimation
- Parameter hoặc giá trị giả định

Ưu điểm:

- Không cần chạy query nặng
- Hữu ích khi query có thể ảnh hưởng production

Nhược điểm:

- Chỉ là dự đoán
- Không có số dòng thực tế
- Không thấy runtime thật

### 3.2. Actual Execution Plan

Actual plan là plan sau khi query chạy thật.

Nó cho biết:

- Actual rows
- Actual executions
- Runtime operator
- Có spill không
- Có warning không
- Chênh lệch estimate vs actual

Khi debug query chậm, actual plan thường có giá trị hơn.

```text
Estimated plan cho biết database nghĩ gì.
Actual plan cho biết chuyện gì thật sự xảy ra.
```

---

## 4. Optimizer hoạt động như thế nào?

Database optimizer cố chọn plan có chi phí thấp nhất theo mô hình nội bộ.

Nó không thử mọi plan có thể trong mọi trường hợp, vì số khả năng quá lớn. Nó dùng metadata và statistics để ước lượng.

Optimizer quan tâm:

- Bảng có bao nhiêu dòng
- Index nào có sẵn
- Điều kiện filter chọn lọc ra sao
- Join giữa bảng nào
- Sort/group cần bao nhiêu dữ liệu
- Dữ liệu phân bố thế nào
- Query cần trả bao nhiêu cột

Điểm quan trọng:

```text
Optimizer chọn plan dựa trên thông tin nó có.
Nếu statistics sai hoặc query viết khó tối ưu, plan có thể sai.
```

---

## 5. Cost không phải thời gian tuyệt đối

Trong nhiều database, execution plan có chỉ số cost.

Nhưng cost không đơn giản là:

```text
Cost 10 = chạy 10ms
Cost 100 = chạy 100ms
```

Cost thường là điểm ước lượng tương đối dựa trên CPU, IO, row count, operator và mô hình nội bộ.

Dùng cost để:

- Nhìn operator nào đắt tương đối trong plan
- So sánh hai plan cùng môi trường
- Định hướng bước cần điều tra

Không nên dùng cost như thời gian tuyệt đối.

```text
Plan cost thấp nhưng vẫn chậm nếu bị blocking, IO nghẽn, memory pressure hoặc trả dữ liệu quá lớn qua network.
```

---

## 6. Table Scan / Sequential Scan

Table scan nghĩa là database đọc toàn bộ bảng hoặc phần lớn bảng.

Ví dụ:

```sql
SELECT *
FROM Orders
WHERE CustomerId = 10;
```

Nếu không có index trên `CustomerId`, database có thể phải quét toàn bảng.

Table scan không phải lúc nào cũng xấu.

Nó có thể hợp lý khi:

- Bảng nhỏ
- Query trả phần lớn bảng
- Index không chọn lọc
- Đọc toàn bảng rẻ hơn seek + lookup quá nhiều lần

Nó thường xấu khi:

- Bảng lớn
- Query chỉ cần vài dòng
- API chạy thường xuyên
- Scan làm giữ lock/IO lâu

Tư duy đúng:

```text
Không phải thấy scan là thêm index ngay.
Phải hỏi query cần bao nhiêu phần trăm dữ liệu và scan đang tốn bao nhiêu.
```

---

## 7. Index Seek

Index seek nghĩa là database dùng cấu trúc index để nhảy đến vùng dữ liệu cần tìm.

Ví dụ:

```sql
CREATE INDEX IX_Orders_CustomerId
ON Orders(CustomerId);
```

Query:

```sql
SELECT Id, CreatedAt, TotalAmount
FROM Orders
WHERE CustomerId = @customerId;
```

Nếu `CustomerId` có selectivity tốt, database có thể dùng index seek.

Index seek thường tốt khi:

- Filter chọn ít dòng
- Predicate SARGable
- Index có cột filter đúng thứ tự
- Query không cần lookup quá nhiều

Nhưng index seek không đảm bảo query nhanh tuyệt đối.

Ví dụ:

```text
Index seek tìm ra 2 triệu dòng.
Sau đó key lookup 2 triệu lần.
Kết quả vẫn rất chậm.
```

---

## 8. Index Scan

Index scan nghĩa là database quét index thay vì quét bảng.

Index scan có thể nhanh hơn table scan nếu index nhỏ hơn bảng hoặc đã chứa đủ cột cần trả.

Ví dụ:

```sql
SELECT CustomerId
FROM Orders;
```

Nếu có index trên `CustomerId`, database có thể scan index đó thay vì scan cả bảng.

Index scan không tự động xấu. Nhưng nếu query đáng lẽ chỉ cần vài dòng mà lại index scan nhiều triệu dòng, cần xem lại:

- Predicate có SARGable không?
- Có function bọc quanh cột không?
- Có implicit conversion không?
- Index có đúng thứ tự cột không?
- Statistics có sai không?

---

## 9. Key Lookup / Bookmark Lookup

Key lookup xảy ra khi database dùng nonclustered index để tìm dòng, rồi phải quay lại bảng chính hoặc clustered index để lấy thêm cột còn thiếu.

Ví dụ index:

```sql
CREATE INDEX IX_Orders_CustomerId
ON Orders(CustomerId);
```

Query:

```sql
SELECT Id, CustomerId, TotalAmount, Status, CreatedAt
FROM Orders
WHERE CustomerId = @customerId;
```

Index có `CustomerId`, nhưng không có `TotalAmount`, `Status`, `CreatedAt`. Database có thể:

```text
Index Seek IX_Orders_CustomerId
-> Key Lookup về bảng Orders cho từng dòng
```

Key lookup ổn nếu chỉ vài dòng.

Key lookup rất tệ nếu lặp hàng chục nghìn hoặc hàng triệu lần.

Cách xử lý:

- Chỉ select cột cần dùng
- Tạo covering index bằng `INCLUDE`
- Đổi composite index đúng query
- Chấp nhận scan nếu query trả phần lớn bảng

Ví dụ:

```sql
CREATE INDEX IX_Orders_Customer_Created
ON Orders(CustomerId, CreatedAt DESC)
INCLUDE (TotalAmount, Status);
```

---

## 10. Nested Loop Join

Nested loop join thường chạy theo kiểu:

```text
Với mỗi dòng bên ngoài,
đi tìm dòng tương ứng ở bảng bên trong.
```

Ví dụ:

```sql
SELECT o.Id, c.Name
FROM Orders o
JOIN Customers c ON c.Id = o.CustomerId
WHERE o.CreatedAt >= @fromDate;
```

Nested loop tốt khi:

- Bảng ngoài trả ít dòng
- Bảng trong có index tốt theo join key
- Lookup mỗi dòng rẻ

Nested loop tệ khi:

- Bảng ngoài trả rất nhiều dòng
- Bảng trong không có index
- Lookup lặp quá nhiều

Dấu hiệu cần chú ý:

```text
Nested Loop + Key Lookup chạy hàng trăm nghìn lần.
```

---

## 11. Hash Join

Hash join thường dùng khi join lượng dữ liệu lớn.

Ý tưởng:

```text
Build hash table từ một input.
Probe input còn lại vào hash table.
```

Hash join tốt khi:

- Join nhiều dòng
- Không có index phù hợp cho nested loop
- Equality join

Hash join có thể tốn:

- Memory
- CPU
- TempDB/disk nếu spill

Nếu plan có hash join và spill warning, cần kiểm tra:

- Estimated rows có sai quá nhiều không?
- Statistics có cũ không?
- Query có lọc được sớm hơn không?
- Có index hỗ trợ join/filter không?
- Memory grant có thiếu không?

---

## 12. Merge Join

Merge join cần hai input đã được sắp xếp theo join key.

Nó tốt khi:

- Hai phía đều lớn
- Dữ liệu đã sorted nhờ index
- Join theo range/equality phù hợp

Nếu chưa sorted, database có thể phải sort trước, làm tăng chi phí.

Merge join thường xuất hiện trong query lớn, report hoặc join trên các key đã có index đúng thứ tự.

---

## 13. Sort operator

Sort operator xuất hiện khi database cần sắp xếp dữ liệu mà không thể tận dụng index.

Ví dụ:

```sql
SELECT Id, CreatedAt
FROM Orders
WHERE TenantId = @tenantId
ORDER BY CreatedAt DESC;
```

Nếu index chỉ có `TenantId`:

```sql
CREATE INDEX IX_Orders_Tenant
ON Orders(TenantId);
```

Database có thể lọc theo tenant rồi sort lại theo `CreatedAt`.

Index tốt hơn:

```sql
CREATE INDEX IX_Orders_Tenant_Created
ON Orders(TenantId, CreatedAt DESC);
```

Sort đáng chú ý khi:

- Sort nhiều dòng
- Có spill ra disk
- Nằm trước pagination
- Nằm trong report/group lớn

---

## 14. Aggregate operator

Aggregate dùng cho `COUNT`, `SUM`, `AVG`, `MIN`, `MAX`, `GROUP BY`.

Ví dụ:

```sql
SELECT ShopId, SUM(TotalAmount)
FROM Invoices
WHERE TenantId = @tenantId
  AND InvoiceDate >= @fromDate
  AND InvoiceDate < @toDate
GROUP BY ShopId;
```

Plan có thể dùng:

- Stream aggregate: tốt khi input đã sorted theo group key
- Hash aggregate: tốt cho input lớn nhưng cần memory

Nếu aggregate nặng:

- Có lọc đủ sớm không?
- Có index theo filter/date/group không?
- Có cần bảng tổng hợp không?
- Có đang report trên bảng giao dịch quá lớn không?

Không phải report chậm nào cũng sửa bằng index. Nhiều case cần read model hoặc bảng tổng hợp.

---

## 15. Filter, Predicate và Residual Predicate

Plan thường có predicate để lọc dữ liệu.

Cần phân biệt:

```text
Seek predicate: điều kiện dùng được để seek vào index.
Residual predicate: điều kiện lọc sau khi đã đọc dữ liệu.
```

Ví dụ index `(TenantId, CreatedAt)`:

```sql
WHERE TenantId = @tenantId
  AND CreatedAt >= @fromDate
  AND Status = 'Paid'
```

Database có thể seek tốt theo `TenantId`, `CreatedAt`, rồi filter `Status` sau nếu `Status` không nằm đúng vị trí hoặc không có trong index.

Residual predicate không luôn xấu, nhưng nếu nó loại bỏ rất nhiều dòng sau khi đã đọc quá nhiều, cần xem lại index.

---

## 16. SARGable là gì?

SARGable nghĩa là điều kiện có thể tận dụng index hiệu quả.

Tốt:

```sql
WHERE CreatedAt >= '2026-01-01'
  AND CreatedAt < '2026-02-01'
```

Kém:

```sql
WHERE YEAR(CreatedAt) = 2026
```

Vì function bọc quanh cột làm database khó dùng index seek theo giá trị gốc.

Ví dụ khác:

```sql
WHERE Name LIKE 'Nguyen%'
```

Thường dùng B-Tree index tốt hơn:

```sql
WHERE Name LIKE '%Nguyen%'
```

Leading wildcard thường không seek tốt bằng B-Tree.

Câu nhớ:

```text
Đừng bắt database biến đổi từng dòng rồi mới so sánh nếu mình có thể viết điều kiện theo range/index-friendly.
```

---

## 17. Implicit conversion

Implicit conversion xảy ra khi database phải tự ép kiểu để so sánh.

Ví dụ cột `PhoneNumber` là string:

```sql
WHERE PhoneNumber = 84901234567
```

Database có thể phải convert cột hoặc parameter, làm index khó dùng.

Nên truyền đúng kiểu:

```sql
WHERE PhoneNumber = '84901234567'
```

Trong plan, implicit conversion thường là dấu hiệu nhỏ nhưng gây hậu quả lớn:

- Scan thay vì seek
- Estimate sai
- CPU cao
- Query chậm bất thường

Backend developer cần để ý kiểu dữ liệu parameter từ ORM/API.

---

## 18. Estimated Rows vs Actual Rows

Đây là một trong những chỉ số quan trọng nhất khi đọc actual plan.

Ví dụ:

```text
Estimated rows: 10
Actual rows: 500000
```

Database nghĩ chỉ có 10 dòng nên chọn nested loop + key lookup. Thực tế có 500.000 dòng nên plan trở nên rất tệ.

Nguyên nhân:

- Statistics cũ
- Dữ liệu phân bố lệch
- Parameter sniffing
- Predicate phức tạp
- Function/implicit conversion
- Correlation giữa nhiều cột mà optimizer ước lượng kém

Khi estimate lệch mạnh, đừng chỉ nhìn operator. Hãy hỏi:

```text
Vì sao optimizer đoán sai số dòng?
```

---

## 19. Cardinality và selectivity

Cardinality là số lượng dòng.

Selectivity là độ chọn lọc của điều kiện.

Ví dụ:

```text
Email = 'a@b.com' -> selectivity cao
IsDeleted = 0 -> selectivity thấp nếu đa số dòng chưa xóa
Status = 'Pending' -> tùy phân bố dữ liệu
TenantId = 1 -> có thể rất nhiều hoặc rất ít tùy tenant
```

Optimizer cần ước lượng cardinality để chọn plan.

Nếu điều kiện chọn ít dòng:

- Index seek thường tốt
- Nested loop có thể tốt

Nếu điều kiện chọn nhiều dòng:

- Scan có thể hợp lý
- Hash join có thể tốt hơn
- Key lookup nhiều lần có thể tệ

---

## 20. Statistics

Statistics mô tả phân bố dữ liệu trong bảng/index để optimizer ước lượng số dòng.

Nếu statistics cũ hoặc không đủ chi tiết, plan có thể sai.

Ví dụ:

```text
Hôm qua Pending có 1.000 dòng.
Hôm nay import lỗi làm Pending thành 5.000.000 dòng.
Statistics chưa cập nhật.
Optimizer vẫn nghĩ Pending ít.
```

Hậu quả:

- Chọn nested loop thay vì hash join
- Chọn key lookup quá nhiều
- Memory grant thiếu
- Sort/hash spill

Việc tuning query không chỉ là tạo index. Đôi khi cần:

- Update statistics
- Kiểm tra auto update statistics
- Kiểm tra histogram
- Tách query cho data skew
- Dùng filtered statistics/index nếu phù hợp

---

## 21. Parameter sniffing

Parameter sniffing xảy ra khi database compile plan dựa trên một giá trị parameter cụ thể, rồi tái dùng plan đó cho giá trị khác.

Ví dụ:

```sql
WHERE TenantId = @tenantId
```

Tenant nhỏ:

```text
1.000 orders
```

Tenant lớn:

```text
50.000.000 orders
```

Plan tốt cho tenant nhỏ có thể rất tệ cho tenant lớn.

Dấu hiệu:

- Cùng query lúc nhanh lúc chậm
- Clear plan cache hoặc recompile thì tạm hết
- Một vài customer/tenant lớn gây chậm
- Estimate rows lệch rất mạnh tùy parameter

Hướng xử lý tùy database:

- Update statistics
- Tách query cho case lớn/nhỏ
- Recompile có kiểm soát
- Optimize for specific/unknown trong SQL Server khi thật sự hiểu
- Filtered index/statistics
- Thiết kế partition/read model nếu dữ liệu lệch quá lớn

Không nên dùng hint mù chỉ vì thấy query nhanh hơn một lần.

---

## 22. Memory Grant và Spill

Một số operator cần memory:

- Sort
- Hash join
- Hash aggregate

Database cấp memory dựa trên estimated rows.

Nếu estimate thấp hơn thực tế, memory không đủ và operator có thể spill ra disk/tempdb.

Dấu hiệu:

```text
Sort spill
Hash spill
TempDB tăng cao
Query chậm khi dữ liệu lớn
```

Cách điều tra:

- Estimate vs actual rows có lệch không?
- Sort/hash đang xử lý bao nhiêu dòng?
- Có index giúp tránh sort không?
- Có lọc sớm hơn được không?
- Có cần chia report thành batch/read model không?

---

## 23. Top, Limit và pagination

Plan cho query có `TOP`, `LIMIT`, `OFFSET` có thể rất khác query thường.

Ví dụ:

```sql
SELECT TOP 50 Id, CreatedAt
FROM Orders
WHERE TenantId = @tenantId
ORDER BY CreatedAt DESC;
```

Index tốt:

```sql
CREATE INDEX IX_Orders_Tenant_Created
ON Orders(TenantId, CreatedAt DESC);
```

Database có thể đọc 50 dòng đầu theo đúng thứ tự.

Nhưng offset sâu:

```sql
ORDER BY CreatedAt DESC
OFFSET 100000 ROWS FETCH NEXT 50 ROWS ONLY;
```

Database vẫn phải đi qua nhiều dòng trước khi lấy 50 dòng cần trả.

Với dữ liệu lớn, cân nhắc keyset pagination:

```sql
WHERE TenantId = @tenantId
  AND (CreatedAt < @lastCreatedAt OR (CreatedAt = @lastCreatedAt AND Id < @lastId))
ORDER BY CreatedAt DESC, Id DESC;
```

Index:

```sql
CREATE INDEX IX_Orders_Tenant_Created_Id
ON Orders(TenantId, CreatedAt DESC, Id DESC);
```

---

## 24. Missing Index Suggestion

Một số database/tool gợi ý missing index.

Không nên xem đó là mệnh lệnh.

Missing index suggestion có thể hữu ích, nhưng thường thiếu ngữ cảnh:

- Không biết write workload
- Không biết index đã có gần giống
- Không biết query khác bị ảnh hưởng
- Có thể đề xuất nhiều index trùng nhau
- Có thể thêm quá nhiều include columns
- Không hiểu nghiệp vụ hot/cold path

Trước khi tạo index theo suggestion, hỏi:

```text
Query này có quan trọng không?
Chạy bao nhiêu lần mỗi phút?
Index hiện có có thể sửa/thay vì thêm mới không?
Index mới có trùng prefix với index khác không?
Write cost tăng bao nhiêu?
Plan sau khi thêm index có thật sự tốt không?
```

---

## 25. Query trả nhiều dữ liệu thì index không cứu hết

Nếu query cần trả 5 triệu dòng, có index cũng không biến nó thành nhẹ.

Ví dụ:

```sql
SELECT *
FROM AuditLogs
WHERE CreatedAt >= '2026-01-01';
```

Nếu điều kiện này trả 80% bảng, scan có thể hợp lý hơn seek.

Vấn đề thật có thể là:

- API không nên trả nhiều dữ liệu như vậy
- Cần pagination
- Cần export async
- Cần archive dữ liệu cũ
- Cần partition
- Cần read replica
- Cần bảng tổng hợp

Senior biết khi nào tối ưu query và khi nào phải đổi thiết kế use case.

---

## 26. SELECT * làm plan nặng hơn

`SELECT *` làm database phải lấy mọi cột.

Hậu quả:

- Khó dùng covering index
- Tăng key lookup
- Tăng IO
- Tăng network payload
- Dễ kéo theo cột lớn như note/json/blob

Ví dụ tốt hơn:

```sql
SELECT Id, OrderNo, Status, CreatedAt, TotalAmount
FROM Orders
WHERE CustomerId = @customerId;
```

Chỉ lấy cột màn hình/API thật sự cần.

Trong backend, DTO rõ ràng không chỉ giúp code sạch, mà còn giúp query plan nhẹ hơn.

---

## 27. N+1 query không nằm trong một plan duy nhất

Execution plan giúp đọc từng query, nhưng N+1 thường là vấn đề ở application.

Ví dụ:

```text
Load 100 orders
Với mỗi order, query customer một lần
=> 101 queries
```

Mỗi query customer có thể plan rất đẹp, nhưng tổng thể API vẫn chậm.

Cần kết hợp:

- Query log
- APM/tracing
- Count số query mỗi request
- Include/join/batch load hợp lý

Senior không chỉ đọc plan của một query, mà nhìn toàn bộ request path.

---

## 28. Plan cache

Database có thể cache execution plan để tái sử dụng.

Ưu điểm:

- Giảm chi phí compile query
- Tăng tốc query lặp lại

Nhược điểm:

- Plan cũ có thể không còn phù hợp khi dữ liệu đổi
- Parameter sniffing
- Query dynamic tạo quá nhiều plan khác nhau

Ví dụ xấu:

```text
SELECT * FROM Orders WHERE CustomerId = 1
SELECT * FROM Orders WHERE CustomerId = 2
SELECT * FROM Orders WHERE CustomerId = 3
```

Nếu app build SQL bằng cách nối string thay vì parameter, có thể làm plan cache phình và tăng rủi ro SQL injection.

Nên dùng parameterized query.

---

## 29. Lock và execution plan

Plan không chỉ ảnh hưởng tốc độ đọc, mà còn ảnh hưởng lock.

Ví dụ:

```sql
UPDATE Orders
SET Status = 'Expired'
WHERE Status = 'Pending'
  AND ExpiredAt < @now;
```

Nếu thiếu index `(Status, ExpiredAt)`, database có thể scan nhiều dòng, giữ lock lâu và block request khác.

Index phù hợp:

```sql
CREATE INDEX IX_Orders_Status_ExpiredAt
ON Orders(Status, ExpiredAt);
```

Tư duy quan trọng:

```text
Plan tệ của UPDATE/DELETE có thể gây blocking production nặng hơn SELECT chậm.
```

Khi review query ghi, luôn xem điều kiện `WHERE` có index đủ tốt không.

---

## 30. Cách đọc execution plan theo thứ tự

Một checklist thực dụng:

1. Query trả bao nhiêu dòng?
2. Operator nào chiếm cost/time nhiều nhất?
3. Có table scan/large index scan không?
4. Scan có hợp lý không hay đáng lẽ phải seek?
5. Có key lookup lặp nhiều không?
6. Có sort/hash aggregate/hash join lớn không?
7. Có spill warning không?
8. Estimated rows và actual rows lệch bao nhiêu?
9. Predicate có SARGable không?
10. Có implicit conversion không?
11. Join order có hợp lý không?
12. Có missing index suggestion không, và suggestion có đáng tin không?
13. Có parameter sniffing/data skew không?
14. Có blocking/lock ngoài plan không?
15. Query có đang trả quá nhiều dữ liệu so với nhu cầu API không?

Đừng chỉ nhìn một operator. Plan là câu chuyện toàn bộ luồng dữ liệu.

---

## 31. Case 1: API lịch sử đơn hàng theo khách bị chậm

Query:

```sql
SELECT Id, OrderNo, Status, TotalAmount, CreatedAt
FROM Orders
WHERE CustomerId = @customerId
ORDER BY CreatedAt DESC
OFFSET @skip ROWS FETCH NEXT @take ROWS ONLY;
```

Plan hiện tại:

```text
Table Scan Orders
Sort CreatedAt DESC
Return page
```

Vấn đề:

- Không có index theo `CustomerId`
- Sort nhiều dòng
- Pagination dựa trên kết quả đã sort

Index đề xuất:

```sql
CREATE INDEX IX_Orders_Customer_Created
ON Orders(CustomerId, CreatedAt DESC)
INCLUDE (OrderNo, Status, TotalAmount);
```

Plan kỳ vọng:

```text
Index Seek theo CustomerId
Đọc theo CreatedAt DESC
Không cần sort lớn
Ít hoặc không cần key lookup
```

Nếu page rất sâu, cân nhắc keyset pagination.

---

## 32. Case 2: Có index nhưng vẫn chậm vì key lookup

Index hiện có:

```sql
CREATE INDEX IX_Orders_CustomerId
ON Orders(CustomerId);
```

Query:

```sql
SELECT Id, OrderNo, Status, TotalAmount, CreatedAt
FROM Orders
WHERE CustomerId = @customerId;
```

Plan:

```text
Index Seek IX_Orders_CustomerId
Key Lookup Orders x 200000
```

Vấn đề:

- Seek có, nhưng trả quá nhiều dòng
- Lookup lặp quá nhiều
- Query cần nhiều cột không có trong index

Hướng xử lý:

- Nếu API thật sự cần nhiều dòng: pagination
- Nếu chỉ cần list columns: covering index
- Nếu query trả phần lớn orders của customer lớn: scan có thể hợp lý hơn
- Nếu customer phân bố lệch: xem parameter sniffing

Index có thể cân nhắc:

```sql
CREATE INDEX IX_Orders_Customer_Created
ON Orders(CustomerId, CreatedAt DESC)
INCLUDE (OrderNo, Status, TotalAmount);
```

---

## 33. Case 3: Query report chậm vì aggregate lớn

Query:

```sql
SELECT ShopId, SUM(TotalAmount) AS Revenue
FROM Invoices
WHERE TenantId = @tenantId
  AND InvoiceDate >= @fromDate
  AND InvoiceDate < @toDate
  AND Status = 'Paid'
GROUP BY ShopId;
```

Plan:

```text
Index/Table Scan nhiều triệu dòng
Hash Aggregate
Hash spill
```

Index có thể giúp:

```sql
CREATE INDEX IX_Invoices_Tenant_Status_Date_Shop
ON Invoices(TenantId, Status, InvoiceDate, ShopId)
INCLUDE (TotalAmount);
```

Nhưng nếu report chạy trên dữ liệu rất lớn, index có thể vẫn chưa đủ.

Hướng senior hơn:

- Bảng doanh thu tổng hợp theo ngày/shop
- Job cập nhật số liệu
- Report async
- Read replica
- Partition theo ngày
- Giới hạn khoảng thời gian export

---

## 34. Case 4: Query không SARGable

Query:

```sql
SELECT Id, CreatedAt
FROM Orders
WHERE CONVERT(date, CreatedAt) = @date;
```

Vấn đề:

```text
Function bọc quanh CreatedAt.
Database khó seek theo index CreatedAt.
```

Viết lại:

```sql
SELECT Id, CreatedAt
FROM Orders
WHERE CreatedAt >= @startOfDay
  AND CreatedAt < @nextDay;
```

Index:

```sql
CREATE INDEX IX_Orders_CreatedAt
ON Orders(CreatedAt);
```

Đây là ví dụ kinh điển: không đổi nghiệp vụ, chỉ đổi cách viết predicate để optimizer dùng index tốt hơn.

---

## 35. Case 5: Data skew và tenant lớn

Query:

```sql
SELECT Id, OrderNo, CreatedAt
FROM Orders
WHERE TenantId = @tenantId
  AND Status = 'Pending';
```

Dữ liệu:

```text
Tenant A: 1.000 orders
Tenant B: 50.000.000 orders
```

Một plan không chắc tốt cho cả hai.

Dấu hiệu:

- Tenant nhỏ chạy nhanh
- Tenant lớn timeout
- Hoặc ngược lại
- Actual rows lệch xa estimated rows

Hướng xử lý:

- Index theo pattern tenant/status phù hợp
- Tách path cho tenant lớn
- Recompile có kiểm soát
- Filtered index nếu status đặc biệt
- Partition/read model nếu tenant lớn quá khác biệt
- Không giả định dữ liệu phân bố đều

---

## 36. Checklist tối ưu query chậm

Khi gặp query chậm, đi theo thứ tự:

1. Xác nhận query nào chậm, input nào chậm.
2. Đo thời gian chạy thật và số dòng trả về.
3. Lấy actual execution plan.
4. So sánh estimated rows vs actual rows.
5. Tìm scan/lookup/sort/hash/spill đáng nghi.
6. Kiểm tra predicate có SARGable không.
7. Kiểm tra implicit conversion.
8. Kiểm tra index hiện có.
9. Kiểm tra statistics.
10. Kiểm tra parameter sniffing/data skew.
11. Kiểm tra query có trả quá nhiều cột/dòng không.
12. Đề xuất sửa query/index/schema/use case.
13. Chạy lại plan sau khi sửa.
14. Đo tác động đến write workload.
15. Ghi lại lý do để review và rollback nếu cần.

---

## 37. Checklist proposal index từ execution plan

Một đề xuất index tốt nên có:

- Query/API/report đang tối ưu
- Plan hiện tại đang tệ ở đâu
- Số dòng estimated vs actual nếu có
- Index hiện có liên quan
- Index đề xuất
- Vì sao chọn thứ tự cột như vậy
- Có dùng `INCLUDE` không, vì sao
- Có giảm sort/lookup/scan không
- Tác động đến insert/update/delete
- Rủi ro index trùng
- Cách verify sau deploy
- Cách rollback nếu write latency tăng

Ví dụ chưa đủ:

```text
Thêm index CreatedAt cho nhanh.
```

Ví dụ tốt hơn:

```text
API danh sách đơn theo tenant đang scan Orders và sort CreatedAt cho mỗi request.
Actual plan đọc khoảng 1.2M rows để trả 50 rows.
Đề xuất IX_Orders_Tenant_Created_Id (TenantId, CreatedAt DESC, Id DESC)
INCLUDE (OrderNo, Status, TotalAmount) để phục vụ filter + order + list columns.
Cần đo write overhead vì Orders là bảng ghi cao.
```

---

## 38. Khi nào không nên tối ưu bằng index?

Không nên thêm index nếu:

- Query hiếm khi chạy
- Bảng nhỏ
- Query trả phần lớn bảng
- Bottleneck nằm ở N+1 query
- API trả quá nhiều dữ liệu
- Report cần read model/bảng tổng hợp
- Index mới trùng index cũ
- Write workload đang rất cao
- Query chậm do blocking chứ không phải plan
- Query chậm do network/render/export file

Index là một cách tối ưu, không phải câu trả lời duy nhất.

---

## 39. EXPLAIN và EXPLAIN ANALYZE

Trong PostgreSQL/MySQL, `EXPLAIN` là cách xem database dự định chạy query thế nào.

```sql
EXPLAIN
SELECT Id, OrderNo, CreatedAt
FROM Orders
WHERE CustomerId = 10
ORDER BY CreatedAt DESC;
```

`EXPLAIN ANALYZE` chạy query thật rồi trả thêm thông tin runtime.

```sql
EXPLAIN ANALYZE
SELECT Id, OrderNo, CreatedAt
FROM Orders
WHERE CustomerId = 10
ORDER BY CreatedAt DESC;
```

Khác biệt quan trọng:

| Lệnh | Có chạy thật không? | Dùng để làm gì? |
|---|---:|---|
| `EXPLAIN` | Thường không chạy query thật | Xem plan dự kiến, an toàn hơn với query nặng |
| `EXPLAIN ANALYZE` | Có chạy thật | So sánh estimated với actual, đo runtime thật |

Với câu `SELECT`, `EXPLAIN ANALYZE` thường an toàn hơn nhưng vẫn có thể tốn CPU/IO nếu query nặng. Với `INSERT`, `UPDATE`, `DELETE`, phải cực kỳ cẩn thận vì database có thể thực thi thay đổi thật tùy hệ quản trị và cú pháp dùng.

Trong SQL Server, tư duy tương tự nằm ở:

- Estimated Execution Plan
- Actual Execution Plan
- `SET STATISTICS IO ON`
- `SET STATISTICS TIME ON`

Điểm cần nhớ: estimated plan cho biết database nghĩ gì. Actual plan hoặc `EXPLAIN ANALYZE` cho biết chuyện gì đã thật sự xảy ra.

---

## 40. Cách đọc EXPLAIN theo thứ tự

Đừng mở plan lên rồi nhảy ngay vào câu hỏi "có dùng index không?".

Một thứ tự đọc thực dụng:

1. Query trả bao nhiêu dòng?
2. Bảng chính có bao nhiêu dòng?
3. Operator nào xử lý nhiều dòng nhất?
4. Operator nào tốn thời gian nhất?
5. Estimated rows và actual rows lệch bao nhiêu?
6. Có scan lớn không, scan đó có hợp lý không?
7. Có key lookup lặp nhiều không?
8. Có sort/hash/aggregate lớn không?
9. Có spill ra disk/tempdb không?
10. Predicate có SARGable không?
11. Index hiện có có khớp `WHERE`, `JOIN`, `ORDER BY` không?
12. Query có đang trả quá nhiều cột/dòng so với nhu cầu thật không?

Nếu query trả 80% bảng, scan có thể là lựa chọn đúng. Nếu query trả 50 dòng nhưng plan đọc 1 triệu dòng rồi sort, đó mới là tín hiệu cần xử lý.

Một câu hỏi middle hay hỏi:

```text
Vì sao query không dùng index?
```

Một câu hỏi senior hơn:

```text
Nếu dùng index thì có thật sự rẻ hơn scan không, với số dòng thực tế này?
```

---

## 41. Đọc EXPLAIN qua ví dụ production

Query danh sách hóa đơn:

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

Plan hiện tại:

```text
Index Scan IX_Invoices_Tenant
Residual predicate: ShopId, IsDeleted, InvoiceDate
Sort InvoiceDate DESC, Id DESC
Key Lookup x 180000
Return 50 rows
```

Đọc plan:

- Có dùng index, nhưng index chỉ giúp một phần
- `ShopId`, `IsDeleted`, `InvoiceDate` bị lọc sau khi đã đọc nhiều dòng
- Sort lớn xảy ra trước pagination
- Key lookup lặp quá nhiều chỉ để trả 50 dòng

Index có thể cân nhắc:

```sql
CREATE INDEX IX_Invoices_Tenant_Shop_Date_Id
ON Invoices(TenantId, ShopId, InvoiceDate DESC, Id DESC)
INCLUDE (InvoiceNo, CustomerId, TotalAmount, Status)
WHERE IsDeleted = 0;
```

Nếu database không hỗ trợ filtered index:

```sql
CREATE INDEX IX_Invoices_Tenant_Shop_IsDeleted_Date_Id
ON Invoices(TenantId, ShopId, IsDeleted, InvoiceDate DESC, Id DESC)
INCLUDE (InvoiceNo, CustomerId, TotalAmount, Status);
```

Sau khi thêm index, không được dừng ở "đã tạo index". Phải đo lại:

- Logical reads giảm không?
- Sort lớn còn không?
- Key lookup còn không?
- Actual rows có khớp estimate hơn không?
- Write latency của bảng `Invoices` có tăng đáng kể không?
- Index mới có trùng hoặc gần trùng index cũ không?

---

## 42. Những bẫy khi đọc EXPLAIN

### 42.1. Chỉ nhìn cost

Cost là mô hình ước lượng của database, không phải thời gian tuyệt đối. Operator cost cao đáng để xem, nhưng không đủ để kết luận.

### 42.2. Thấy scan là thêm index

Scan có thể hợp lý nếu query trả nhiều dữ liệu. Vấn đề có thể nằm ở use case, pagination, export async hoặc report model.

### 42.3. Thấy seek là yên tâm

Seek trả ra quá nhiều dòng, hoặc seek xong lookup hàng trăm nghìn lần, vẫn có thể rất chậm.

### 42.4. Tin missing index suggestion tuyệt đối

Suggestion không biết write workload, index trùng, nghiệp vụ hot path, dung lượng và cách rollback. Nó là gợi ý điều tra, không phải lệnh phải làm.

### 42.5. Quên data skew

Tenant nhỏ và tenant lớn có thể cần plan khác nhau. Một plan đẹp ở dev hoặc staging chưa chắc chịu được production.

### 42.6. Quên nhìn toàn bộ request

Từng query có plan đẹp nhưng API vẫn chậm nếu có N+1 query, payload quá lớn, lock/blocking, connection pool cạn hoặc UI render quá nhiều dòng.

---

## 43. Tư duy senior khi đọc plan

Junior thường hỏi:

```text
Query có dùng index không?
```

Middle hỏi:

```text
Query dùng index nào?
Seek hay scan?
Có lookup/sort không?
```

Senior hỏi:

```text
Plan này có phù hợp với dữ liệu thật không?
Estimate có đáng tin không?
Plan này ổn cho tenant lớn và tenant nhỏ không?
Index mới ảnh hưởng write thế nào?
Nếu dữ liệu tăng 10 lần thì plan còn ổn không?
Có cần đổi use case, pagination, report model hoặc data model không?
Sau deploy đo bằng gì?
```

Execution plan là nơi database nói thật với mình, nhưng mình phải biết nghe đúng cách.

---

## 44. Câu tổng kết

Execution Plan không phải công cụ chỉ dành cho DBA.

Backend developer càng làm hệ thống business lớn càng cần biết đọc plan, vì rất nhiều lỗi production nằm ở chỗ:

```text
Query chạy được ở dev.
Dữ liệu production lớn hơn nhiều.
Optimizer chọn plan khác.
API timeout.
Transaction giữ lock lâu.
User thấy hệ thống chậm.
```

**Kết luận**: Đọc execution plan tốt giúp mình chuyển từ "tối ưu theo cảm giác" sang "tối ưu có bằng chứng". Đây là kỹ năng rất đáng đầu tư nếu muốn đi từ middle lên senior backend.
