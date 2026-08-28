# Index và chiến lược truy cập dữ liệu

Index là cấu trúc dữ liệu phụ giúp database định vị row theo một giá trị hoặc thứ tự cụ thể mà không phải đọc toàn bộ bảng. Index lưu key đã được tổ chức để tìm kiếm cùng thông tin định vị row tương ứng trong bảng.

Một index chỉ hữu ích khi cấu trúc của nó phù hợp với access pattern của truy vấn. Điều kiện lọc, phép nối, thứ tự sắp xếp, số row cần trả về và phân bố dữ liệu đều ảnh hưởng đến quyết định sử dụng index.

Index cải thiện một số thao tác đọc nhưng làm tăng dung lượng và chi phí `INSERT`, `UPDATE`, `DELETE`. Vì vậy, thiết kế index là quyết định cho toàn workload, không phải thao tác thêm index cho mọi cột xuất hiện trong `WHERE`.

## Thành phần của index

Một index entry thường gồm hai phần:

- **Index key:** giá trị được tổ chức để tìm kiếm hoặc sắp xếp.
- **Row locator:** thông tin giúp database định vị row tương ứng trong bảng.

```text
Index
  key = 42
  row locator ──────────► Row trong bảng
```

Nếu query cần các cột không có trong index, database dùng row locator để đọc row từ bảng. Thao tác quay lại bảng có chi phí nhỏ khi chỉ xảy ra vài lần, nhưng có thể trở thành bottleneck khi lặp lại trên hàng trăm nghìn row.

## Cấu trúc B-tree

B-tree là cấu trúc index phổ biến cho dữ liệu có thứ tự. Cây gồm root node, các internal node và leaf node:

```text
Root
  ├─ Internal node
  │    ├─ Leaf: key nhỏ
  │    └─ Leaf: key trung bình
  └─ Internal node
       └─ Leaf: key lớn
```

Internal node giúp loại bỏ những nhánh không thể chứa key cần tìm. Leaf node giữ các key theo thứ tự và liên kết đến row tương ứng.

B-tree phù hợp với:

- So sánh bằng: `=`.
- So sánh phạm vi: `<`, `<=`, `>`, `>=`, `BETWEEN`.
- `ORDER BY`.
- Prefix search như `LIKE 'abc%'` khi collation và operator cho phép.
- Join theo key.
- Tìm giá trị đầu hoặc cuối theo thứ tự.

B-tree không phù hợp trực tiếp với:

- Contains search như `LIKE '%abc%'`.
- Tìm phần tử bên trong document hoặc collection.
- Dữ liệu không gian.
- Operator không duy trì quan hệ thứ tự trên key.

Những bài toán này cần index type hoặc search structure phù hợp với operator thay vì thêm một B-tree tương tự.

## Access Paths

Access path là cách execution plan chọn để lấy row từ bảng. Có index không đồng nghĩa database luôn dùng index.

| Access path | Cách đọc dữ liệu | Phù hợp khi |
|---|---|---|
| Table scan | Đọc tuần tự toàn bộ hoặc phần lớn bảng | Bảng nhỏ hoặc query cần phần lớn row |
| Index lookup | Đi trực tiếp đến một key hoặc một phạm vi key | Predicate chọn ít row |
| Index range scan | Đọc một đoạn liên tiếp của index | Range predicate hoặc ordered result |
| Covering index access | Trả kết quả từ dữ liệu có trong index | Index chứa đủ cột query cần |
| Index-to-table lookup | Dùng index định vị rồi đọc thêm row từ bảng | Kết quả ít và cần cột ngoài index |

Table scan không mặc định là lỗi. Nếu query trả phần lớn bảng, đọc tuần tự có thể rẻ hơn rất nhiều lần lookup rời rạc.

Tên plan node có thể khác nhau giữa các hệ quản trị. Khi đọc execution plan, cần nhận diện hành vi đọc thay vì đánh giá chỉ dựa trên tên node.

