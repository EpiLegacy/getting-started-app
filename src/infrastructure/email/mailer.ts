import nodemailer from 'nodemailer';

const port = Number(process.env.SMTP_PORT || 465);

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Implicit TLS on 465; other ports (587) upgrade with STARTTLS.
    secure: port === 465,
    auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
});

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
    await transporter.sendMail({
        from: '"Todo App" <noreply@todoapp.local>',
        to,
        subject,
        text,
    });
}
