# Guidelines to design a web application: The Spanish Suite

**Version:** 1.0
**Last Updated:** 2026

## 1. Specification-Driven Development Workflow
**CRITICAL RULE FOR AI ASSISTANTS:** 
Before writing code or assuming the implementation details for *any* new feature, the AI must explicitly ask the user for their desired specifications, requirements, and edge cases. 

The workflow is strictly:

1. Ask for feature specifications.
2. Draft the updates to this SDD (Data models, API endpoints, logic).
3. Explicitly list and **number any assumptions** made during the drafting phase.
4. Ask the user to review the numbered assumptions and indicate which ones need modification by referencing their numbers.
5. Get user approval on the SDD updates and assumptions.
6. Write the code based *only* on the agreed-upon SDD.
7. Don't give me the files on the chat, use the diff or ask me to open the files needed first before you create files that I have to manually edit or combine with existing ones.
8. Let's work on one file at the time.
8. If creating a new feature/component/page that will change the UI always ask if I need to see a mockup on ASCII before writing any html/CSS and then create the mockup.

## 2. Overview
This document outlines the software architecture and design for "The Spanish Suite", an interactive web application designed to help users learn and practice Spanish. The application provides reading exercises, and spaced-repetition (SRS) flashcards and AI-driven conversation practice.

## 3. Goals and Non-Goals
### Goals
*   To provide users with a safe and effective environment to practice Spanish conversation via AI.
*   To help users build vocabulary through reading and SRS flashcards.
*   To offer both a free, limited-access tier and a premium, unlimited-access tier.
*   To maintain a secure, validated, and scalable backend that protects user data and prevents API abuse.

### Non-Goals
*   To become a full-fledged social network. User interaction will be limited to AI conversations.
*   To provide live video tutoring. The focus is on AI-based practice.
*   To teach languages other than Spanish in the initial version.

## 4. System Architecture
The application follows a client-server model using the Firebase ecosystem.

*   **Frontend:** A React single-page application (SPA) built with Vite.
    *   **Hosting:** Deployed on Firebase Hosting.
*   **Backend:** Serverless functions handling business logic and external API communication.
    *   **Platform:** Firebase Cloud Functions (Node.js).
*   **Database:** A NoSQL database for storing all application data.
    *   **Service:** Google Firestore.
*   **Authentication:** Firebase Authentication for user sign-up, sign-in, and session management.
*   **External APIs:**
    *   **Google Gemini API:** Powers all AI conversation features.
    *   **GNews API:** Fetches articles for the reading practice library.

## 5. Data Models (Firestore Schema)

### `users` collection
Stores public information and application-specific data for each user. Document ID is the user's `uid` from Firebase Auth.
```json
{
  "uid": "auth_user_id_abc123",
  "email": "user@example.com",
  "isAdmin": false,
  "hasActiveSubscription": true,
  "listeningPreference": "female",
  "timezone": "America/New_York",
  "totalXp": 250,
  "dailyXp": 15,
  "lastXpDate": "2026-05-16",
}
```
*(Note: also contains subcollections like `savedWords` for SRS data and `daily_limits` for usage tracking).*

### `scenarios` collection
Stores the definitions for AI role-playing conversations.
```json
{
  "id": "scenario_id_1",
  "name": "Ordering Coffee",
  "isFree": true,
  "rolePlays": [
    {
      "name": "Barista",
      "role": "You are the barista.",
      "context": "The user is a customer at your coffee shop.",
      "objectives": ["Greet the user", "Take their order", "Tell them the price"]
    }
  ]
}
```

### `articles` collection
Stores reading materials for the library.
```json
{
  "id": "article_id_1",
  "title": "La Historia de Madrid",
  "topic": "History",
  "level": "B1",
  "premium": false,
  "content": "Madrid es la capital de España...",
  "sentences": [
    { "spanish": "Madrid es la capital de España.", "english": "Madrid is the capital of Spain." }
  ]
}
```

## 6. API Endpoints (Cloud Functions)

### `chatWithGemini` / `chatForLesson`
*   **Purpose:** Handles a single turn in an AI conversation, either in a free-play scenario or after a reading lesson.
*   **Authentication:** Required.
*   **Inputs (`data`):**
    *   `history` (array, required): The conversation history so far.
    *   `personaId` / `articleId` (string, required): Lookups for the scenario/lesson context.
    *   `rolePlayName` (string, required for scenarios).
    *   `targetVocabulary` (array of strings, optional for lessons).
