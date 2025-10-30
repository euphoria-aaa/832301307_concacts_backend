# 后端代码风格指南 (Express + SQLite)

## 目录
1. [项目结构](#项目结构)
2. [代码组织](#代码组织)
3. [API 设计](#api-设计)
4. [数据库操作](#数据库操作)
5. [错误处理](#错误处理)
6. [日志记录](#日志记录)
7. [安全性](#安全性)
8. [代码约定](#代码约定)
9. [最佳实践](#最佳实践)

## 项目结构

```
backend/
├── server.js              # 主 Express 应用
├── database.db            # SQLite 数据库文件
├── logger.js              # 日志工具
├── docs.js                # Swagger 文档
├── package.json
└── README.md
```

## 代码组织

### 模块结构
按功能组织和关注点分离。

```javascript
// ✓ 正确：关注点分离清晰
const express = require('express')
const cors = require('cors')
const Database = require('better-sqlite3')
const logger = require('./logger')

const app = express()
const PORT = process.env.PORT || 3000

// 中间件设置
app.use(cors())
app.use(express.json())

// 路由定义
app.get('/api/health', (req, res) => { })
```

### 常量和配置
在文件顶部或单独的配置文件集中管理常量。

```javascript
// ✓ 正确：组织良好的常量
const PORT = 3000
const API_BASE_URL = '/api'

// 错误代码枚举
const ERROR_CODES = {
  SUCCESS: 0,
  VALIDATION_ERROR: 1,
  NOT_FOUND: 2,
  DATABASE_ERROR: 3,
  NETWORK_ERROR: -1,
}

// 错误消息配置
const ERROR_MESSAGES = {
  REQUIRED_FIELD_MISSING: 'Required field is missing',
  CONTACT_NOT_FOUND: 'Contact not found',
  DATABASE_OPERATION_FAILED: 'Database operation failed',
}
```

## API 设计

### RESTful 原则
遵循 REST 原则进行 API 设计。

```javascript
// ✓ 正确：RESTful 路由
GET    /api/contacts       # 列出所有联系人
GET    /api/contacts/:id   # 获取单个联系人
POST   /api/contacts       # 创建新联系人
PUT    /api/contacts/:id   # 更新联系人
DELETE /api/contacts/:id   # 删除联系人
```

### 响应格式
对所有 API 端点使用一致的响应格式。

```javascript
// 标准响应格式
{
  code: 0,        // 0 = 成功，非零 = 错误
  msg: "Success", // 人类可读的消息
  data: {...}     // 可选的有效载荷
}
```

### 路由处理器模式
一致地结构化路由处理器。

```javascript
// ✓ 正确：一致的处理器结构
app.get('/api/contacts', (req, res) => {
  try {
    // 1. 提取参数
    const { id } = req.params

    // 2. 验证输入
    if (!id) {
      return sendResponse(res, ERROR_CODES.VALIDATION_ERROR, ERROR_MESSAGES.REQUIRED_FIELD_MISSING)
    }

    // 3. 执行操作
    const result = db.prepare('SELECT * FROM contacts WHERE id = ?').get(id)

    // 4. 发送响应
    if (result) {
      sendResponse(res, ERROR_CODES.SUCCESS, ERROR_MESSAGES.SUCCESS, result)
    } else {
      sendResponse(res, ERROR_CODES.NOT_FOUND, ERROR_MESSAGES.CONTACT_NOT_FOUND)
    }
  } catch (error) {
    // 5. 处理错误
    logger.error('Error description', { error: error.message })
    sendResponse(res, ERROR_CODES.DATABASE_ERROR, ERROR_MESSAGES.DATABASE_OPERATION_FAILED)
  }
})
```

## 数据库操作

### 预编译语句
始终使用预编译语句防止 SQL 注入。

```javascript
// ✓ 正确：预编译语句
const stmt = db.prepare('SELECT * FROM contacts WHERE id = ?')
const result = stmt.get(contactId)

// ✓ 正确：多个参数
const stmt = db.prepare('INSERT INTO contacts (name, phone, email) VALUES (?, ?, ?)')
const result = stmt.run(name, phone, email)
```

### 事务处理
对多个相关操作使用事务。

```javascript
// ✓ 正确：事务示例
const transaction = db.transaction((contacts) => {
  const stmt = db.prepare('INSERT INTO contacts (name, phone) VALUES (?, ?)')
  contacts.forEach(contact => {
    stmt.run(contact.name, contact.phone)
  })
})

try {
  transaction(contactList)
  sendResponse(res, ERROR_CODES.SUCCESS, 'Contacts imported successfully')
} catch (error) {
  logger.error('Import failed', { error: error.message })
  sendResponse(res, ERROR_CODES.DATABASE_ERROR, 'Import failed')
}
```

### 查询助手
创建可重用的查询助手。

```javascript
// ✓ 正确：助手函数
const getContactById = (id) => {
  return db.prepare('SELECT * FROM contacts WHERE id = ?').get(id)
}

const updateContact = (id, data) => {
  const stmt = db.prepare('UPDATE contacts SET name = ?, phone = ?, email = ?, address = ? WHERE id = ?')
  return stmt.run(data.name, data.phone, data.email, data.address, id)
}
```

## 错误处理

### 集中式错误处理器
使用集中式错误处理模式。

```javascript
// ✓ 正确：响应辅助函数
const sendResponse = (res, code, msg, data = null) => {
  const response = { code, msg }
  if (data !== null) {
    response.data = data
  }
  res.json(response)
}

// 在路由处理器中的使用
app.get('/api/contacts', (req, res) => {
  try {
    const contacts = db.prepare('SELECT * FROM contacts').all()
    sendResponse(res, ERROR_CODES.SUCCESS, 'Success', contacts)
  } catch (error) {
    logger.error('Database error', { error: error.message })
    sendResponse(res, ERROR_CODES.DATABASE_ERROR, ERROR_MESSAGES.DATABASE_OPERATION_FAILED)
  }
})
```

### 输入验证
在端点级别验证所有输入。

```javascript
// ✓ 正确：输入验证
const validateContactInput = (name, phone) => {
  if (!name || !phone) {
    return ERROR_MESSAGES.REQUIRED_FIELD_MISSING
  }
  return null
}

app.post('/api/contacts', (req, res) => {
  const { name, phone, email, address } = req.body

  const validationError = validateContactInput(name, phone)
  if (validationError) {
    return sendResponse(res, ERROR_CODES.VALIDATION_ERROR, validationError)
  }

  // 处理有效请求
})
```

### 错误日志
使用足够的上下文记录错误以便调试。

```javascript
// ✓ 正确：详细的错误日志
catch (error) {
  logger.error('Error creating contact', {
    error: error.message,
    stack: error.stack,
    contactData: { name, phone, email, address }
  })
  sendResponse(res, ERROR_CODES.DATABASE_ERROR, ERROR_MESSAGES.DATABASE_OPERATION_FAILED)
}
```

## 日志记录

### 日志级别
为不同类型的消息使用适当的日志级别。

```javascript
logger.info('User action', { userId: 123, action: 'login' })
logger.warn('Deprecated endpoint', { endpoint: '/old/api' })
logger.error('Database connection failed', { error: error.message })
logger.debug('Query executed', { query: 'SELECT * FROM contacts', params: [] })
```

### 结构化日志
使用带有上下文对象的结构化日志。

```javascript
// ✓ 正确：结构化日志
logger.info('Contact retrieved successfully', {
  id: contactId,
  operation: 'read',
  timestamp: new Date().toISOString()
})

logger.error('Contact update failed', {
  id: contactId,
  attemptedData: updateData,
  error: error.message,
  stack: error.stack
})
```

## 安全性

### 输入清理
清理和验证所有输入。

```javascript
// ✓ 正确：基本清理
const sanitizeInput = (str) => {
  if (typeof str !== 'string') return str
  return str.trim().replace(/[<>]/g, '')
}

const name = sanitizeInput(req.body.name)
```

### CORS 配置
为您的环境适当地配置 CORS。

```javascript
// ✓ 正确：特定 CORS 配置
const corsOptions = {
  origin: ['http://localhost:5173', 'https://yourdomain.com'],
  optionsSuccessStatus: 200
}

app.use(cors(corsOptions))
```

### 限流
考虑在生产环境中实施限流。

```javascript
// ✓ 正确：限流（如果需要）
const rateLimit = require('express-rate-limit')

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100 // 限制每个 IP 在窗口期内请求数
})

app.use('/api/', limiter)
```

## 代码约定

### 命名约定
- **变量和函数**: camelCase
- **常量**: UPPER_SNAKE_CASE
- **数据库表**: 小写下划线
- **数据库列**: 小写下划线

```javascript
// ✓ 正确
const databaseConnection = null
const MAX_RETRY_COUNT = 3
const getUserById = (id) => { }

// ✓ 正确：数据库
-- users 表
-- user_profiles 表
-- contact_id (外键)
```

### 注释和文档
对函数文档使用 JSDoc，对复杂逻辑使用内联注释。

```javascript
/**
 * 处理联系人创建
 * @param {Object} contactData - 联系人信息
 * @param {string} contactData.name - 联系人姓名（必需）
 * @param {string} contactData.phone - 电话号码（必需）
 * @param {string} contactData.email - 邮箱地址（可选）
 * @returns {Object} 创建的联系人对象
 */
const createContact = (contactData) => {
  // 实现
}

// ✗ 避免：不清晰的注释
// Process data
processContact(data)
```

### 模块模式
使用清晰的模块模式和导出。

```javascript
// ✓ 正确：命名导出用于工具模块
module.exports = {
  ERROR_CODES,
  ERROR_MESSAGES,
  validateContactInput,
  sendResponse
}

// ✓ 正确：导出应用用于测试
const app = express()
module.exports = app

// 然后在单独的文件中
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`)
})
```

## 最佳实践

### 1. 环境配置
使用环境变量进行配置。

```javascript
// ✓ 正确
const PORT = process.env.PORT || 3000
const NODE_ENV = process.env.NODE_ENV || 'development'

// ✓ 正确：环境特定逻辑
if (NODE_ENV === 'production') {
  // 生产环境设置
} else {
  // 开发环境设置
}
```

### 2. Async/Await 用于数据库操作
对异步操作使用 async/await。

```javascript
// ✓ 正确：现代异步语法
app.get('/api/contacts', async (req, res) => {
  try {
    const contacts = await db.prepare('SELECT * FROM contacts').all()
    sendResponse(res, ERROR_CODES.SUCCESS, 'Success', contacts)
  } catch (error) {
    logger.error('Database error', { error: error.message })
    sendResponse(res, ERROR_CODES.DATABASE_ERROR, ERROR_MESSAGES.DATABASE_OPERATION_FAILED)
  }
})
```

### 3. 数据库连接管理
初始化一次数据库连接并重用。

```javascript
// ✓ 正确：单一数据库实例
const db = new Database('database.db')

// 配置数据库
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')
```

### 4. 资源清理
确保正确清理数据库连接。

```javascript
// ✓ 正确：优雅关闭
process.on('SIGINT', () => {
  logger.info('Shutting down gracefully...')
  db.close()
  process.exit(0)
})
```

### 5. HTTP 状态码
使用适当的 HTTP 状态码。

```javascript
// ✓ 正确：适当的状态码
res.status(200).json(response)     // 成功
res.status(201).json(response)     // 已创建
res.status(400).json(response)     // 错误请求
res.status(404).json(response)     // 未找到
res.status(500).json(response)     // 服务器错误
```

### 6. API 版本控制
从一开始就规划 API 版本控制。

```javascript
// ✓ 正确：版本化路由
app.get('/api/v1/contacts', handler)
app.get('/api/v2/contacts', newHandler)
```

### 7. Swagger 文档
使用 Swagger/OpenAPI 记录 API。

```javascript
/**
 * @swagger
 * /api/contacts:
 *   get:
 *     summary: Get all contacts
 *     responses:
 *       200:
 *         description: List of contacts
 */
app.get('/api/contacts', (req, res) => {
  // 实现
})
```

### 8. 中间件排序
按逻辑顺序放置中间件。

```javascript
// ✓ 正确：有序的中间件
app.use(helmet())              // 安全头最先
app.use(cors())                // CORS
app.use(express.json())        // 主体解析
app.use(rateLimiter)           // 限流
app.use('/api', routes)        // 路由最后
```

## 代码审查检查清单

- [ ] 遵循 RESTful API 设计原则
- [ ] 对所有数据库查询使用预编译语句
- [ ] 有适当的错误处理和 try-catch 块
- [ ] 使用带有上下文的结构化日志
- [ ] 验证所有输入
- [ ] 使用适当的 HTTP 状态码
- [ ] 遵循命名约定
- [ ] 对复杂函数有 JSDoc 注释
- [ ] 无硬编码的密钥或配置
- [ ] 使用环境变量进行配置
- [ ] CORS 正确配置
- [ ] 响应格式一致
- [ ] 对多步操作使用数据库事务
- [ ] 资源正确清理

## 常见模式

### CRUD 操作模式
```javascript
// 创建
app.post('/api/resource', (req, res) => {
  // 1. 验证
  // 2. 插入
  // 3. 返回创建的资源
})

// 读取全部
app.get('/api/resource', (req, res) => {
  // 1. 查询
  // 2. 返回数组
})

// 读取单个
app.get('/api/resource/:id', (req, res) => {
  // 1. 验证 ID
  // 2. 查询
  // 3. 返回资源或 404
})

// 更新
app.put('/api/resource/:id', (req, res) => {
  // 1. 验证 ID 和主体
  // 2. 更新
  // 3. 返回更新的资源
})

// 删除
app.delete('/api/resource/:id', (req, res) => {
  // 1. 验证 ID
  // 2. 删除
  // 3. 返回成功消息
})
```

## 参考资源

- [Express.js 最佳实践](https://expressjs.com/en/advanced/best-practice-security.html)
- [REST API 设计](https://restfulapi.net/)
- [better-sqlite3 文档](https://github.com/JoshuaWise/better-sqlite3)
- [OpenAPI 规范](https://swagger.io/specification/)
- [Node.js 错误处理](https://nodejs.org/api/errors.html)
