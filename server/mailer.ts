import { ServerConfig } from './config.js';

/**
 * Outbound email seam. The platform sends a single transactional message today —
 * the "set your password" link — so the interface is deliberately minimal. The
 * default LoggingMailer writes the message to the server log (and the API can
 * also surface the link in dev), so the flow works end-to-end with no provider
 * configured. A real provider (SMTP / Resend / SES) drops in behind env config.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/** Records the message to stdout; never throws (a failed email must not break provisioning). */
export class LoggingMailer implements Mailer {
  async send(message: EmailMessage): Promise<void> {
    try {
      console.log(`[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
    } catch {
      /* logging must never throw */
    }
  }
}

export function createMailer(config: ServerConfig): Mailer {
  switch (config.emailProvider) {
    case 'smtp':
    case 'resend':
      // Seam for a real provider. Wire credentials in config + an implementation
      // here; until then fall back to logging so the flow stays demoable.
      throw new Error(`Email provider '${config.emailProvider}' is not configured yet.`);
    case 'logging':
    default:
      return new LoggingMailer();
  }
}

export function buildSetPasswordLink(config: ServerConfig, token: string): string {
  const base = config.appPublicUrl.replace(/\/+$/, '');
  return `${base}/set-password?token=${encodeURIComponent(token)}`;
}

/** The body of the set-password invitation, branded for the tenant. */
export function setPasswordEmail(params: {
  to: string;
  displayName: string;
  tenantName: string;
  link: string;
  purpose: 'invite' | 'reset';
}): EmailMessage {
  const action = params.purpose === 'reset' ? 'reset your password' : 'set your password and activate your account';
  const subject =
    params.purpose === 'reset'
      ? 'Reset your Soteria Signum password'
      : `You've been added to ${params.tenantName} on Soteria Signum`;
  const text = [
    `Hello ${params.displayName},`,
    '',
    `You can ${action} for ${params.tenantName} using the secure link below. It can be used once and expires soon:`,
    '',
    params.link,
    '',
    "If you didn't expect this email you can safely ignore it.",
    '',
    '— Soteria Signum (by Trainovate)',
  ].join('\n');
  return { to: params.to, subject, text };
}