## Khai báo index

### Single-column index

Single-column index dùng một cột làm key:

```sql
CREATE INDEX ix_orders_customer
ON orders (khachHangId);
```

Index này cung cấp access path theo `khachHangId`. Nó không tự tối ưu query chỉ lọc theo `trangThai` hoặc `ngayDatHang`.

### Unique index

Unique index vừa cung cấp access path vừa ngăn key trùng:

```sql
CREATE UNIQUE INDEX ux_customers_email
ON customers (email);
```

Khai báo này bảo vệ invariant: hai customer không thể có cùng `email`. Khi uniqueness là quy tắc dữ liệu, nên thể hiện bằng constraint hoặc unique index thay vì chỉ kiểm tra ở application.

### Composite index

Composite index dùng nhiều cột theo một thứ tự xác định:

```sql
CREATE INDEX ix_orders_customer_date
ON orders (khachHangId, ngayDatHang DESC, id DESC);
```

Index key được sắp xếp theo `khachHangId` trước. Trong cùng một customer, key tiếp tục được sắp xếp theo `ngayDatHang` và `id` giảm dần.

### Index cho expression

Expression index lưu kết quả của một biểu thức thay vì giá trị cột gốc. Nó phù hợp khi query thường xuyên sử dụng cùng một phép biến đổi, chẳng hạn chuẩn hóa email bằng `lower(email)`.

```sql
SELECT id, email
FROM customers
WHERE lower(email) = lower('Lan@example.com');
```

Cú pháp khai báo expression index khác nhau giữa các hệ quản trị. Chỉ tạo loại index này khi expression ổn định và query thực tế sử dụng đúng biểu thức đã index.

## Primary key, unique constraint và foreign key

`PRIMARY KEY` và `UNIQUE` constraint thường được thực thi bằng unique index. Index phía sau constraint có hai trách nhiệm:

- Kiểm tra tính duy nhất khi ghi.
- Cung cấp access path theo key.

Foreign key mô tả quan hệ dữ liệu nhưng index trên cột tham chiếu cần được đánh giá theo access pattern:

```sql
SELECT id, tongTien
FROM orders
WHERE khachHangId = 42;
```

Nếu hệ thống thường lấy order theo customer, index trên `orders(khachHangId)` hỗ trợ truy vấn này. Việc hệ quản trị tự tạo index cho foreign key hay không là khác biệt triển khai; không nên giả định nếu chưa kiểm tra schema thực tế.

## Selectivity và cardinality

**Cardinality** là số giá trị phân biệt trong một tập dữ liệu. **Selectivity** mô tả mức độ một predicate thu hẹp số row.

| Cột | Đặc điểm thường gặp |
|---|---|
| `email`, `soHoaDon` | Nhiều giá trị phân biệt |
| `khachHangId` | Có thể chọn một nhóm nhỏ row |
| `trangThai`, `deletedAt` | Ít trạng thái hoặc phân bố lệch |

Index trên cột có ít giá trị phân biệt không tự động vô ích. Giá trị hiếm như `trangThai = 'FAILED'` vẫn có thể rất chọn lọc nếu chỉ chiếm một phần nhỏ của bảng.

Optimizer cần statistics để ước lượng số row của từng giá trị. Vì vậy, hiệu quả của index phụ thuộc vào phân bố thực tế chứ không chỉ kiểu dữ liệu hay số lượng giá trị có thể có.

## Leftmost prefix

Với B-tree composite index `(A, B, C)`, các access pattern bắt đầu từ `A` thường có lợi thế:

| Predicate | Phần key xác định phạm vi scan |
|---|---|
| `A = value` | `A` |
| `A = value AND B = value` | `A, B` |
| `A = value AND B >= value` | `A, B` |
| `B = value` | Thiếu leading key `A` |
| `A = value AND C = value` | `A` thu hẹp phạm vi; `C` có thể được kiểm tra sau |

