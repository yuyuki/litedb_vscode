# LiteDB SQL Command Examples

This page provides examples for common LiteDB SQL commands. For more details, see the [LiteDB Query API documentation](https://www.litedb.org/api/query/).

## SELECT
```sql
SELECT * FROM customers
SELECT name, age FROM users WHERE age > 30
SELECT COUNT(*) FROM orders
```

## INSERT
```sql
INSERT INTO customers VALUES { "name": "John", "age": 30 }
INSERT INTO products VALUES { "name": "Book", "price": 9.99 }
INSERT INTO orders:GUID VALUES { "item": "Book", "qty": 2 }, { "item": "Pen", "qty": 5 }
```

## UPDATE
```sql
UPDATE customers SET Name = LOWER($.Name) WHERE _id = 1
UPDATE customers SET age = 31 WHERE name = "John"
UPDATE products SET price = 8.99 WHERE name = "Book"
```

## DELETE
```sql
DELETE FROM customers WHERE age < 18
DELETE FROM products WHERE price > 100
```

## MISC
```sql
DROP COLLECTION customers
RENAME COLLECTION oldName TO newName
CREATE INDEX idx_name ON customers (name)
CREATE UNIQUE INDEX idx_email ON users (email)
```

## Functions
```sql
SELECT LOWER(name) FROM users
SELECT LENGTH(address) FROM customers
```

## Interfaces and Classes
- `LiteDatabase` - Main database class
- `LiteCollection<T>` - Represents a collection
- `LiteQueryable<T>` - For LINQ queries

For more, visit the [LiteDB Query API](https://www.litedb.org/api/query/).