*   **Validation:** All inputs are strictly checked for type and maximum lengths. Frontend payloads are never implicitly trusted.

### `manualFetchNews`
*   **Purpose:** Allows an admin to manually trigger the fetching of a new article from the GNews API, translate it, and save it.
*   **Authentication:** Required. User must be an admin.
*   **Validation:** Encodes topics to prevent URL injection.

### `srs` (Add/Toggle/Update/Reset Progress)
*   **Purpose:** Manages the Spaced Repetition System logic for user vocabulary.
*   **Validation:** Enforces word limits and securely runs dates/progress recalculation entirely on the server side.

## 7. Security Considerations
*   **Authentication:** All endpoints verify the user's identity via their Firebase Auth token.
*   **Authorization:** Admin-only endpoints verify the `isAdmin` custom claim or database field.
*   **Input Sanitization:** The client is never trusted. All parameters (strings, arrays, dates) are length-capped and type-checked before hitting the database or AI.
*   **Secret Management:** API keys (Gemini, GNews) are stored securely using Firebase Secret Manager.

## 9. Feature: Landing Page & Dashboard Separation

**Objective:** Separate the public marketing landing page from the authenticated user experience to provide a cleaner flow and a dedicated progress overview.

**Routing Architecture (Frontend):**
*   `/` (Public Landing Page): Displays marketing copy, app features, and a "Log In" button.
    *   *Behavior:* If an already authenticated user visits `/`, they are automatically redirected to `/dashboard`.
*   `/dashboard` (Protected Route): The main gateway for logged-in users.
*   **Layouts:**
    *   `PublicLayout`: Used for `/`. Minimal header (Logo + Login).
    *   `AppLayout`: Used for `/dashboard` and all app features. Includes the main navigation header showing the user's avatar, name, and subscription tier (Free/PRO).

**Dashboard Components & Data Requirements:**
1.  **Welcome Message:** "Hola, [User Name]" (Pulled from Firebase Auth / user document).
2.  **Vocabulary (SRS) Widget:**
    *   *Data:* Queries `users/{uid}/savedWords` to calculate total words and words due for review today.
    *   *Empty State:* If 0 words exist, displays: "No words saved yet! Read an article to start building your vocabulary." with a button linking to the Library.
    *   *Active State:* Displays stats and a "Review Now" button.
3.  **Daily AI Limits Widget:**
    *   *Data:* Queries `users/{uid}/daily_limits` to show remaining free AI interactions. 
    *   *Premium State:* If the user is Premium, this widget hides the limits and displays a "Premium Active" badge.
4.  **Quick Actions:** 
    *   "Practice Conversation" button -> Navigates to the Scenario Selection component.
    *   "Read Articles" button -> Navigates to the Library component.

## 10. Feature: Authentication Pages Redesign

**Objective:** Move the login flow directly onto the public landing page to reduce friction, and create a dedicated sign-up page that enforces legal agreements.

**Routing & Components:**
*   `/` (`LandingPage.jsx`): Now acts as the primary login page. Features a prominent "Log in with Google" button and an email/password login form.
*   `/signup` (`SignupPage.jsx`): A dedicated registration page.
    *   *Agreements:* Includes a mandatory checkbox for Terms & Conditions and Privacy Policy. The "Create Account" button is disabled until checked.
    *   *Modals:* Clicking the legal links opens the existing `Modal.jsx` component containing the respective text.
*   **Post-Signup Flow (Soft Verification):** Upon successful registration (Google or Email), the user is immediately authenticated and redirected to `/dashboard`. Strict email verification is *not* required to access the app, but a banner may be shown later prompting them to verify.

## 11. Feature: Lesson Session Word Limit

**Objective:** Enforce a limit on the number of words reviewed and practiced per lesson session to maintain a high-quality focused practice, while allowing users to bookmark/save as many words as they want for their general vocabulary.

**Behavior:**
1.  **Reading Phase:** Users can save/bookmark an unlimited number of words. All of them are successfully saved to Firestore.
2.  **Transition to Review:** When the user clicks the "Continue to Review" button, if they have saved more than 5 words in the current session, an alert is shown notifying them that only the first 5 words will be included in the review session.
3.  **Review and Practice Phases:** The application slices the saved session words to the first 5 (`activeSession.wordsSavedInSession.slice(0, 5)`) and passes only these 5 words to the Flashcard Review and AI Chat Practice components.

