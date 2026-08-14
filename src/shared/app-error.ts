export interface AppErrorOptions {
  statusCode?: number;
  code?: string;
  expose?: boolean;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly expose: boolean;

  constructor(message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? 'APP_ERROR';
    this.expose = options.expose ?? this.statusCode < 500;
  }
}

export class InvalidFilePathError extends AppError {
  constructor(message: string) {
    super(message, {
      statusCode: 400,
      code: 'INVALID_FILE_PATH',
      expose: true,
    });
    this.name = 'InvalidFilePathError';
  }
}
