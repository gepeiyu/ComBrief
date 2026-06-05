import type { CombriefConfig } from './config';
import { DecisionQueue } from './decision-queue';
import { DecisionService } from './decision-service';
import type { SlackCardLabels } from './i18n/messages';
import { SlackAdapter } from './slack/adapter';

export class SlackRuntime {
  private adapter: SlackAdapter | null = null;
  private readonly queue = new DecisionQueue();
  private service: DecisionService | null = null;

  constructor(
    private getConfig: () => CombriefConfig,
    private getCardLabels: () => SlackCardLabels,
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
    if (
      !cfg.slack.enabled ||
      !cfg.slack.botToken.trim() ||
      !cfg.slack.appToken.trim()
    ) {
      return;
    }
    const adapter = new SlackAdapter(cfg.slack, (payload) => {
      return this.service?.handleBlockAction(payload);
    });
    const service = new DecisionService(
      this.getConfig,
      adapter,
      this.queue,
      this.getCardLabels,
    );
    this.adapter = adapter;
    this.service = service;
    try {
      await adapter.start();
    } catch {
      /* status on adapter */
    }
  }

  async stop(): Promise<void> {
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
