import { initializeApp } from "firebase/app";
import {
    getFirestore,
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    onSnapshot,
    deleteDoc
} from "firebase/firestore";

let app;
let db;

async function initFirebase(baseUrl = '') {
    try {
        const res = await fetch(`${baseUrl}/api/config`);
        const config = await res.json();

        if (!config.apiKey || config.apiKey.includes('Your-Actual-Api-Key')) {
            console.warn("Firebase config not set. Check .env.local");
            return false;
        }

        app = initializeApp(config);
        db = getFirestore(app);
        console.log("Firebase Initialized");
        return true;
    } catch (e) {
        console.error("Error initializing Firebase:", e);
        return false;
    }
}

export {
    initFirebase,
    db,
    collection,
    doc,
    setDoc,
    getDoc,
    updateDoc,
    onSnapshot,
    deleteDoc
};
