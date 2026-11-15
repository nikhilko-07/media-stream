export const sendAdminOtpEmail = async (usermail, otp) => {
  const mailerEndpoint = 'https://node-mailer-ten.vercel.app/sendEmail';

  const subject = `Your Admin Portal Login OTP: ${otp}`;
  const text = `Hello Admin,\n\nYour 6-digit one-time passcode to access the Admin Control Hub is:\n\n${otp}\n\nThis OTP is valid for 10 minutes.\nOnce verified, your login session will remain active for 24 hours.\n\nIf you did not request this OTP, please ignore this email.`;

  const payload = {
    subject,
    text,
    usermail: usermail.trim(),
    username: 'Local Stream Admin Security'
  };

  try {
    const response = await fetch(mailerEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Mailer service error (${response.status}): ${errorText}`);
    }

    const data = await response.json().catch(() => ({}));
    return { success: true, data };
  } catch (err) {
    console.error('[EmailService Error]:', err.message);
    throw err;
  }
};
