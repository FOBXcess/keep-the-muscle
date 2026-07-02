# How to build and update Keep the Muscle
## Instructions for Claude Code sessions

---

## Before your first session — accounts to create

You need four accounts with credentials ready before Claude Code starts building. Get these first:

**Supabase** (supabase.com)
- Create a free account and a new project called "keep-the-muscle"
- From Project Settings → API, copy: Project URL, anon/public key, service_role key
- Keep these somewhere safe — you'll paste them into Claude Code when asked

**Stripe** (stripe.com)
- Create a free account
- Go to Products → Add Product → name it "Keep the Muscle", set price to $9.99/month recurring
- Copy the Price ID (starts with `price_`)
- From Developers → API keys, copy the publishable key and secret key
- Stay in test mode until you're ready to go live

**Anthropic** (console.anthropic.com)
- Get your API key from the console
- This is the key the app uses to power the coach — keep it secret

**Vercel** (vercel.com)
- Create a free account
- Connect it to your GitHub account (Claude Code will push the code to GitHub first, then Vercel deploys from there)
- You'll also need a free GitHub account if you don't have one

---

## Starting your first Claude Code session

1. Create a folder on your computer called `keep-the-muscle`
2. Put these two files in it: `CLAUDE.md` and `keep-the-muscle.jsx`
3. Open Terminal, type: `cd keep-the-muscle` and press Enter
4. Type: `claude` and press Enter to start a session
5. Paste this as your first message:

---

*Paste this entire block as your first message:*

```
Read CLAUDE.md and keep-the-muscle.jsx fully before doing anything else.

This is a working fitness coaching React app that needs to be wired into real infrastructure. The product logic is already done — your job is the plumbing only: Next.js scaffold, Supabase auth and database, Stripe subscriptions, Vercel deployment.

Before you write any code, tell me:
1. Confirm you've read and understood both files
2. List every account credential you'll need me to provide
3. Confirm the build order you'll follow (it's in CLAUDE.md)

Don't start building until I confirm I have all the credentials ready.
```

---

## During the build — how to work with Claude Code

**Give it one step at a time.** The build order in CLAUDE.md is:
1. Scaffold Next.js, install dependencies
2. Create Supabase tables and RLS policies
3. Build auth screens
4. Replace store with Supabase
5. Build the API proxy for Anthropic
6. Build Stripe subscription + paywall
7. Deploy to Vercel

After each step, ask it: `Test this step and confirm it works before moving on.`

**When it asks for credentials**, paste them directly into the terminal. Never put credentials in the CLAUDE.md file or commit them to GitHub.

**If something breaks**, paste the exact error message back into Claude Code and say: `Fix this error, don't move on until it's resolved.`

**If it goes off track**, say: `Stop. Re-read CLAUDE.md and tell me what you were supposed to be doing.`

---

## How to update the product after it's built

The product (keep-the-muscle.jsx) and the infrastructure (database, auth, payments) are completely separate. You can update the product anytime without touching the infrastructure.

**Simple updates** (prompt changes, UI tweaks, tile logic, verdict rules):
1. Get the updated `keep-the-muscle.jsx` from your product chat
2. Drop it into the project folder, replacing the old one
3. Open a Claude Code session in that folder and say:

```
keep-the-muscle.jsx has been updated. Compare it to the current version, 
replace it, and check that nothing breaks — specifically that the store 
calls and the API proxy calls still match what the infrastructure expects. 
Don't touch any other files unless something is actually broken.
```

**Updates that add new tracked data** (a new tile that saves something new):
1. Get the updated JSX file
2. Drop it in, then say:

```
keep-the-muscle.jsx has been updated. It now tracks [describe what's new]. 
Check if this requires a new database column. If it does, add it to the 
right Supabase table and update the store wrapper to handle it. 
Show me what you're changing before you do it.
```

**Updates that change the coach prompt or scan prompt only**:
These are entirely inside the JSX — just drop the file in and deploy. No database changes needed.

---

## Deploying an update to the live site

Once the project is set up on Vercel, deploying an update is:

1. Drop the new `keep-the-muscle.jsx` into the project folder
2. Open Claude Code and say: `Update keep-the-muscle.jsx with the new version and deploy`
3. Claude Code will push to GitHub, Vercel picks it up automatically, live in ~2 minutes

---

## What Claude Code should never do

If Claude Code suggests any of these, tell it to stop and re-read CLAUDE.md:

- Rewriting `buildTargets()` or any of the math
- Changing the system prompt or scan prompt
- Adding Tailwind, Material UI, or any CSS framework
- Changing the tile logic (feedLit, trainLit, protectAtRisk)
- Adding TypeScript
- Changing the database schema without telling you first

---

## Useful commands to know

**Start a session:** `claude`
**Check what files changed:** `git diff`
**If Claude Code makes a mess:** `git checkout .` (undoes all uncommitted changes)
**Check the live deployment:** check your Vercel dashboard

---

## When you're ready to take payments for real

1. Go to Stripe dashboard → toggle from Test Mode to Live Mode
2. Re-create the product and price in Live Mode, get the new Price ID
3. In Vercel → your project → Environment Variables, update:
   - `STRIPE_SECRET_KEY` to the live secret key
   - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` to the live publishable key
   - `NEXT_PUBLIC_STRIPE_PRICE_ID` to the live price ID
   - `STRIPE_WEBHOOK_SECRET` to the live webhook secret (re-register the webhook in Stripe live mode)
4. Redeploy from Vercel dashboard

That's the only change needed — no code changes, just environment variables.
