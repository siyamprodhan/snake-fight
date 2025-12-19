# Firebase Configuration

To enable Online Mode, you need to set up a Firebase project and add your credentials.

1.  **Create a Firebase Project:**
    *   Go to [console.firebase.google.com](https://console.firebase.google.com/).
    *   Create a new project.
    *   Enable **Firestore Database** (start in Test Mode for development).
    *   Add a **Web App** to your project.

2.  **Get Credentials:**
    *   Copy the `firebaseConfig` object properties provided by Firebase.
    *   You will need: `apiKey`, `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`.

3.  **Create `.env.local`:**
    *   Create a file named `.env.local` in this folder (root directory).
    *   Copy the content below and replace the capitalized values with your actual keys.

```env
# .env.local

# Replace these with your actual Firebase config values
FIREBASE_API_KEY=AIzaSyD-Your-Actual-Api-Key-Here
FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
FIREBASE_MESSAGING_SENDER_ID=123456789012
FIREBASE_APP_ID=1:123456789012:web:abcdef123456
```

> **Note:** Ideally, you should restart the server after creating `.env.local`.
