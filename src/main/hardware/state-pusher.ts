export class HardwareStatePusher {
  private sending = false;
  private dirty = false;

  constructor(
    private readonly sendSnapshot: () => Promise<void>,
    private readonly onError: (error: unknown) => void,
  ) {}

  request(): void {
    this.dirty = true;
    if (this.sending) return;
    void this.drain();
  }

  private async drain(): Promise<void> {
    if (this.sending) return;
    this.sending = true;

    try {
      while (this.dirty) {
        this.dirty = false;
        try {
          await this.sendSnapshot();
        } catch (error) {
          this.onError(error);
        }
      }
    } finally {
      this.sending = false;
      if (this.dirty) {
        void this.drain();
      }
    }
  }
}