Không nên suy ra rằng mọi cột có trong composite index đều được sử dụng như nhau. Vị trí của cột quyết định phần nào của cây có thể bị loại bỏ trước khi scan.

## Thứ tự cột trong composite index

Thứ tự key xuất phát từ query contract:

1. Equality predicate ổn định.
2. Range predicate hoặc ordering cần duy trì.
3. Tie-breaker tạo thứ tự xác định.
4. Các cột chỉ dùng để trả về được xem xét cho covering index.

Đây là hướng phân tích, không phải công thức bất biến. Selectivity, nhiều query dùng chung index và execution plan thực tế có thể dẫn đến thứ tự khác.

Giả sử query lọc theo customer và khoảng ngày:

```sql
SELECT id, ngayDatHang, tongTien
FROM orders
WHERE khachHangId = 42
  AND ngayDatHang >= '2026-07-01'
  AND ngayDatHang < '2026-08-01'
ORDER BY ngayDatHang DESC, id DESC;
```

Index phù hợp với equality, range và ordering:

```sql
CREATE INDEX ix_orders_customer_date
ON orders (khachHangId, ngayDatHang DESC, id DESC);
```

`khachHangId` xác định vùng key của customer. `ngayDatHang` giới hạn khoảng cần đọc và cung cấp ordering. `id` giữ kết quả ổn định khi nhiều order có cùng thời điểm.

## Covering index

Covering index chứa đủ dữ liệu query cần nên database không phải quay lại bảng để lấy thêm cột.

Với query:

```sql
SELECT ngayDatHang, tongTien, trangThai
FROM orders
WHERE khachHangId = 42
ORDER BY ngayDatHang DESC
LIMIT 50;
```

Một index có `khachHangId`, `ngayDatHang`, `tongTien` và `trangThai` có thể bao phủ query. Tuy nhiên, cột dùng để tìm kiếm và cột chỉ dùng để trả về không có vai trò giống nhau.

Một số hệ quản trị hỗ trợ khai báo non-key payload column; hệ khác yêu cầu cột bao phủ nằm trực tiếp trong index key. Cần dùng cú pháp riêng của engine khi triển khai, nhưng trade-off chung không thay đổi:

- Ít table lookup hơn.
- Index rộng hơn.
- Tốn storage và buffer cache hơn.
- Tăng chi phí ghi.

Không nên cố bao phủ `SELECT *`. Covering index phù hợp với query quan trọng có output ổn định và giới hạn số cột.

## Ứng dụng

### Lịch sử đơn hàng

API cần lấy 50 order gần nhất của một customer:

```sql
SELECT id,
       ngayDatHang,
       tongTien,
       trangThai
FROM orders
WHERE khachHangId = 42
ORDER BY ngayDatHang DESC, id DESC
LIMIT 50;
```

Access pattern gồm equality trên `khachHangId`, ordering theo `ngayDatHang` và `id`, sau đó dừng ở 50 row.

```sql
CREATE INDEX ix_orders_customer_date
ON orders (khachHangId, ngayDatHang DESC, id DESC);
```

Database có thể đi đến vùng key của customer, đọc theo đúng thứ tự cần trả và dừng sớm. Nếu execution plan cho thấy table lookup chiếm phần lớn chi phí, mới tiếp tục đánh giá covering index.

### Order đang chờ xử lý

Worker thường lấy một nhóm nhỏ order có trạng thái `PENDING`:

```sql
SELECT id, createdAt
FROM orders
WHERE trangThai = 'PENDING'
ORDER BY createdAt, id
LIMIT 100;
```

Index theo filter và ordering:

```sql
CREATE INDEX ix_orders_status_created
ON orders (trangThai, createdAt, id);
```

Index này hiệu quả khi `PENDING` chỉ chiếm một phần nhỏ của bảng. Nếu phần lớn order đều `PENDING`, optimizer có thể chọn table scan vì index không thu hẹp đủ dữ liệu.

