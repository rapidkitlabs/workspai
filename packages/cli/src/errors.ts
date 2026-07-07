/**
 * Custom error classes for rapidkit
 */

export class RapidKitError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: string
  ) {
    super(message);
    this.name = 'RapidKitError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class PythonNotFoundError extends RapidKitError {
  constructor(requiredVersion: string, foundVersion?: string) {
    const message = foundVersion
      ? `Python ${requiredVersion}+ required, found ${foundVersion}`
      : `Python ${requiredVersion}+ not found`;
    super(
      message,
      'PYTHON_NOT_FOUND',
      `Please install Python from https://www.python.org/downloads/`
    );
  }
}

export class PoetryNotFoundError extends RapidKitError {
  constructor() {
    super(
      'Poetry is not installed',
      'POETRY_NOT_FOUND',
      'Install Poetry from https://python-poetry.org/docs/#installation'
    );
  }
}

export class PipxNotFoundError extends RapidKitError {
  constructor() {
    super(
      'pipx is not installed',
      'PIPX_NOT_FOUND',
      'Install pipx from https://pypa.github.io/pipx/installation/'
    );
  }
}

export class DirectoryExistsError extends RapidKitError {
  constructor(dirName: string) {
    super(
      `Directory "${dirName}" already exists`,
      'DIRECTORY_EXISTS',
      'Please choose a different name or remove the existing directory'
    );
  }
}

export class InvalidProjectNameError extends RapidKitError {
  constructor(name: string, reason: string) {
    super(`Invalid project name: "${name}"`, 'INVALID_PROJECT_NAME', reason);
  }
}

export class InstallationError extends RapidKitError {
  constructor(step: string, originalError: Error) {
    const message = `Installation failed at: ${step}`;
    const details = `${originalError.message}\n\nTroubleshooting:\n- Check your internet connection\n- Verify Python/Poetry installation\n- Try running with --debug flag for more details`;
    super(message, 'INSTALLATION_ERROR', details);
  }
}

export class RapidKitNotAvailableError extends RapidKitError {
  constructor() {
    super(
      'RapidKit Python package is not yet available on PyPI',
      'RAPIDKIT_NOT_AVAILABLE',
      'Available options:\n  1. Install Python 3.10+ and retry the same command\n  2. Use the core workflow: npx workspai create workspace <name>\n  3. Offline fallback (limited): npx workspai create project fastapi.standard <name> --output .\n\nLegacy: set RAPIDKIT_SHOW_LEGACY=1 to reveal template-mode flags in help.'
    );
  }
}

export class NetworkError extends RapidKitError {
  constructor(operation: string, originalError?: Error) {
    super(
      `Network error during ${operation}`,
      'NETWORK_ERROR',
      `Failed to complete network operation.\n${originalError?.message || ''}\n\nPlease check:\n- Internet connection\n- Firewall settings\n- Proxy configuration`
    );
  }
}

export class FileSystemError extends RapidKitError {
  constructor(operation: string, path: string, originalError?: Error) {
    super(
      `File system error: ${operation}`,
      'FILESYSTEM_ERROR',
      `Failed to ${operation} at: ${path}\n${originalError?.message || ''}\n\nPlease check:\n- File/directory permissions\n- Available disk space\n- Path validity`
    );
  }
}
