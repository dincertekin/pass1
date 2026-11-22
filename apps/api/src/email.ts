// Sending email. Routes get a SendEmail function through AppDeps, so tests pass a fake outbox.
// Emails are plain text: no HTML means nothing in them can be made to run or track.

import nodemailer from "nodemailer";
import type { FastifyBaseLogger } from "fastify";
import type { Config } from "./config.js";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export type SendEmail = (message: EmailMessage) => Promise<void>;

/**
 * Makes the app's email sender from the config.
 * Input: config and a logger. Output: a function that sends one email, or throws if it couldn't.
 * Without SMTP_URL (development only; config.ts requires it in production) the email is
 * printed in the server log, so sign-up links work with no setup.
 */
export function createEmailSender(config: Config, log: FastifyBaseLogger): SendEmail {
  if (!config.SMTP_URL) {
    return async (message) => {
      log.info({ email: message }, "email not sent (no SMTP_URL); here it is instead");
    };
  }

  const transport = nodemailer.createTransport(config.SMTP_URL);
  return async (message) => {
    await transport.sendMail({ from: config.EMAIL_FROM, ...message });
  };
}
