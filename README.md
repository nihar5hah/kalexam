## KalExam Phase 1

KalExam Phase 1 ships a full flow:

- Landing page at `/`
- Upload page at `/upload`
- Strategy report page at `/strategy`
- API route at `/api/generate-strategy`

AI provider architecture is abstracted in `src/lib/ai` with:

- Gemini (default)
- Custom OpenAI-compatible provider (OpenRouter/Kilo Gateway/base URL)

Auth + persistence architecture:

- Firebase Authentication (Google sign in / sign up)
- Firestore per-user strategy storage (`users/{uid}/strategies/{strategyId}`)
- Firebase Storage for uploaded files

## Environment variables

Create a `.env.local` file in `frontend/`:

```bash
# Firebase client SDK (required)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=

# Gemini (required for real AI output)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.1-pro-preview
```

If provider calls fail or are not configured, the API route returns a mock strategy response for Phase 1.

## Firebase console setup (required)

1. Enable **Authentication** → Sign-in method → **Google**.
2. Enable **Firestore Database** (production mode).
3. Enable **Storage**.
4. Add your app domain(s) in Firebase Auth authorized domains.

## Recommended security rules

Firestore rules:

```txt
rules_version = '2';
service cloud.firestore {
	match /databases/{database}/documents {
		match /users/{userId}/strategies/{strategyId} {
			allow read, write: if request.auth != null && request.auth.uid == userId;
		}
	}
}
```

Storage rules:

```txt
rules_version = '2';
service firebase.storage {
	match /b/{bucket}/o {
		match /users/{userId}/{allPaths=**} {
			allow read, write: if request.auth != null && request.auth.uid == userId;
		}
	}
}
```

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
