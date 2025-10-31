import winston from 'winston'

// Define log levels and colors
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
}

const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
}

winston.addColors(colors)

// Define log format
const format = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss:ms' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`)
)

// Define which transports the logger must use
const transports = [
  // Console transport
  new winston.transports.Console({
    format,
  }),
  // File transport for errors
  new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  }),
  // File transport for all logs
  new winston.transports.File({
    filename: 'logs/all.log',
    format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  }),
]

// Create logs directory if it doesn't exist
import { existsSync, mkdirSync } from 'fs'
if (!existsSync('logs')) {
  mkdirSync('logs', { recursive: true })
}

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'warn' : 'debug'),
  levels,
  format,
  transports,
  exitOnError: false,
})

// Create a stream object with a 'write' function that will be used by `morgan`
logger.stream = {
  write: message => {
    logger.info(message.trim())
  },
}

export default logger
