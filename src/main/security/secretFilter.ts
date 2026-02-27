export type RedactionMode = 'replace' | 'hash' | 'remove';

export interface SecretFilterConfig {
  redactionMode: RedactionMode;
  customPatterns: RegExp[];
}

export class SecretFilter {
  public constructor(private readonly config: SecretFilterConfig) {}

  public redact(output: string): string {
    // MVP: Stub. In Phase 2/3 werden hier konkrete Pattern angewendet.
    if (this.config.redactionMode === 'remove') {
      return output;
    }

    return output;
  }
}
