import type { CombriefConfig } from './config';
import { DecisionQueue } from './decision-queue';
import { DecisionService } from './decision-service';
import type { SlackCardLabels } from './i18n/messages';
import { SlackAdapter } from './slack/adapter';
import type { HardwareRuntime } from './hardware/runtime';

export class SlackRuntime {
  private adapter: SlackAdapter | null = null;
  private readonly queue = new DecisionQueue();
  private service: DecisionService | null = null;

  constructor(
    private getConfig: () => CombriefConfig,
    private getCardLabels: () => SlackCardLabels,
    private getHardwareRuntime: () => HardwareRuntime | null = () => null,
  ) {}

  getDecisionService(): DecisionService | null {
    return this.service;
  }

  getStatus(): { connected: boolean; lastError: string | null } {
    return (
      this.adapter?.getStatus() ?? { connected: false, lastError: null }
    );
  }

  async restart(): Promise<void> {
    await this.stop();
    const cfg = this.getConfig();
    const hardware = this.getHardwareRuntime();
    const hardwareDecisionEnabled =
      cfg.hardware.enabled && cfg.hardware.decisionPushEnabled && hardware !== null;
    const slackEnabled =
      cfg.slack.enabled &&
      cfg.slack.botToken.trim() !== '' &&
      cfg.slack.appToken.trim() !== '';

    if (!slackEnabled && !hardwareDecisionEnabled) {
      return;
    }

    const adapter = slackEnabled
      ? new SlackAdapter(cfg.slack, (payload) => {
          return this.service?.handleBlockAction(payload);
        })
      : null;
    const service = new DecisionService(
      this.getConfig,
      adapter,
      this.queue,
      this.getCardLabels,
      hardware,
    );
    this.adapter = adapter;
    this.service = service;
    if (adapter) {
      try {
        await adapter.start();
      } catch {
        /* status on adapter */
      }
    }
  }

  async stop(): Promise<void> {
    this.service?.shutdown('Runtime stopped');
    await this.adapter?.stop();
    this.adapter = null;
    this.service = null;
  }

  async sendTest(): Promise<void> {
    const cfg = this.getConfig();
    if (!cfg.slack.enabled) {
      throw new Error('Enable Slack remote approval in settings first');
    }
    if (!cfg.slack.botToken.trim() || !cfg.slack.appToken.trim()) {
      throw new Error('Bot token (xoxb-) and App token (xapp-) are required');
    }
    if (!cfg.slack.channelId.trim()) {
      throw new Error('Channel ID (C… or G… for private) is required');
    }
    if (!this.service) {
      await this.restart();
    }
    if (!this.service) {
      throw new Error('Could not start Slack connection');
    }
    await this.service.sendTest();
  }
}
