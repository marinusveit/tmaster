import { describe, expect, it } from 'vitest';
import { SecretFilter } from '@main/security/secretFilter';

describe('SecretFilter', () => {
  it('redaktiert API Keys im replace-Modus', () => {
    const filter = new SecretFilter({ redactionMode: 'replace', customPatterns: [] });
    const output = 'OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz123456';
    const redacted = filter.redact(output);

    expect(redacted).not.toContain('sk-abcdefghijklmnopqrstuvwxyz123456');
    expect(redacted).toContain('[REDACTED]');
  });

  it('redaktiert JWT Tokens', () => {
    const filter = new SecretFilter({ redactionMode: 'replace', customPatterns: [] });
    const jwt =
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6Ik1hcmludXMiLCJpYXQiOjE1MTYyMzkwMjJ9.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const redacted = filter.redact(`token=${jwt}`);

    expect(redacted).not.toContain(jwt);
    expect(redacted).toContain('[REDACTED]');
  });

  it('redaktiert Private-Key Blöcke', () => {
    const filter = new SecretFilter({ redactionMode: 'replace', customPatterns: [] });
    const privateKey = [
      '-----BEGIN PRIVATE KEY-----',
      'MIIEvQIBADANBgkqhkiG9w0BAQEFAASC',
      '-----END PRIVATE KEY-----',
    ].join('\n');
    const redacted = filter.redact(privateKey);

    expect(redacted).not.toContain('BEGIN PRIVATE KEY');
    expect(redacted).toContain('[REDACTED]');
  });

  it('redaktiert Connection-Strings mit Credentials', () => {
    const filter = new SecretFilter({ redactionMode: 'replace', customPatterns: [] });
    const connectionString = 'postgres://admin:supersecret@db.example.com:5432/app';
    const redacted = filter.redact(`DATABASE_URL=${connectionString}`);

    expect(redacted).not.toContain(connectionString);
    expect(redacted).toContain('[REDACTED]');
  });

  it('entfernt Secrets vollständig im remove-Modus', () => {
    const filter = new SecretFilter({ redactionMode: 'remove', customPatterns: [] });
    const output = 'token=topsecretvalue';
    const redacted = filter.redact(output);

    expect(redacted).toBe('');
  });

  it('hasht Secrets deterministisch im hash-Modus', () => {
    const filter = new SecretFilter({ redactionMode: 'hash', customPatterns: [] });
    const output = 'password=my-secret-value';
    const redacted = filter.redact(output);

    expect(redacted).toMatch(/^\[REDACTED\]:[a-f0-9]{12}$/);
    expect(redacted).not.toContain('my-secret-value');
  });

  it('wendet Custom Patterns an', () => {
    const filter = new SecretFilter({
      redactionMode: 'replace',
      customPatterns: [/INTERNAL_SECRET_[A-Z0-9]+/],
    });
    const output = 'value=INTERNAL_SECRET_ABC123';
    const redacted = filter.redact(output);

    expect(redacted).toBe('value=[REDACTED]');
  });
});