## 12. Feature: Public Delete Account Instructions Page

**Objective:** Provide a public, unauthenticated page containing step-by-step instructions on how users can request deletion of their data and how to remove the app from their Facebook account, complying with Meta Developer Policy.

**Routing & Components:**
*   `/delete-account` (`DeleteAccountPage.jsx`): A public route accessible to anyone.
*   **Content:** 
    1. Instructions for requesting deletion via support email (`admin@thespanishsuiteapp.com`).
    2. Instructions for logged-in users to directly delete their account via their Profile/Account settings.
    3. Step-by-step walkthrough on how to remove the app via the Facebook App settings portal.

## 13. Feature: Facebook Authentication Integration

**Objective:** Add Facebook Login support as a registration and sign-in option on the public landing page, utilizing Firebase Authentication's Facebook identity provider.

**System Architecture & Logic:**
*   **Authentication Provider:** Instantiated in `store.js` as `FacebookAuthProvider`.
*   **Store Methods:** `signInWithFacebook` handles popup authentication and invokes `verifyAuthFlow` to enforce server-side validation.
*   **UI Components:**
    *   `LandingPage.jsx`: Integrates stacked Facebook Login/Sign up buttons.
    *   **Terms Agreement:** The Facebook Sign Up button is conditionally disabled until the legal terms checkbox is checked.

## 14. Feature: Separate Registration (Landing) and Login Pages

**Objective:** Split the authentication interface so that `/` (Landing Page) is dedicated to registration (Sign Up) and `/login` is dedicated to authentication (Sign In), improving clarity and onboarding flow.

**Routing & Access:**
*   `/` (`LandingPage.jsx`): Public route. If `currentUser` is null, displays the marketing copy and registration/Sign Up buttons. If logged in, redirects to `/`.
*   `/login` (`LoginPage.jsx`): Public route. If `currentUser` is null, displays the Sign In buttons. If logged in, redirects to `/`.
*   **Routing in App.jsx:**
    ```javascript
    {currentUser ? (
        <Route path="/*" element={<AppLayout />} />
    ) : (
        <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<LandingPage />} />
        </>
    )}
    ```

## 15. Feature: Email & Password Authentication with Email Verification

**Objective:** Provide standard email and password authentication (minimum 6 characters) as a first-party sign-up and login method. Restrict application access to only users who have verified their email address.

**Architecture & Logic:**
*   **Firebase Authentication Providers:** Enables the `Email/Password` provider.
*   **Authentication Actions (`store.js`):**
    *   `signUpWithEmail(email, password)`: Calls `createUserWithEmailAndPassword(auth, email, password)`. If successful, triggers `sendEmailVerification(auth.currentUser)` and then calls `verifyAuthFlow({ isSignUpFlow: true })`.
    *   `signInWithEmail(email, password)`: Calls `signInWithEmailAndPassword(auth, email, password)`. If successful, triggers `verifyAuthFlow({ isSignUpFlow: false })`.
*   **Email Verification Flow:**
    *   If `currentUser` is signed in but `currentUser.emailVerified` is `false`, the user is redirected to `/verify-email` and blocked from accessing any authenticated views or layout pages.
    *   Google and Facebook logins bypass the verification check if their auth provider sets `emailVerified: true` (default behavior).
*   **Routing in `App.jsx`:**
    ```javascript
    {currentUser ? (
        !currentUser.emailVerified ? (
            <>
                <Route path="/verify-email" element={<VerifyEmailPage />} />
                <Route path="*" element={<Navigate to="/verify-email" replace />} />
            </>
        ) : (
            <Route path="/*" element={<AppLayout />} />
        )
    ) : (
        <>
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<LandingPage />} />
        </>
    )}
    ```

**UI Components:**
*   `LandingPage.jsx`: Integrates input fields for `Email` and `Password` inside the registration card, replacing or supplementing the simple OAuth buttons. The "Create Account" button is disabled until the terms checkbox is checked.
*   `LoginPage.jsx`: Integrates `Email` and `Password` inputs above/below the Google/Facebook buttons.
*   `VerifyEmailPage.jsx` [NEW]: A dedicated view showing:
    *   A message stating a verification link has been sent to their email.
    *   A "Resend Verification Email" button (with throttle/cooldown).
    *   A "Check Status" button that calls `auth.currentUser.reload()` to check if the user has clicked the verification link.
    *   A "Log Out" button.
