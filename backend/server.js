import express from 'express'
import cors from 'cors'
import Database from 'better-sqlite3'
import logger from './logger.js'
import swaggerUi from 'swagger-ui-express'
import swaggerJSDoc from 'swagger-jsdoc'

const app = express()
const PORT = 3000

// Middleware
app.use(cors())
app.use(express.json())

// Swagger configuration
const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Contact Management API',
      version: '1.0.0',
      description: 'A RESTful API for managing contacts',
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: 'Development server',
      },
    ],
  },
  apis: ['./docs.js'], // Path to the API docs
}

const specs = swaggerJSDoc(options)

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs, { explorer: true }))

// Initialize database
const db = new Database('database.db')

// Create contacts table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT,
    address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`)

// Error codes enum
const ERROR_CODES = {
  SUCCESS: 0,
  VALIDATION_ERROR: 1,
  NOT_FOUND: 2,
  DATABASE_ERROR: 3,
  NETWORK_ERROR: -1,
}

// Error messages configuration
const ERROR_MESSAGES = {
  // Validation errors
  REQUIRED_FIELD_MISSING: 'Required field is missing',
  NAME_REQUIRED: 'Name is required',
  PHONE_REQUIRED: 'Phone number is required',
  INVALID_EMAIL_FORMAT: 'Invalid email format',
  INVALID_PHONE_FORMAT: 'Invalid phone number format',
  EMAIL_ALREADY_EXISTS: 'Email already exists in the system',
  INVALID_INPUT: 'Invalid input data provided',

  // Business logic errors
  CONTACT_NOT_FOUND: 'Contact not found',
  CONTACT_LIST_EMPTY: 'No contacts found',
  INVALID_CONTACT_ID: 'Invalid contact ID provided',

  // Success messages
  CONTACT_CREATED: 'Contact created successfully',
  CONTACT_UPDATED: 'Contact updated successfully',
  CONTACT_DELETED: 'Contact deleted successfully',
  CONTACT_RETRIEVED: 'Contact retrieved successfully',
  ALL_CONTACTS_RETRIEVED: 'All contacts retrieved successfully',
  SERVER_HEALTHY: 'Server is running and healthy',

  // Server messages
  SERVER_RUNNING: 'Server is running',
  SUCCESS: 'Operation completed successfully',
  REQUEST_PROCESSED: 'Request processed successfully',

  // Database errors
  DATABASE_OPERATION_FAILED: 'Database operation failed',
  DATABASE_CONNECTION_ERROR: 'Database connection error',
  DATA_RETRIEVAL_FAILED: 'Failed to retrieve data',
  DATA_SAVE_FAILED: 'Failed to save data',
  DATA_UPDATE_FAILED: 'Failed to update data',
  DATA_DELETE_FAILED: 'Failed to delete data',

  // Network and system errors
  INTERNAL_SERVER_ERROR: 'Internal server error occurred',
  SERVICE_UNAVAILABLE: 'Service temporarily unavailable',
  BAD_REQUEST: 'Bad request - please check your input',
}

// Helper function to send standardized response
const sendResponse = (res, code, msg, data = null) => {
  const response = { code, msg }
  if (data !== null) {
    response.data = data
  }
  res.json(response)
}

// Input validation helper
const validateContactInput = (name, phone) => {
  if (!name || !phone) {
    return ERROR_MESSAGES.REQUIRED_FIELD_MISSING
  }
  return null
}

// Routes

// Health check endpoint
app.get('/api/health', (req, res) => {
  // No notification for health check
  sendResponse(res, ERROR_CODES.SUCCESS, null)
})

/**
 * Contact Management APIs
 */

// Get all contacts
app.get('/api/contacts', (req, res) => {
  try {
    const contacts = db.prepare('SELECT * FROM contacts ORDER BY created_at DESC').all()
    logger.info('Contacts retrieved successfully', { count: contacts.length })
    // No notification for query operations - only return data
    sendResponse(res, ERROR_CODES.SUCCESS, null, contacts)
  } catch (error) {
    logger.error('Error fetching contacts', {
      error: error.message,
      stack: error.stack,
    })
    sendResponse(res, ERROR_CODES.DATABASE_ERROR, ERROR_MESSAGES.DATA_RETRIEVAL_FAILED)
  }
})

// Create new contact
app.post('/api/contacts', (req, res) => {
  const { name, phone, email, address } = req.body

  const validationError = validateContactInput(name, phone)
  if (validationError) {
    return sendResponse(res, ERROR_CODES.VALIDATION_ERROR, validationError)
  }

  try {
    const stmt = db.prepare(
      'INSERT INTO contacts (name, phone, email, address) VALUES (?, ?, ?, ?)'
    )
    const result = stmt.run(name, phone, email || null, address || null)
    logger.info('Contact created successfully', {
      id: result.lastInsertRowid,
      name,
      phone,
    })
    sendResponse(res, ERROR_CODES.SUCCESS, ERROR_MESSAGES.CONTACT_CREATED, {
      id: result.lastInsertRowid,
      name,
      phone,
      email: email || null,
      address: address || null,
    })
  } catch (error) {
    logger.error('Error creating contact', {
      error: error.message,
      stack: error.stack,
      contactData: { name, phone, email, address },
    })

    // Check for specific error types
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      sendResponse(res, ERROR_CODES.VALIDATION_ERROR, ERROR_MESSAGES.EMAIL_ALREADY_EXISTS)
    } else {
      sendResponse(res, ERROR_CODES.DATABASE_ERROR, ERROR_MESSAGES.DATA_SAVE_FAILED)
    }
  }
})

// Get single contact by ID
app.get('/api/contacts/:id', (req, res) => {
  try {
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(req.params.id)
    if (contact) {
      logger.info('Contact retrieved successfully', { id: req.params.id })
      // No notification for query operations - only return data
      sendResponse(res, ERROR_CODES.SUCCESS, null, contact)
    } else {
      logger.warn('Contact not found', { id: req.params.id })
      sendResponse(
        res,
        ERROR_CODES.NOT_FOUND,
        `${ERROR_MESSAGES.CONTACT_NOT_FOUND} (ID: ${req.params.id})`
      )
    }
  } catch (error) {
    logger.error('Error fetching contact', {
      error: error.message,
      stack: error.stack,
      id: req.params.id,
    })

    if (isNaN(req.params.id)) {
      sendResponse(res, ERROR_CODES.VALIDATION_ERROR, ERROR_MESSAGES.INVALID_CONTACT_ID)
    } else {
      sendResponse(res, ERROR_CODES.DATABASE_ERROR, ERROR_MESSAGES.DATA_RETRIEVAL_FAILED)
    }
  }
})

// Update contact
app.put('/api/contacts/:id', (req, res) => {
  const { name, phone, email, address } = req.body

  const validationError = validateContactInput(name, phone)
  if (validationError) {
    return sendResponse(res, ERROR_CODES.VALIDATION_ERROR, validationError)
  }

  try {
    const stmt = db.prepare(
      'UPDATE contacts SET name = ?, phone = ?, email = ?, address = ? WHERE id = ?'
    )
    const result = stmt.run(name, phone, email || null, address || null, req.params.id)
    if (result.changes > 0) {
      logger.info('Contact updated successfully', {
        id: req.params.id,
        name,
        phone,
      })
      sendResponse(res, ERROR_CODES.SUCCESS, ERROR_MESSAGES.CONTACT_UPDATED, {
        id: req.params.id,
        name,
        phone,
        email: email || null,
        address: address || null,
      })
    } else {
      logger.warn('Contact not found for update', { id: req.params.id })
      sendResponse(res, ERROR_CODES.NOT_FOUND, ERROR_MESSAGES.CONTACT_NOT_FOUND)
    }
  } catch (error) {
    logger.error('Error updating contact', {
      error: error.message,
      stack: error.stack,
      id: req.params.id,
      contactData: { name, phone, email, address },
    })

    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      sendResponse(res, ERROR_CODES.VALIDATION_ERROR, ERROR_MESSAGES.EMAIL_ALREADY_EXISTS)
    } else {
      sendResponse(res, ERROR_CODES.DATABASE_ERROR, ERROR_MESSAGES.DATA_UPDATE_FAILED)
    }
  }
})

// Delete contact
app.delete('/api/contacts/:id', (req, res) => {
  try {
    const stmt = db.prepare('DELETE FROM contacts WHERE id = ?')
    const result = stmt.run(req.params.id)
    if (result.changes > 0) {
      logger.info('Contact deleted successfully', { id: req.params.id })
      sendResponse(res, ERROR_CODES.SUCCESS, ERROR_MESSAGES.CONTACT_DELETED)
    } else {
      logger.warn('Contact not found for deletion', { id: req.params.id })
      sendResponse(
        res,
        ERROR_CODES.NOT_FOUND,
        `${ERROR_MESSAGES.CONTACT_NOT_FOUND} (ID: ${req.params.id})`
      )
    }
  } catch (error) {
    logger.error('Error deleting contact', {
      error: error.message,
      stack: error.stack,
      id: req.params.id,
    })

    if (isNaN(req.params.id)) {
      sendResponse(res, ERROR_CODES.VALIDATION_ERROR, ERROR_MESSAGES.INVALID_CONTACT_ID)
    } else {
      sendResponse(res, ERROR_CODES.DATABASE_ERROR, ERROR_MESSAGES.DATA_DELETE_FAILED)
    }
  }
})

// Export the app for testing or further use
export default app

// Start server
app.listen(PORT, () => {
  logger.info(`Server is running on http://localhost:${PORT}`, { port: PORT })
})
