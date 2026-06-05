import { SocketModeClient } from '@slack/socket-mode';
import { WebClient } from '@slack/web-api';
import type { SlackConfig } from '../config';
import { buildTestBlocks, parseBlockActionValue } from './blocks';

export interface BlockActionPayload {
  userId: string;
  value: string;
  channelId: string;
  messageTs: string;
}

export interface SlackAdapterStatus {
  connected: boolean;
  lastError: string | null;
}

export class SlackAdapter {
  private socket: SocketModeClient | null = null;
  private web: WebClient | null = null;
  private connected = false;
  private lastError: string | null = null;

  constructor(
    private config: SlackConfig,
    private onBlockAction: (payload: BlockActionPayload) => void | Promise<void>,
  ) {}

  getStatus(): SlackAdapterStatus {
    return { connected: this.connected, lastError: this.lastError };
  }

  async start(): Promise<void> {
    await this.stop();
    if (!this.config.botToken || !this.config.appToken) {
      this.lastError = 'Missing bot or app token';
      return;
    }
    this.web = new WebClient(this.config.botToken);
    this.socket = new SocketModeClient({ appToken: this.config.appToken });

    this.socket.on('connected', () => {
      this.connected = true;
      this.lastError = null;
    });
    this.socket.on('disconnect', () => {
      this.connected = false;
    });
    this.socket.on('error', (err) => {
      this.lastError = err instanceof Error ? err.message : String(err);
      this.connected = false;
    });

    this.socket.on('interactive', async ({ ack, body }) => {
      await ack();
      try {
        const actions = body.actions ?? [];
        const userId = body.user?.id ?? '';
        for (const action of actions) {
          if (!action.value) continue;
          const parsed = parseBlockActionValue(action.value);
          if (!parsed) continue;
          if (
            this.config.allowedUserIds.length > 0 &&
            !this.config.allowedUserIds.includes(userId)
          ) {
            continue;
          }
          const channelId = body.channel?.id ?? '';
          const messageTs = body.message?.ts ?? '';
          if (!channelId || !messageTs) continue;
          await this.onBlockAction({
            userId,
            value: action.value,
            channelId,
            messageTs,
          });
        }
      } catch (err) {
        this.lastError = err instanceof Error ? err.message : String(err);
      }
    });

    await this.socket.start();
  }

  async stop(): Promise<void> {
    if (this.socket) {
      await this.socket.disconnect();
      this.socket = null;
    }
    this.web = null;
    this.connected = false;
  }

  async postDecisionMessage(args: {
    text: string;
    blocks: unknown[];
  }): Promise<string> {
    if (!this.web || !this.config.channelId) {
      throw new Error('Slack not configured');
    }
    const result = await this.web.chat.postMessage({
      channel: this.config.channelId,
      text: args.text,
      blocks: args.blocks as never,
    });
    if (!result.ts) {
      throw new Error('Slack postMessage returned no ts');
    }
    return result.ts;
  }

  async updateDecisionMessage(args: {
    channelId: string;
    ts: string;
    text: string;
    blocks: unknown[];
  }): Promise<void> {
    if (!this.web) {
      throw new Error('Slack not configured');
    }
    await this.web.chat.update({
      channel: args.channelId,
      ts: args.ts,
      text: args.text,
      blocks: args.blocks as never,
    });
  }

  async postTestMessage(text: string, timeFooter: string): Promise<void> {
    if (!this.web || !this.config.channelId) {
      throw new Error('Slack not configured');
    }
    await this.web.chat.postMessage({
      channel: this.config.channelId,
      text,
      blocks: buildTestBlocks(text, timeFooter) as never,
    });
  }
}
