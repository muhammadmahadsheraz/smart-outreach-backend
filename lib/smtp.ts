import nodemailer from "nodemailer";

export function getSmtpConfig() {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();

  if (!host || !user || !pass) {
    return null;
  }

  const parsedPort = Number(process.env.SMTP_PORT ?? 587);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 587;
  
  // Use port 465 as default for secure if not specified
  const secure = process.env.SMTP_SECURE === "true" || (port === 465 && process.env.SMTP_SECURE !== "false");
  
  const from = process.env.SMTP_FROM?.trim() || user;

  return { host, port, secure, user, pass, from };
}

export async function getTransporter() {
  const config = getSmtpConfig();
  if (!config) return null;

  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: {
      user: config.user,
      pass: config.pass,
    },
  });
}
