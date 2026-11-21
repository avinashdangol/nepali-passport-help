# Nepali Passport Help Desk — Setup guide

A free website for Nepalis living in Poland: passport renewal information, a chat that answers common questions automatically, and an inbox where your agents reply to the rest.

- **Customers** don't need any account. They open the website and chat.
- **Agents** log in with email + password.
- **Cost:** free (GitHub Pages + Firebase free "Spark" plan).

Time needed: about 30–45 minutes, once.

---

## What's in this folder

| File | What it is |
|---|---|
| `index.html` | The website (home page, chat, agent inbox) |
| `app.js` | How the chat and inbox work |
| `data.js` | Automatic answers and contact persons (edit to update info) |
| `firebase-config.js` | Where you paste your Firebase keys (step 2) |
| `firestore.rules` | Security rules (step 4) |
| `logo.svg` | Logo |

Until you finish step 2, the website runs in **DEMO MODE** (yellow bar at the top; nothing is saved). That's normal.

---

## Step 1 — Create a Firebase project

1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. Click **Create a project** (or **Add project**). Name it e.g. `nepali-passport-help`.
3. Google Analytics: you can turn it **off**. Click **Create project**.

## Step 2 — Add a web app and copy the config

1. On the project home page, click the **Web** icon `</>` ("Add app").
2. App nickname: `website`. Don't tick Firebase Hosting. Click **Register app**.
3. You'll see code with `const firebaseConfig = { apiKey: ..., authDomain: ..., ... }`.
4. Open `firebase-config.js` and replace `export const firebaseConfig = null;` with:

```js
export const firebaseConfig = {
  apiKey: "....",
  authDomain: "....",
  projectId: "....",
  storageBucket: "....",
  messagingSenderId: "....",
  appId: "...."
};
```
(copy your own values). These keys are not secret: the security rules in step 4 protect the data.

## Step 3 — Turn on login

1. Left menu: **Build → Authentication → Get started**.
2. Tab **Sign-in method**:
   - Enable **Anonymous** (this lets customers chat without an account) → Save.
   - Enable **Email/Password** (for agents) → Save.
3. Tab **Settings → Authorized domains** → **Add domain** → `avinashdangol.github.io` (or your own domain later).

## Step 4 — Create the database and add the security rules

1. Left menu: **Build → Firestore Database → Create database**.
2. Location: choose a **Europe** location (e.g. `eur3` or `europe-central2` Warsaw). This can't be changed later.
3. Start in **production mode** → Create.
4. Open the **Rules** tab, delete everything there, paste the whole content of `firestore.rules`, click **Publish**.

## Step 5 — Add your 5 agents

For each agent:
1. **Authentication → Users → Add user** → their email + a password → Add user.
2. Copy their **User UID** (long code in the users list).
3. **Firestore Database → Data → Start collection** (first time) → Collection ID: `agents`.
   - **Document ID:** paste the User UID
   - Field: `name` · type **string** · value: their first name, e.g. `Rita`
   - Save.
4. For the next agents, open the `agents` collection → **Add document** → same as above.

Only people in the `agents` collection can open the inbox. To remove an agent, delete their document (and their user).

## Step 6 — Put the website on GitHub Pages

1. Go to **https://github.com/new** → Repository name: `nepali-passport-help` → **Public** → Create.
2. Click **uploading an existing file** → drag in all the files from this folder → **Commit changes**.
3. Repository **Settings → Pages** → Source: **Deploy from a branch** → Branch: `main` / `(root)` → Save.
4. After 1–2 minutes your website is live at:
   **https://avinashdangol.github.io/nepali-passport-help/**

## Step 7 — Test

1. Open the website on your phone → **Ask a question** → type `passport fee kati ho` → you should get the fees.
2. Type something it can't answer (e.g. `my passport has the wrong date of birth`) → fill the short form → **Send to team**.
3. On your computer open **…/nepali-passport-help/#agent** → log in as an agent → the case is in the **Workbasket** → **Take this case** → reply → **Mark resolved**.
4. On your phone you'll see the reply and the **Was your problem solved?** buttons.

---

## Daily use for agents

- Inbox link: `https://avinashdangol.github.io/nepali-passport-help/#agent` (bookmark it).
- **Workbasket**: all open cases; unassigned ones are on top. The browser tab shows the number waiting, e.g. `(2) Agent inbox`.
- **Take this case** → only you can reply. Others see "Handled by …".
- **Release case** gives it back; **Take over** (click twice) if a colleague is away.
- **Mark resolved** → the customer is asked "Was your problem solved?". If they start a new question, they get a new case number.
- Tick **"Also save this as an automatic answer"** to teach the help desk your reply.
- **Automatic answers** (bottom of the inbox): add, edit or delete answers. Add many keywords — English, Nepali and romanized (e.g. `fee kati paisa दस्तुर`).

## When the embassy announces the new camp date

Update these:
1. `index.html` → the yellow box at the top of the home page (search for `alert`) and the steps.
2. **Automatic answers** → edit "Passport camp date?" (or edit `a1-camp` in `data.js`).
Then upload the changed files to GitHub again (they replace the old ones).

## Good to know

- **Privacy:** customers type their name, city and phone/email when they need a person. Only agents can see it. Delete old chats from **Firestore → chats** from time to time (e.g. after each camp).
- Customers' chats are linked to their browser. If they change phone or clear the browser, they start fresh.
- The site says clearly that it is a volunteer community help desk, **not** an official embassy website. Keep it that way.
- Free plan limits are far above what a community help desk uses. If you ever see errors about quota, check **Usage** in the Firebase console.