### Keyset pagination

`OFFSET` sâu vẫn buộc database đi qua những row đứng trước. Keyset pagination tiếp tục từ key cuối của trang hiện tại:

```sql
SELECT id, ngayDatHang, tongTien
FROM orders
WHERE khachHangId = 42
  AND (
    ngayDatHang < '2026-07-20 09:30:00'
    OR (
      ngayDatHang = '2026-07-20 09:30:00'
      AND id < 9120
    )
  )
ORDER BY ngayDatHang DESC, id DESC
LIMIT 50;
```

Index `(khachHangId, ngayDatHang DESC, id DESC)` khớp với filter và ordering. Cursor phải chứa cả `ngayDatHang` lẫn `id`; nếu thiếu tie-breaker, row có cùng thời điểm có thể bị lặp hoặc bỏ qua.

### Join theo foreign key

Query lấy order trong khoảng ngày cùng tên customer:

```sql
SELECT o.id,
       o.ngayDatHang,
       c.ten
FROM orders o
JOIN customers c ON c.id = o.khachHangId
WHERE o.ngayDatHang >= '2026-07-01'
  AND o.ngayDatHang < '2026-08-01';
```

Primary key của `customers` hỗ trợ lookup theo `c.id`. Index cần thiết ở `orders` phụ thuộc hướng join và predicate. Nếu query bắt đầu từ khoảng ngày của order, index có leading key `ngayDatHang` có thể hữu ích hơn index chỉ có `khachHangId`.

Không có một index chung cho mọi phép join. Cần xem bảng nào được lọc trước, số row sau filter và số lần relation còn lại bị lookup.

## Predicate và khả năng sử dụng index

Predicate có indexable form khi database có thể đối chiếu operator trực tiếp với key hoặc expression đã index.

### Range thay cho function trên cột

Predicate sau phải tính function cho từng row:

```sql
WHERE DATE(createdAt) = '2026-07-26'
```

Nếu có B-tree trên `createdAt`, biểu diễn cùng yêu cầu bằng range:

```sql
WHERE createdAt >= '2026-07-26 00:00:00'
  AND createdAt <  '2026-07-27 00:00:00'
```

Range cung cấp điểm bắt đầu và kết thúc trực tiếp trong B-tree.

### Prefix và contains search

Prefix search có leading value:

```sql
WHERE ten LIKE 'nguyen%'
```

Contains search không có leading value để định vị trong B-tree:

```sql
WHERE ten LIKE '%nguyen%'
```

Nếu contains search là yêu cầu chính, cần chọn full-text, inverted index hoặc search engine phù hợp thay vì thêm một B-tree tương tự.

### Kiểu dữ liệu của parameter

Parameter nên có kiểu tương thích với cột. Cast không phù hợp trên cột có thể làm database không dùng được index condition như mong muốn hoặc làm cardinality estimate kém chính xác.

Định nghĩa kiểu dữ liệu đúng ở application và prepared statement thường tốt hơn việc chèn cast tùy ý vào SQL.

## Optimizer và statistics

Optimizer ước lượng chi phí của các access path rồi chọn plan có estimated cost thấp nhất. Các yếu tố chính gồm:

- Số row dự kiến sau predicate.
- Số page của bảng và index phải đọc.
- Chi phí đọc tuần tự và đọc ngẫu nhiên.
- Khả năng dùng ordering sẵn có.
- Statistics về phân bố và độ phổ biến của giá trị.

Statistics sai có thể khiến index đúng cấu trúc nhưng plan không phù hợp. `EXPLAIN` cho biết plan được chọn:

```sql
EXPLAIN
SELECT id, tongTien
FROM orders
WHERE khachHangId = 42
ORDER BY ngayDatHang DESC, id DESC
LIMIT 50;
```

