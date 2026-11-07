// Email providers the Email screen can fill in by itself, with the steps a
// non-technical owner follows on the provider's side. Shared by the admin
// screen (client) and the server, so nothing secret lives here.

export type MailSecurity = "ssl" | "starttls" | "none";

export interface MailPreset {
  id: string;
  label: string;
  /** One line under the name in the picker. */
  blurb: string;
  /** The outgoing server, given the site's own domain (for "your hosting email"). */
  host: (domain: string) => string;
  port: number;
  security: MailSecurity;
  /** What to type as the username, when it is not simply the email address. */
  usernameHint?: string;
  /** What goes in the password box — often NOT the normal password. */
  passwordHint: string;
  /** The steps on the provider's side, in order. */
  steps: string[];
  /** Said once, near the top, when it matters. */
  note?: string;
}

export const MAIL_PRESETS: MailPreset[] = [
  {
    id: "hosting",
    label: "My hosting email (cPanel)",
    blurb: "Free with your hosting. Best choice for most sites.",
    host: (domain) => (domain ? `mail.${domain}` : ""),
    port: 465,
    security: "ssl",
    passwordHint: "The password you gave this email account in cPanel.",
    steps: [
      "Log in to your hosting control panel (cPanel).",
      "Open Email → Email Accounts, then press Create.",
      "Make an address such as noreply@yourdomain (the part after @ must be your website's domain). Give it a strong password and press Create.",
      "Come back here: choose \"My hosting email\", type that address and its password below, and press Save and send a test email.",
      "If the test says the server cannot be reached: in cPanel, press Connect Devices next to that email account. Copy the \"Outgoing Server\" name into the Server box below, set the port to 465, and try again.",
    ],
  },
  {
    id: "gmail",
    label: "Gmail",
    blurb: "A Gmail or Google Workspace address. Up to about 500 emails a day.",
    host: () => "smtp.gmail.com",
    port: 465,
    security: "ssl",
    passwordHint: "A 16-letter App Password from Google — NOT your normal Gmail password.",
    steps: [
      "Open myaccount.google.com and sign in with the Gmail address the site should send from.",
      "Go to Security and turn on 2-Step Verification (Google requires it for the next step).",
      "In the search box at the top, type \"App passwords\" and open it.",
      "Type a name such as \"Website\" and press Create. Google shows 16 letters.",
      "Copy those 16 letters. Come back here, choose Gmail, type your Gmail address, and paste the 16 letters as the password.",
      "Press Save and send a test email.",
    ],
    note: "Emails are sent from the Gmail address itself. To send from your own domain, use \"My hosting email\" instead.",
  },
  {
    id: "zoho",
    label: "Zoho Mail",
    blurb: "A Zoho Mail address (free plan available).",
    host: () => "smtp.zoho.com",
    port: 465,
    security: "ssl",
    passwordHint: "An App Password from Zoho (if two-factor sign-in is on), otherwise your Zoho password.",
    steps: [
      "Sign in to mail.zoho.com.",
      "Open Settings → Mail Accounts → SMTP and make sure SMTP access is allowed.",
      "If you use two-factor sign-in: open accounts.zoho.com → Security → App Passwords → Generate, name it \"Website\", and copy it.",
      "Come back here, choose Zoho Mail, type your Zoho address and the password (or App Password).",
      "If your Zoho account is in the EU, change the Server below to smtp.zoho.eu. Then press Save and send a test email.",
    ],
  },
  {
    id: "brevo",
    label: "Brevo (free sending service)",
    blurb: "Free for 300 emails a day. Good when the host blocks email.",
    host: () => "smtp-relay.brevo.com",
    port: 587,
    security: "starttls",
    usernameHint: "Your Brevo SMTP login (shown on Brevo's SMTP page — it may differ from your email).",
    passwordHint: "An SMTP key from Brevo — not your Brevo account password.",
    steps: [
      "Create a free account at brevo.com.",
      "Open Settings (top right) → SMTP & API → the SMTP tab.",
      "Press Generate a new SMTP key, name it \"Website\", and copy the key.",
      "On the same page, note the Login shown there.",
      "In Brevo, open Senders & IP → Senders and add (and confirm) the email address the site should send from.",
      "Come back here, choose Brevo: the sender address in \"Send from\", the Login in Username, and the key as the password. Press Save and send a test email.",
    ],
  },
  {
    id: "microsoft",
    label: "Microsoft 365 (business)",
    blurb: "A work address on Microsoft 365. Personal Outlook.com accounts cannot be used.",
    host: () => "smtp.office365.com",
    port: 587,
    security: "starttls",
    passwordHint: "The mailbox password (or an app password if your organisation requires one).",
    steps: [
      "Ask whoever manages your Microsoft 365 to turn on \"Authenticated SMTP\" for the mailbox (Microsoft 365 admin center → Users → the user → Mail → Manage email apps).",
      "Come back here, choose Microsoft 365, and type the address and its password.",
      "Press Save and send a test email.",
    ],
    note: "Microsoft has switched this off for personal Outlook.com and Hotmail addresses — choose another provider for those.",
  },
  {
    id: "custom",
    label: "Other provider",
    blurb: "Any email service that gives you SMTP settings.",
    host: () => "",
    port: 587,
    security: "starttls",
    passwordHint: "The SMTP password your provider gave you.",
    steps: [
      "In your email provider's help pages, search for \"SMTP settings\".",
      "Copy the server name, the port (usually 465 or 587), and whether it uses SSL or STARTTLS into the boxes below.",
      "Type the email address and password, then press Save and send a test email.",
    ],
  },
];

export function mailPreset(id: string | undefined): MailPreset {
  return MAIL_PRESETS.find((p) => p.id === id) ?? MAIL_PRESETS[0];
}
