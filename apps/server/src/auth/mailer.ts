/** E-mail delivery seam. Swap ConsoleMailer for SES/SendGrid/Postmark before launch. */
export interface Mailer {
  sendLoginCode(email: string, code: string): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  async sendLoginCode(email: string, code: string) {
    console.info(`[mailer] login code for ${email}: ${code}`);
  }
}
