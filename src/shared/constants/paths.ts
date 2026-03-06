export const APP_NAME = 'tmaster';
export const DATABASE_FILENAME = 'tmaster.db';

interface ResolveDatabasePathOptions {
  dbPath?: string;
  userDataPath?: string;
  platform?: string;
  homeDir?: string;
  pathSeparator?: string;
}

const normalizeSegment = (segment: string): string => {
  return segment.replace(/^[\\/]+|[\\/]+$/g, '');
};

const trimTrailingSeparators = (value: string): string => {
  return value.replace(/[\\/]+$/g, '');
};

const joinWithSeparator = (separator: string, ...segments: string[]): string => {
  const normalized = segments
    .filter((segment) => segment.length > 0)
    .map((segment, index) => {
      if (index === 0) {
        return trimTrailingSeparators(segment);
      }

      return normalizeSegment(segment);
    });

  return normalized.join(separator);
};

export const getDefaultUserDataPath = (
  platform: string,
  homeDir: string,
  pathSeparator: string = '/',
): string => {
  if (platform === 'darwin') {
    return joinWithSeparator(pathSeparator, homeDir, 'Library', 'Application Support', APP_NAME);
  }

  if (platform === 'win32') {
    return joinWithSeparator(pathSeparator, homeDir, 'AppData', 'Roaming', APP_NAME);
  }

  return joinWithSeparator(pathSeparator, homeDir, '.config', APP_NAME);
};

export const resolveDatabasePath = ({
  dbPath,
  userDataPath,
  platform,
  homeDir,
  pathSeparator,
}: ResolveDatabasePathOptions = {}): string => {
  if (dbPath) {
    return dbPath;
  }

  const separator = pathSeparator ?? '/';
  const resolvedUserDataPath = userDataPath
    ?? getDefaultUserDataPath(platform ?? 'linux', homeDir ?? '', separator);
  return joinWithSeparator(separator, resolvedUserDataPath, DATABASE_FILENAME);
};