## 16. Feature: Admin Dictionary Inspector & Batch Processing

**Objective:** Provide administrators with an automated in-app tool to scan, review, auto-generate (via Gemini), export, import, and batch-save missing story vocabulary words, their translations, and two contextual usage examples directly into the Firestore dictionary.

**Architecture & Logic:**
*   **Scanning & Detection:** When an admin enters `StoryReader.jsx`, words in `article.sentences` are matched and verified against the loaded dictionary map (`translations`). Words with missing or `"No translation found"` entries are identified.
*   **Batch Save Endpoint (`saveDictionaryBatch`):**
    *   *Backend:* Added to `functions/src/dictionary.js`. Securely checks `admin` claim or `isAdmin === true` in Firestore, accepts an array of up to 100 words, validates string lengths, sanitizes 2 examples (`{ spanish, english }`), and writes using atomic Firestore batching.
    *   *Frontend Action (`store.js`):* `saveDictionaryBatch(wordsArray)` calls the Cloud Function with an instant Firestore SDK client batch fallback (`writeBatch`) permitted by Firestore security rules for admins. It updates `activeArticleTranslations` in memory so red word highlights resolve immediately and invalidates cached article data.
*   **AI Auto-Generation (`generateDictionaryEntries`):**
    *   *Backend:* Added to `functions/src/dictionary.js`. Uses Google Gemini (`gemini-flash-latest`) via `GoogleGenerativeAI` to automatically generate English translations and 2 natural A2-B1 Spanish/English usage examples for up to 50 words in one API call.
    *   *Frontend Action (`store.js`):* `generateDictionaryEntriesWithAI(wordsArray)` securely requests the entries and populates the inspector list.
*   **JSON Export & Import:**
    *   *Export:* Downloads a formatted `<article_title>_missing_words.json` containing the word list and examples template for offline review or editing.
    *   *Import:* Reads a `.json` file, parses and validates the schema, and populates/merges the in-app list.

**UI Components:**
*   `AdminMissingWordsDrawer.jsx`: A responsive slide-in side drawer featuring:
    *   Missing words counter badge.
    *   One-click "Auto-Fill with AI" (Gemini) button.
    *   "Export JSON" and "Import JSON" buttons.
    *   Expandable word cards allowing direct editing of translation, Example 1 (ES/EN), Example 2 (ES/EN), or removal.
    *   "Push to Dictionary" batch commit button with progress states and notifications.
*   `StoryReader.jsx`: Displays a "Missing Words" button in the admin controls bar showing the current count of missing words and triggers the drawer.

## 17. Feature: AI Word Context & Additional Examples for Premium Users

**Objective:** Allow Premium users to generate deeper context on flashcards: a clear, concise English explanation of how and when to use the word, alongside 2 additional contextual example sentences in Spanish and English with audio pronunciation. Free users can see the button and are presented with an upgrade modal if clicked.

**Architecture & Logic:**
*   **API Endpoint (`generateWordContext` in `functions/src/ai.js`):**
    *   *Authentication & Authorization:* Requires authentication. Checks custom claim `admin === true` or Firestore `isAdmin === true` or `hasActiveSubscription === true`.
    *   *Daily Limits:* Enforces a limit of 25 requests per day for premium users via Firestore transaction at `users/{uid}/daily_limits/word_context` (Admins bypass the limit).
    *   *Input Validation:* Requires `word` (1-100 characters), optional `translation` (1-200 characters).
    *   *AI Model:* Invokes Google Gemini (`gemini-flash-latest`) with a structured JSON schema returning:
        *   `explanation`: string (English explanation of nuances, collocations, grammatical gender, or common phrases).
        *   `examples`: array of 2 `{ spanish, english }` objects.
*   **Frontend Action (`store.js`):**
    *   `generateWordContext(word, translation)` calls `httpsCallable(functions, 'generateWordContext')`.
*   **UI Components:**
    *   `FlashcardView.jsx`:
        *   Renders an "Explain & More Examples (AI)" button in the Usage Context section.
        *   If Free user: triggers `Modal.jsx` explaining the Premium feature with a button navigating to `/#premium`.
        *   If Premium user: triggers loading state, calls `generateWordContext`, and renders the English explanation card and 2 additional example sentence cards with audio TTS triggers.

