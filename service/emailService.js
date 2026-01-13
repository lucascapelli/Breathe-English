
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendEmail({ to, subject, html, text }) {
  const msg = {
    to,
    from: process.env.SMTP_FROM.replace(/"/g, ''),
    subject,
    text: text || undefined,
    html,
  };
  return sgMail.send(msg);
}

module.exports = { sendEmail };