Cú pháp lấy actual runtime và I/O metrics khác nhau giữa các hệ quản trị. Khi đọc kết quả, cần tập trung vào:

- Access path được chọn.
- Estimated rows so với actual rows.
- Số lần node được thực hiện.
- Số row bị loại sau khi đọc.
- Lượng dữ liệu đọc từ index và bảng.
- Sort còn tồn tại hay index đã cung cấp ordering.

## Chi phí ghi và dung lượng

Mỗi index thêm công việc cho workload ghi:

```text
INSERT → thêm index entry
UPDATE index key → cập nhật index entry
DELETE → loại bỏ index entry theo cơ chế của storage engine
```

Index rộng chiếm nhiều storage và buffer cache hơn. Nhiều index gần giống nhau có thể cải thiện một số query đọc nhưng làm giảm throughput ghi của toàn bảng.

Khi đánh giá index mới, cần đo cả:

- Latency và lượng dữ liệu đọc của query mục tiêu.
- Latency `INSERT`, `UPDATE`, `DELETE`.
- Kích thước index.
- Tần suất sử dụng.
- Ảnh hưởng đến cache.

## Index trùng lặp

Nếu đã có index:

```sql
CREATE INDEX ix_orders_customer_date
ON orders (khachHangId, ngayDatHang);
```

index chỉ chứa `khachHangId` có thể trùng chức năng cho một số query:

```sql
CREATE INDEX ix_orders_customer
ON orders (khachHangId);
```

Không xóa chỉ dựa trên leftmost prefix. Index ngắn hơn có thể nhỏ hơn đáng kể và phù hợp hơn cho query chỉ cần `khachHangId`. Cần kiểm tra kích thước, usage, execution plan và write overhead trước khi loại bỏ.

## Khác biệt cần tách theo hệ quản trị

Các khái niệm B-tree, composite index, leftmost prefix, selectivity, covering và access path có thể dùng chung. Những phần sau cần đọc tài liệu riêng của engine trước khi áp dụng:

- Cú pháp expression index.
- Cách khai báo cột chỉ dùng để bao phủ output.
- Conditional hoặc filtered index.
- Full-text, document, spatial và block-range index.
- Index tự động tạo bởi foreign key.
- Tên execution-plan node và cách lấy actual runtime/I/O.
- Online hoặc concurrent index creation.
- Cơ chế row locator, visibility và table lookup.

Không nên đưa cú pháp của một engine vào bài nền tảng rồi xem đó là hành vi chung.

## Quy trình thiết kế index

Một đề xuất index cần bắt đầu từ query và workload:

1. Xác định row output, predicate, join, ordering và giới hạn số row.
2. Đo số row của bảng, phân bố dữ liệu và tần suất query.
3. Đọc execution plan hiện tại trên dữ liệu đại diện.
4. Chọn index structure theo operator.
5. Chọn key order theo equality, range, ordering và tie-breaker.
6. Đánh giá covering chỉ khi table lookup là chi phí đáng kể.
7. So sánh plan, runtime, lượng dữ liệu đọc và write latency trước và sau thay đổi.
8. Kiểm tra index trùng lặp và kế hoạch rollback.

Không nên thêm index khi bảng nhỏ, query hiếm, query trả phần lớn bảng hoặc bottleneck nằm ngoài access path. Report quét và tổng hợp phần lớn dữ liệu có thể cần partition, bảng tổng hợp hoặc hệ thống phân tích riêng.

## Tổng kết

Index cung cấp access path; optimizer quyết định có sử dụng access path đó hay không. B-tree phù hợp với equality, range và ordering. Composite index cần được thiết kế theo leading key, predicate và thứ tự kết quả.

Thiết kế index bắt đầu từ query contract và workload. Cấu trúc đúng phải giảm lượng dữ liệu được đọc, giữ chi phí ghi ở mức chấp nhận được và được kiểm chứng bằng execution plan cùng số liệu thực tế.
