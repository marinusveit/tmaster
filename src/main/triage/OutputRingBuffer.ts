export class OutputRingBuffer {
  private readonly buffers: Map<string, string[]> = new Map();
  private readonly partialLines: Map<string, string> = new Map();
  private readonly maxLines = 150;

  public append(terminalId: string, data: string): void {
    const existingPartial = this.partialLines.get(terminalId) ?? '';
    const mergedData = `${existingPartial}${data}`;
    const splitLines = mergedData.split(/\r\n|\n|\r/);
    const trailingPartial = splitLines.pop() ?? '';

    const lines = splitLines
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    if (trailingPartial.length > 0) {
      this.partialLines.set(terminalId, trailingPartial);
    } else {
      this.partialLines.delete(terminalId);
    }

    if (lines.length === 0) {
      return;
    }

    const buffer = this.buffers.get(terminalId) ?? [];
    buffer.push(...lines);

    if (buffer.length > this.maxLines) {
      buffer.splice(0, buffer.length - this.maxLines);
    }

    this.buffers.set(terminalId, buffer);
  }

  public getRecent(terminalId: string, lines?: number): string {
    const buffer = this.buffers.get(terminalId);
    if (!buffer || buffer.length === 0) {
      return '';
    }

    if (lines === undefined) {
      return buffer.join('\n');
    }

    if (lines <= 0) {
      return '';
    }

    return buffer.slice(-lines).join('\n');
  }

  public remove(terminalId: string): void {
    this.buffers.delete(terminalId);
    this.partialLines.delete(terminalId);
  }

  public clear(): void {
    this.buffers.clear();
    this.partialLines.clear();
  }
}
