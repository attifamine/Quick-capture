# Quick Capture: setup guide (about 20 minutes, one time)

Quick Capture saves a note to **Google Tasks** and creates a **Google Calendar** event at the time you choose, so your phone alerts you. Everything stays in your own Google account. There is no server and no database of mine.

You need two things: (A) a Google sign-in key for the app, (B) a place to host the files for free.

---

## A. Get your Google Client ID

1. On your computer, open https://console.cloud.google.com and sign in with the Google account you use for Calendar.
2. Create a new project (top bar, "New project"), name it `Quick Capture`.
3. Menu, **APIs & Services, Library**. Search and **Enable** both:
   - **Google Tasks API**
   - **Google Calendar API**
4. Menu, **APIs & Services, OAuth consent screen** (may be called "Google Auth Platform"):
   - User type: **External**. App name: `Quick Capture`. Your email for support and contact.
   - Add the scopes: `.../auth/tasks` and `.../auth/calendar.events`
   - **Test users:** add your own Gmail address. Leave the app in **Testing** mode. You never need to publish it.
5. **Credentials, Create credentials, OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins:** your hosting address from part B, with no path at the end, for example `https://yourname.github.io`
   - Create, then copy the **Client ID** (it ends with `.apps.googleusercontent.com`).
6. Open `config.js` and paste the Client ID between the quotes.

When you first sign in, Google shows "Google hasn't verified this app". That is normal because the app is yours and in Testing mode. Tap **Continue**.

## B. Host the files for free (pick one)

**GitHub Pages**
1. Create a free account at github.com, then a new **public** repository (for example `quick-capture`).
2. Upload all the files in this folder.
3. Repository **Settings, Pages**, branch `main`, folder `/ (root)`, Save.
4. Your address will be `https://YOURNAME.github.io/quick-capture/`. The origin to give Google is `https://YOURNAME.github.io`.

**Cloudflare Pages** (alternative): create a free account, Workers & Pages, Create, Pages, **Upload assets**, drag the folder. The address ends in `.pages.dev`.

The repository is public, so never put anything private in it. Only the Client ID goes in `config.js`, and that is not a secret.

## C. Install on your Android phone

1. Open your address in **Chrome**.
2. Menu (three dots), **Install app** (or **Add to Home screen**).
3. Open it from the home screen icon. Tap **Sign in**, choose your account, allow.

## D. How to use it

- **Capture:** type or tap 🎤 Speak, then tap a time button. Done in about 5 seconds.
- **From WhatsApp:** long-press a message, **Share**, choose **Capture**, pick a time. (If Capture is not in the Share list, open the app once from the home screen first.)
- **Review:** the 🌙 tab lists everything still open. **Done**, **Move** or **Delete**.
- **Nightly reminder:** in the Review tab, set the time (22:00 by default) and tap **Set every night**. You do this once.

## Safety notes

- The app talks only to Google. No ads, no analytics, no other websites.
- It asks only for Tasks and Calendar events. It cannot read Gmail, Drive, contacts, WhatsApp or your files.
- The sign-in token is kept in memory only. **Sign out** revokes it.
- You can remove access any time at https://myaccount.google.com/permissions
- Turn on 2-step verification on your Google account. That protects you far more than anything in the app.
- The 🎤 button uses Chrome's speech service, which sends the audio to Google to turn it into text. Use your keyboard's microphone if you prefer.

## Good to know

- Google Tasks keeps only the **date** of a task, not the time. That is why each item also creates a Calendar event: the event gives the exact-time alert. In Calendar you may see both the task and the 📌 event for the same day.
- Because the app is in Testing mode, Google may ask you to sign in again about once a week. That is a Google rule for unverified apps.
