export class AppError extends Error {
  constructor(message, statusCode = 400, code) {
    super(message)
    this.statusCode = statusCode
    this.code = code
    this.isOperational = true
  }
}

export function errorHandler(err, _req, res, _next) {
  let status = err.statusCode || 500
  let message = err.message || 'Internal server error'

  // Zod validation
  if (err?.name === 'ZodError' || Array.isArray(err?.issues)) {
    status = 400
    message =
      err.issues?.map((i) => i.message).filter(Boolean).join('; ') ||
      'Validation failed'
  }

  // Mongoose validation / cast
  if (err?.name === 'ValidationError') {
    status = 400
    message =
      Object.values(err.errors || {})
        .map((e) => e.message)
        .filter(Boolean)
        .join('; ') || 'Validation failed'
  }
  if (err?.name === 'CastError') {
    status = 400
    message = `Invalid ${err.path || 'value'}`
  }

  // Duplicate key
  if (err?.code === 11000) {
    status = 409
    message = 'Already exists'
  }

  // Multer rejects oversized or unexpected uploads with its own error codes.
  // Untranslated they surface as a bare 500, which tells the person holding a
  // 20 MB drawing nothing about why it would not upload.
  if (err?.name === 'MulterError') {
    status = 400
    if (err.code === 'LIMIT_FILE_SIZE') {
      const mb = Math.round((err.limit ?? 0) / (1024 * 1024)) || null
      message = mb
        ? `That file is too large. The limit is ${mb} MB per file.`
        : 'That file is too large.'
    } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      message = 'Unexpected file field in the upload.'
    } else {
      message = err.message || 'Upload failed.'
    }
  }

  // Vercel does not set NODE_ENV for you, so a deploy that forgets it would
  // otherwise serve stack traces — absolute paths and all — to the public.
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.VERCEL === '1'

  // Always log server-side; only the response is trimmed in production.
  console.error(err)

  res.status(status).json({
    success: false,
    message,
    ...(err.code && { code: err.code }),
    ...(!isProduction && { stack: err.stack }),
  })
}

export function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}

