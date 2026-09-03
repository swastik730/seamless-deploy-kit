# BoardBuddy Professional UI and Reliability Pass

## Goal
Make BoardBuddy feel polished and trustworthy on phones, tablets, desktops, and Smart TVs while preserving the existing study flows, Supabase setup, Razorpay integration, and current visual identity.

## What will change

### 1. Welcome and authentication experience
- Redesign the first-open welcome screen as a richer, responsive study-focused experience with clear account benefits, prominent sign-up/sign-in actions, and a polished “Continue without an account” option.
- Redesign sign-in, sign-up, and password recovery into a responsive two-panel desktop/TV layout that remains compact and easy to use on mobile.
- Improve labels, password visibility, focus states, validation feedback, loading states, and keyboard/remote navigation.
- Keep username-only signup and the existing recovery-question flow unchanged.

### 2. Responsive shell and visual consistency
- Improve the app shell for wide desktop and Smart TV screens so content uses space well instead of appearing as a narrow mobile column.
- Increase large-screen readability, target sizes, content width, and spacing while preserving the mobile bottom navigation.
- Standardize cards, headings, action buttons, hover/focus states, and page spacing using the existing semantic theme tokens.
- Preserve both light and dark themes and add reduced-motion-safe transitions.

### 3. Key-page polish and English copy audit
- Polish the highest-traffic surfaces: Home, Learn, Practice, Tests, Exam Hub, More, Profile, and Subscription states.
- Correct remaining visible Hinglish or awkward English, especially payment failure/success messages and account prompts.
- Keep Hindi subject/content text where it is intentionally educational content.
- Complete missing route metadata for content pages touched by this pass.

### 4. Subscription reliability hardening
- Preserve the existing protection that prevents late Razorpay failure events from deactivating an active plan.
- Make entitlement reads retain the last known valid state during temporary network failures instead of incorrectly showing “Expired.”
- Show honest loading/offline states and only show “Expired” when an actual prior subscription has a past expiry date.
- Verify payment success, profile status, and premium-gate views agree on the same entitlement.

### 5. Quality verification
- Run build and targeted checks for onboarding, authentication, subscription status, navigation, and key routes.
- Visually verify mobile (390px), desktop (1280px), and Smart TV (1920×1080) layouts.
- Check keyboard focus, text overflow, horizontal scrolling, dark theme, and browser console/runtime errors.

## Recommended flagship feature
Add a **Personal Revision Coach** next: it should combine weak chapters, recent mistakes, exam date, and available study time into a daily revision queue. This would create a stronger daily habit than simply adding more content. It is a separate future feature and will not be mixed into this UI/reliability pass.

## Technical notes
- Continue using the project’s existing Supabase integration and current Razorpay server flow; no backend provider migration.
- Keep TanStack Start routing and current local/offline study support.
- Use existing semantic design tokens and reusable components; no hardcoded one-off palette.
- No database migration is planned unless verification exposes a concrete schema/RPC defect.
