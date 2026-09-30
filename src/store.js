import { create } from 'zustand';
import { db, functions } from './firebase';
import { collection, getDocs, addDoc, doc, updateDoc, getFirestore, setDoc, getDoc, increment, query, where, documentId, deleteDoc, orderBy, serverTimestamp, arrayUnion, onSnapshot } from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, FacebookAuthProvider, onAuthStateChanged, signOut, getAdditionalUserInfo, deleteUser, createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from "firebase/auth";
import { httpsCallable } from "firebase/functions";

const auth = getAuth();
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });
const facebookProvider = new FacebookAuthProvider();

// --- Caching Configuration ---
const CACHE_KEY = 'spanishAppCache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day

/**
 * Gets the entire cache object from localStorage.
 */
function getCache() {
    const cachedData = localStorage.getItem(CACHE_KEY);
    if (!cachedData) {
        // Return a default structure if no cache exists
        return { articles: null, articleDetail: {}, articlesVersion: 0, dictionary: {} };
    }
    return JSON.parse(cachedData);
}

/**
 * Saves the provided data object to localStorage.
 */
function setCache(data) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch (error) {
        console.error("Error saving to cache:", error);
        // This can happen if localStorage is full
    }
}

/**
 * Checks if a timestamp is still valid (less than 24 hours old).
 */
function isCacheValid(timestamp) {
    if (!timestamp) return false;
    return (Date.now() - timestamp) < CACHE_DURATION;
}

/**
 * Converts a Map to a JSON-safe string.
 */
function serializeMap(map) {
    return JSON.stringify(Array.from(map.entries()));
}

/**
 * Converts a JSON-safe string back into a Map.
 */
function deserializeMap(jsonString) {
    if (!jsonString) return new Map();
    return new Map(JSON.parse(jsonString));
}

export const useDecksStore = create((set, get) => ({
    // --- STATE ---
    decks: {},
    isLoading: false,
    isDecksLoading: false, // New flag to prevent double fetching
    decksLoaded: false,
    currentUser: null,
    isAdmin: false,
    tab: 'lessons',
    hasActiveSubscription: false,
    stripeProducts: [],
    isProductsLoading: false,
    articles: {},
    isArticlesLoading: false,
    loadingArticleId: null,
    // --- MODIFIED: This will now hold translations for ONLY the active article ---
    activeArticleTranslations: new Map(),
    isDictionaryLoading: false, // To show a loading state for translations
    progress: {},
    deckProgress: {},
    listeningPreference: 'es-ES',
    dailyXp: 0,
    totalXp: 0,
    streak: 0,
    xpHistory: {},
    theme: 'dark',
    savedWordsSet: new Set(),
    savedWordsList: [],
    savedWordsLoaded: false,
    dailyFreeAccess: null,
    finishedArticles: new Set(),
    scenarios: [],
    scenariosAiInstructions: '',
    isScenariosLoading: false,
    speakProgress: {},
    interactionCount: 0,
    userProgressLoaded: false,
    speakProgressLoaded: false,
    userStats: { total: 0, premium: 0 },
    userStatsLoaded: false,
    isUsersLoading: false,
    userDataFetched: false,
    newsApiFrequency: 24,
    newsTopic: 'noticias',
    // --- NEW: Global state for streak notifications ---
    lastStreakNotificationDate: null,
    showStreakConfetti: false,

    // --- NEW: Structured Lesson Flow State ---
    activeSession: {
        isActive: false,
        articleId: null,
        step: 'idle', // 'reading', 'review', 'practice', 'completed',
        wordsSavedInSession: [],
        srsXpInSession: 0, // XP accumulated in this review session
        srsWordsToUpdate: [], // wordIds accumulated for batch update
    },

    isAuthListenerSet: false, // <-- 1. ADD THIS FLAG


    // --- ACTIONS ---
    toggleTheme: () => set((state) => ({
        theme: state.theme === 'light' ? 'dark' : 'light',
    })),

    setTab: (tab) => set({ tab }),

    // --- NEW: Session Actions ---
    startSession: (articleId) => set({
        activeSession: {
            isActive: true,
            articleId,
            step: 'reading',
            wordsSavedInSession: []
        }
    }),

    advanceSessionStep: async (nextStep) => {
        const { activeSession, totalXp, savedWordsList } = get();
        const previousStep = activeSession.step;

        // --- Logic to flush SRS progress and XP when moving from review to practice ---
        const xpToFlush = activeSession.srsXpInSession || 0;
        const wordsToUpdate = activeSession.srsWordsToUpdate || [];

        if (previousStep === 'review' && nextStep === 'practice' && (xpToFlush > 0 || wordsToUpdate.length > 0)) {
            // Backups for potential rollback
            const previousTotalXp = totalXp;
            const previousSavedWordsList = [...savedWordsList];

            // Optimistic update: clear session state and advance the step
            set(state => ({
                activeSession: {
                    ...state.activeSession,
                    step: nextStep,
                    srsXpInSession: 0,
                    srsWordsToUpdate: []
                }
            }));

            try {
                // The backend function now handles both updating words and awarding XP in one transaction.
                const updateProgressCall = httpsCallable(functions, 'updateMultipleSavedWordProgress');
                await updateProgressCall({ wordIds: wordsToUpdate });

            } catch (error) {
                console.error("Error flushing SRS progress/XP:", error);
                // Rollback on error.
                set(state => ({
                    activeSession: {
                        ...state.activeSession,
                        step: previousStep, // Go back to the review step
                        srsXpInSession: xpToFlush, // Restore the unflushed XP
                        srsWordsToUpdate: wordsToUpdate, // Restore the unflushed words
                    },
                    // Rollback the optimistic updates
                    totalXp: previousTotalXp,
                    savedWordsList: previousSavedWordsList
                }));
                alert("There was a problem saving your review progress. Please try again.");
            }
        } else {
            // Default behavior for other step transitions
            set((state) => ({
                activeSession: { ...state.activeSession, step: nextStep }
            }));
        }
    },

    flushStandaloneSrsProgress: async () => {
        const { standaloneSrsWordsToUpdate = [], standaloneSrsXp = 0, totalXp, savedWordsList } = get();

        if (standaloneSrsWordsToUpdate.length === 0) return;

        // Backups for potential rollback
        const previousTotalXp = totalXp;
        const previousSavedWordsList = [...savedWordsList];
        const wordsToUpdate = [...standaloneSrsWordsToUpdate];
        const xpToFlush = standaloneSrsXp;

        // Optimistic update: clear queue
        set({
            standaloneSrsWordsToUpdate: [],
            standaloneSrsXp: 0
        });

        try {
            // Chunk the words into batches of 10 maximum (backend limit)
            const chunks = [];
            for (let i = 0; i < wordsToUpdate.length; i += 10) {
                chunks.push(wordsToUpdate.slice(i, i + 10));
            }

            const updateProgressCall = httpsCallable(functions, 'updateMultipleSavedWordProgress');

            for (const chunk of chunks) {
                await updateProgressCall({ wordIds: chunk });
            }
        } catch (error) {
            console.error("Error flushing standalone SRS progress:", error);
            // Rollback on error
            set({
                standaloneSrsWordsToUpdate: wordsToUpdate,
                standaloneSrsXp: xpToFlush,
                totalXp: previousTotalXp,
                savedWordsList: previousSavedWordsList
            });
            alert("There was a problem saving your review progress. Please try again.");
        }
    },

    endSession: () => set({
        activeSession: {
            isActive: false,
            articleId: null,
            step: 'idle',
            wordsSavedInSession: [],
            srsXpInSession: 0, // XP accumulated in this review session
            srsWordsToUpdate: [], // wordIds accumulated for batch update
        }
    }),

    listenForAuthChanges: () => {
        if (get().isAuthListenerSet) return;

        set({ isAuthListenerSet: true });

        let userDocUnsubscribe = null;

        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (userDocUnsubscribe) {
                userDocUnsubscribe();
                userDocUnsubscribe = null;
            }

            if (user) {
                try {
                    const { currentUser, userDataFetched } = get();

                    // --- OPTIMIZATION: Prevent redundant reads ---
                    // If it's the same user, just update the auth object and skip the database read!
                    if (currentUser?.uid === user.uid && userDataFetched) {
                        set({ currentUser: user });
                        return;
                    }

                    const tokenResult = await user.getIdTokenResult();
                    const userDocRef = doc(db, 'users', user.uid);

                    // Set up realtime sync for user document to catch subscription upgrades instantly
                    userDocUnsubscribe = onSnapshot(userDocRef, (docSnap) => {
                        if (docSnap.exists()) {
                            const userData = docSnap.data();
                            const subscriptionStatus = userData.hasActiveSubscription === true;
                            const isFirestoreAdmin = userData.isAdmin === true;
                            const isTrueAdmin = tokenResult.claims.admin === true || isFirestoreAdmin;

                            set({
                                hasActiveSubscription: subscriptionStatus,
                                isAdmin: isTrueAdmin,
                                listeningPreference: userData.listeningPreference || 'es-US',
                                totalXp: userData.totalXp || 0,
                                dailyXp: userData.dailyXp || 0,
                                streak: userData.streak || 0,
                                dailyFreeAccess: userData.dailyFreeAccess || null,
                            });
                        }
                    }, (syncError) => {
                        console.error("User doc snapshot subscription failed:", syncError);
                    });

                    // Fetch initial critical user data
                    const userDocSnap = await getDoc(userDocRef);

                    let userPreference = 'es-US';
                    let userXp = 0;
                    let userDailyXp = 0;
                    let userStreak = 0;
                    let subscriptionStatus = false;
                    let isFirestoreAdmin = false;
                    let dailyFreeAccess = null;

                    // --- NEW: Timezone Synchronization ---
                    // Check if user document exists and if timezone is missing.
                    // If so, update it with the browser's timezone. This is a one-time fix.
                    const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
                    const userData = userDocSnap.exists() ? userDocSnap.data() : null;

                    if (user.emailVerified && userData && (!userData.timezone || userData.timezone !== browserTimezone)) {
                        // --- SECURE FIX: Call a dedicated Cloud Function ---
                        const updateUserTimezoneCall = httpsCallable(functions, 'updateUserTimezone');
                        updateUserTimezoneCall({ timezone: browserTimezone }).catch(error => {
                            // Log the error, but don't block the login flow.
                            // This is a non-critical, one-time update.
                            console.error("Failed to sync timezone:", error.message || error.text || error);
                        });
                    }

                    if (userData) {
                        userPreference = userData.listeningPreference || 'es-US';
                        userXp = userData.totalXp || 0;
                        userDailyXp = userData.dailyXp || 0;
                        userStreak = userData.streak || 0;
                        subscriptionStatus = userData.hasActiveSubscription === true;
                        isFirestoreAdmin = userData.isAdmin === true;

                        // --- FIX: Race Condition Handling ---
                        // If we have a local record for TODAY, but server has nothing (or old date), 
                        // keep the local version. This prevents the auth listener from overwriting 
                        // our optimistic update before the server write completes.
                        const serverAccess = userData.dailyFreeAccess || null;
                        const localAccess = get().dailyFreeAccess;
                        const now = new Date();
                        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                        if (localAccess && localAccess.date === today && (!serverAccess || serverAccess.date !== today)) {
                            dailyFreeAccess = localAccess;
                        } else {
                            dailyFreeAccess = serverAccess;
                        }
                    }

                    const isTrueAdmin = tokenResult.claims.admin === true || isFirestoreAdmin;
                    const isPremium = isTrueAdmin || subscriptionStatus;

                    set({
                        currentUser: user,
                        userDataFetched: true,
                        isAdmin: isTrueAdmin, // FIX: Only real admins get admin privileges
                        hasActiveSubscription: subscriptionStatus,
                        listeningPreference: userPreference,
                        totalXp: userXp,
                        dailyXp: userDailyXp,
                        streak: userStreak,
                        dailyFreeAccess,
                        // Reset these on login to ensure fresh data is fetched
                        finishedArticles: new Set(),
                        savedWordsLoaded: false,
                        savedWordsSet: new Set(),
                        savedWordsList: [],
                    });

                    // Only fetch gated user subcollections if the email is verified
                    if (user.emailVerified) {
                        await get().initializeUserData(user, isPremium);
                    }
                } catch (authError) {
                    console.error("Error setting up authenticated user state:", authError);

                    // Cleanup user document listener if set
                    if (userDocUnsubscribe) {
                        userDocUnsubscribe();
                        userDocUnsubscribe = null;
                    }

                    // Attempt sign out, clear cache, and reset local store state
                    try {
                        await signOut(auth);
                    } catch (signOutError) {
                        console.error("Sign out failed inside auth error recovery:", signOutError);
                    }
                    localStorage.clear();

                    set({
                        currentUser: null,
                        userDataFetched: false,
                        isAdmin: false,
                        hasActiveSubscription: false,
                        progress: {},
                        deckProgress: {},
                        listeningPreference: 'es-ES',
                        totalXp: 0,
                        dailyXp: 0,
                        streak: 0,
                        xpHistory: {},
                        dailyFreeAccess: null,
                        finishedArticles: new Set(),
                        savedWordsLoaded: false,
                        savedWordsSet: new Set(),
                        savedWordsList: [],
                        speakProgress: {},
                        interactionCount: 0,
                        userProgressLoaded: false,
                        speakProgressLoaded: false,
                        userStats: { total: 0, premium: 0 },
                        userStatsLoaded: false
                    });
                }
            } else {
                if (userDocUnsubscribe) {
                    userDocUnsubscribe();
                    userDocUnsubscribe = null;
                }
                set({
                    currentUser: null,
                    userDataFetched: false,
                    isAdmin: false,
                    hasActiveSubscription: false,
                    progress: {},
                    deckProgress: {},
                    listeningPreference: 'es-ES',
                    totalXp: 0,
                    dailyXp: 0,
                    streak: 0,
                    xpHistory: {}, // Clear on logout
                    dailyFreeAccess: null,
                    finishedArticles: new Set(),
                    savedWordsLoaded: false,
                    savedWordsSet: new Set(),
                    savedWordsList: [],
                    speakProgress: {},
                    interactionCount: 0,
                    userProgressLoaded: false,
                    speakProgressLoaded: false,
                    userStats: { total: 0, premium: 0 },
                    userStatsLoaded: false
                });
            }
        });

        return () => {
            if (userDocUnsubscribe) {
                userDocUnsubscribe();
                userDocUnsubscribe = null;
            }
            unsubscribe();
            set({ isAuthListenerSet: false });
        };
    },

    fetchNewsConfig: async () => {
        if (!get().isAdmin) return; // Only admins can fetch/update news config 
        try {
            const configDoc = await getDoc(doc(db, 'settings', 'newsApi'));
            if (configDoc.exists()) {
                const data = configDoc.data();
                const frequency = data.frequency !== undefined ? parseInt(data.frequency, 10) : 24;
                const topic = data.topic || 'noticias';
                set({ newsApiFrequency: frequency, newsTopic: topic });
            }
        } catch (error) {
            console.error("Error fetching news config: ", error);
        }
    },

    // --- NEW: Lazy Load Actions ---
    fetchUserProgress: async () => {
        const { currentUser, userProgressLoaded } = get();
        if (!currentUser || userProgressLoaded) return;

        try {
            const progressSnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'progress'));
            const progressData = {};
            progressSnapshot.forEach(d => { progressData[d.id] = d.data(); });

            set({ progress: progressData, deckProgress: progressData, userProgressLoaded: true });
        } catch (error) {
            console.error("Error fetching user progress:", error.message);
        }
    },

    fetchXpHistory: async () => {
        const { currentUser } = get();
        if (!currentUser) return;

        try {
            // We need the last 7 days for the chart.
            const today = new Date();
            const dateStrings = [];
            for (let i = 0; i < 7; i++) {
                const d = new Date(today);
                d.setDate(d.getDate() - i);
                dateStrings.push(d.toLocaleDateString('en-CA')); // 'YYYY-MM-DD'
            }

            // Firestore 'in' query is limited to 30 values, 7 is fine.
            const historyQuery = query(
                collection(db, 'users', currentUser.uid, 'xpHistory'),
                where(documentId(), 'in', dateStrings)
            );

            const querySnapshot = await getDocs(historyQuery);

            const newXpHistory = {};
            querySnapshot.forEach(doc => {
                newXpHistory[doc.id] = doc.data().xp || 0;
            });

            set({ xpHistory: newXpHistory });
        } catch (error) {
            console.error("Error fetching XP history:", error);
        }
    },

    fetchSpeakProgress: async () => {
        const { currentUser, speakProgressLoaded } = get();
        if (!currentUser || speakProgressLoaded) return;

        try {
            const speakProgressSnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'speakProgress'));
            const speakProgressMap = {};
            speakProgressSnapshot.forEach(doc => {
                speakProgressMap[doc.id] = doc.data().completedRolePlays || [];
            });
            set({ speakProgress: speakProgressMap, speakProgressLoaded: true });
        } catch (error) {
            console.error("Error fetching speak progress:", error);
        }
    },

    // --- NEW: Manually update local state after a write (replaces listener) ---
    updateSpeakProgressLocal: (scenarioId, rolePlayName) => {
        set(state => {
            const currentList = state.speakProgress[scenarioId] || [];
            if (!currentList.includes(rolePlayName)) {
                return {
                    speakProgress: {
                        ...state.speakProgress,
                        [scenarioId]: [...currentList, rolePlayName]
                    }
                };
            }
            return {};
        });
    },

    // --- NEW: Rollback function for optimistic speak progress update ---
    rollbackSpeakProgressLocal: (scenarioId, rolePlayName) => {
        set(state => {
            const currentList = state.speakProgress[scenarioId] || [];
            if (currentList.includes(rolePlayName)) {
                return {
                    speakProgress: {
                        ...state.speakProgress,
                        [scenarioId]: currentList.filter(name => name !== rolePlayName)
                    }
                };
            }
            // If the rolePlayName isn't in the list, no state change is needed.
            return {};
        });
    },

    // --- NEW: Action to handle XP results and trigger streak notifications ---
    handleXpResult: (result) => {
        if (!result) return;

        // Always update the global streak value from the backend's source of truth
        if (result.newStreak !== undefined) {
            set({ streak: result.newStreak });
        }

        if (!result.streakUpdated) {
            return; // Do nothing else if the streak wasn't extended today
        }

        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format

        // Check if we should show the notification for the first time today
        if (get().lastStreakNotificationDate !== today) {
            set({
                lastStreakNotificationDate: today,
                showStreakConfetti: true
            });
        }
    },

    hideStreakConfetti: () => set({ showStreakConfetti: false }),

    incrementInteractionCount: () => {
        set(state => ({ interactionCount: state.interactionCount + 1 }));
    },

    fetchFinishedArticles: async () => {
        const { currentUser } = get();
        if (!currentUser) return;

        try {
            const articlesSnapshot = await getDocs(collection(db, 'users', currentUser.uid, 'finishedArticles'));
            const articleIds = new Set();
            articlesSnapshot.forEach(doc => {
                articleIds.add(doc.id);
            });
            set({ finishedArticles: articleIds });
        } catch (error) {
            console.error("Error fetching finished articles:", error);
        }
    },

    markArticleAsFinished: async (articleId) => {
        const { currentUser, finishedArticles, totalXp, activeSession, handleXpResult } = get();
        if (!currentUser) return;

        if (!finishedArticles.has(articleId)) {
            // Backup for potential rollback
            const previousFinishedArticles = new Set(finishedArticles);
            const previousTotalXp = totalXp;
            const previousStep = activeSession.step;

            // Optimistic update
            const newFinishedArticles = new Set(finishedArticles).add(articleId);
            set({ finishedArticles: newFinishedArticles, totalXp: totalXp + 10 });

            // Optimistic update: clear session state and advance the step
            set(state => ({
                activeSession: {
                    ...state.activeSession,
                    step: 'review',
                }
            }));

            try {
                const markFinishedCall = httpsCallable(functions, 'markArticleAsFinished');
                const result = await markFinishedCall({ articleId });
                handleXpResult(result.data); // Pass the result to the global handler
            } catch (error) {
                console.error("Error marking article as finished:", error);
                // Rollback on error
                set({ finishedArticles: previousFinishedArticles, totalXp: previousTotalXp });
                set(state => ({
                    activeSession: {
                        ...state.activeSession,
                        step: previousStep,
                    }
                }));
                throw error; // Re-throw the error for the component to handle
            }
        } else {
            // If we already have this article marked as finished, just advance the step
            set(state => ({
                activeSession: {
                    ...state.activeSession,
                    step: 'review',
                }
            }));
        }
    },

    // --- MODIFIED: Now fetches translations along with saved words ---
    fetchSavedWords: async (force = false) => {
        const { currentUser, savedWordsLoaded } = get();
        if (!currentUser) return;

        if (savedWordsLoaded && !force) return;

        try {
            // 1. Fetch the user's saved words (IDs, addedAt, active)
            const q = query(
                collection(db, 'users', currentUser.uid, 'savedWords'),
                where("active", "==", true),
                orderBy("addedAt", "desc")
            );
            const savedWordsSnapshot = await getDocs(q);

            const wordsSet = new Set();
            const wordsToTranslate = [];
            const savedWordDataMap = new Map(); // Store temp data

            savedWordsSnapshot.docs.forEach(d => {
                const wordId = d.id;
                wordsSet.add(wordId);
                wordsToTranslate.push(wordId);
                savedWordDataMap.set(wordId, d.data()); // Store { addedAt, active }
            });

            if (wordsToTranslate.length === 0) {
                set({ savedWordsSet: new Set(), savedWordsList: [], savedWordsLoaded: true });
                return;
            }

            // 2. Resolve Translations (Cache First)
            const cache = getCache();
            const cachedDictionary = cache.dictionary || {};
            const wordsNeedingFetch = [];

            wordsToTranslate.forEach(wordId => {
                if (!cachedDictionary[wordId]) {
                    wordsNeedingFetch.push(wordId);
                }
            });

            // 3. Fetch only missing words from Firestore
            const fetchPromises = wordsNeedingFetch.map(async (wordId) => {
                const wordSnap = await getDoc(doc(db, 'dictionary', wordId));
                if (wordSnap.exists()) {
                    const dictData = wordSnap.data();
                    cachedDictionary[wordSnap.id] = {
                        translation: dictData.english || dictData.translation,
                        examples: dictData.examples || []
                    };
                }
            });
            await Promise.all(fetchPromises);

            // Save updated dictionary to cache if we fetched anything
            if (wordsNeedingFetch.length > 0) {
                cache.dictionary = cachedDictionary;
                setCache(cache);
            }

            // 4. Combine the data into the final list
            const fullWordsList = wordsToTranslate.map(wordId => {
                const data = savedWordDataMap.get(wordId);
                const dictEntry = cachedDictionary[wordId];
                return {
                    id: wordId, // This is the Spanish word
                    // Prefer translation in savedWord doc, fallback to dictionary
                    translation: data.translation || data.english || (typeof dictEntry === 'object' ? dictEntry.translation : dictEntry) || "No translation",
                    examples: (typeof dictEntry === 'object' ? dictEntry.examples : []),
                    vocab: data.vocab || null,
                    source: data.source || null,
                    addedAt: data.addedAt,
                    active: data.active,
                    stage: data.stage || 0,
                    nextReviewDate: data.nextReviewDate || 0
                };
            });

            set({ savedWordsSet: wordsSet, savedWordsList: fullWordsList, savedWordsLoaded: true });

        } catch (error) {
            console.error("Error fetching saved words: ", error);
        }
    },

    // --- MODIFIED: Implements "soft delete" by toggling the 'active' flag ---
    toggleSavedWord: async (spanishWord, data = {}) => {
        const { currentUser, savedWordsSet, savedWordsList } = get();
        // ... (existing code) ...
        if (!currentUser) {
            alert("Please log in to save words.");
            return;
        }

        const isRemoving = savedWordsSet.has(spanishWord);

        // Backups for potential rollback if the server fails
        const previousSavedWordsSet = new Set(savedWordsSet);
        const previousSavedWordsList = [...savedWordsList];
        const previousActiveSessionWords = [...get().activeSession.wordsSavedInSession];

        const newSavedWordsSet = new Set(savedWordsSet);

        // 1. Optimistic Update (Instantly update UI)
        if (isRemoving) {
            newSavedWordsSet.delete(spanishWord);
            const newList = savedWordsList.filter(w => w.id !== spanishWord);
            set({ savedWordsSet: newSavedWordsSet, savedWordsList: newList });

            if (get().activeSession.isActive) {
                set(state => ({ activeSession: { ...state.activeSession, wordsSavedInSession: state.activeSession.wordsSavedInSession.filter(w => w !== spanishWord) } }));
            }
        } else {
            newSavedWordsSet.add(spanishWord);
            const newWordData = {
                active: true,
                stage: 0,
                translation: data.translation || '',
                vocab: data.vocab || '',
                source: data.source || null
            };
            const newItem = { id: spanishWord, ...newWordData };
            set({ savedWordsSet: newSavedWordsSet, savedWordsList: [newItem, ...savedWordsList] });

            if (get().activeSession.isActive) {
                set(state => ({ activeSession: { ...state.activeSession, wordsSavedInSession: [...state.activeSession.wordsSavedInSession, spanishWord] } }));
            }
        }

        // 2. Perform the secure network request
        try {
            const toggleSavedWordCall = httpsCallable(functions, 'toggleSavedWord');
            await toggleSavedWordCall({
                spanishWord,
                action: isRemoving ? 'remove' : 'add',
                translation: data.translation,
                vocab: data.vocab,
                source: data.source
            });
        } catch (error) {
            console.error("Error toggling saved word: ", error);

            // 3. Rollback the UI if the server fails
            set({ savedWordsSet: previousSavedWordsSet, savedWordsList: previousSavedWordsList });
            if (get().activeSession.isActive) {
                set(state => ({ activeSession: { ...state.activeSession, wordsSavedInSession: previousActiveSessionWords } }));
            }

            alert("Could not save word. Please try again.");
        }
    },

    // --- NEW: Add a specific card/sentence to SRS from Flashcards
    addCardToSRS: async (card, deckTitle) => {
        const { currentUser, savedWordsSet } = get();
        if (!currentUser) return;

        const spanish = card.spanish;
        if (!spanish) return;

        // 1. Optimistic Update: Update UI instantly BEFORE waiting for the server
        const previousSet = new Set(savedWordsSet);
        const newSet = new Set(savedWordsSet);
        newSet.add(spanish);
        set({ savedWordsSet: newSet });

        try {
            // 2. Perform the secure network request
            const addCardToSRSCall = httpsCallable(functions, 'addCardToSRS');
            await addCardToSRSCall({ card, deckTitle });
        } catch (error) {
            console.error("Error adding card to SRS:", error);
            // 3. Rollback the UI if the server request fails
            set({ savedWordsSet: previousSet });
            // Optionally show a toast/alert to the user here
        }
    },

    // --- NEW: Advance the SRS stage for a saved word ---
    updateSavedWordProgress: async (wordId) => {
        const { currentUser, savedWordsList, totalXp, activeSession } = get();
        if (!currentUser) return;

        // Backup for potential rollback
        const previousSavedWordsList = [...savedWordsList];
        const previousTotalXp = totalXp;
        const previousSrsXpInSession = activeSession.srsXpInSession || 0;
        const previousSrsWordsToUpdate = activeSession.srsWordsToUpdate || [];
        const previousStandaloneWordsToUpdate = get().standaloneSrsWordsToUpdate || [];
        const previousStandaloneXp = get().standaloneSrsXp || 0;

        try {
            // Optimization: Use local state instead of fetching the doc again
            const wordData = savedWordsList.find(w => w.id === wordId);

            if (wordData) {
                let stage = wordData.stage || 0;
                let nextReviewTime = Date.now();
                const ONE_DAY = 24 * 60 * 60 * 1000;

                // SRS Logic: 1 day -> 3 days -> 1 week -> 2 weeks -> Mastered (Stage 5)
                if (stage === 0) {
                    nextReviewTime += 1 * ONE_DAY;
                    stage = 1;
                } else if (stage === 1) {
                    nextReviewTime += 3 * ONE_DAY;
                    stage = 2;
                } else if (stage === 2) {
                    nextReviewTime += 7 * ONE_DAY;
                    stage = 3;
                } else if (stage === 3) {
                    nextReviewTime += 14 * ONE_DAY;
                    stage = 4;
                } else if (stage >= 4) {
                    stage = 5; // Mastered
                }


                // Optimistic Update: Update local state directly without re-fetching everything
                const newList = savedWordsList.map(w => (
                    w.id === wordId ? { ...w, stage, nextReviewDate: nextReviewTime } : w
                ));

                const xpForSrs = 2;

                if (activeSession.isActive) {
                    set({
                        savedWordsList: newList,
                        totalXp: totalXp + xpForSrs,
                        activeSession: {
                            ...activeSession,
                            srsXpInSession: (activeSession.srsXpInSession || 0) + xpForSrs,
                            srsWordsToUpdate: [...(activeSession.srsWordsToUpdate || []), wordId]
                        }
                    });
                    // NOTE: The network request is now batched and sent in `advanceSessionStep`.
                } else {
                    set(state => ({
                        savedWordsList: newList,
                        totalXp: totalXp + xpForSrs,
                        standaloneSrsWordsToUpdate: [...(state.standaloneSrsWordsToUpdate || []), wordId],
                        standaloneSrsXp: (state.standaloneSrsXp || 0) + xpForSrs
                    }));
                }
            }
        } catch (error) {
            console.error("Error updating word progress:", error);

            // Rollback UI if the server request fails
            set({ savedWordsList: previousSavedWordsList, totalXp: previousTotalXp, activeSession: { ...activeSession, srsXpInSession: previousSrsXpInSession, srsWordsToUpdate: previousSrsWordsToUpdate } });
            alert("Could not update progress. Please try again.");
        }
    },

    // --- NEW: Reset the SRS stage if forgot ---
    resetSavedWordProgress: async (wordId) => {
        const { currentUser, savedWordsList } = get();
        if (!currentUser) return;

        // Backup for potential rollback
        const previousSavedWordsList = [...savedWordsList];

        try {
            // Reset to stage 0, due immediately
            const now = Date.now();

            // Optimistic Update
            const newList = savedWordsList.map(w =>
                w.id === wordId ? { ...w, stage: 0, nextReviewDate: now } : w
            );
            set({ savedWordsList: newList });

            // Perform the secure network request
            const resetProgressCall = httpsCallable(functions, 'resetSavedWordProgress');
            await resetProgressCall({ wordId });
        } catch (error) {
            console.error("Error resetting word progress:", error);

            // Rollback UI if the server request fails
            set({ savedWordsList: previousSavedWordsList });
            alert("Could not reset progress. Please try again.");
        }
    },

    // --- NEW: Action to build the virtual deck for flashcards ---
    prepareTrainingDeck: async (wordsToStudy) => {
        set({ isLoading: true });
        const { savedWordsList } = get();
        const savedMap = new Map(savedWordsList.map(w => [w.id, w]));
        const translations = new Map();
        const chunks = [];

        // Chunk the words for Firestore 'in' query
        for (let i = 0; i < wordsToStudy.length; i += 30) {
            chunks.push(wordsToStudy.slice(i, i + 30));
        }

        // Fetch translations for all words in the training deck
        for (const chunk of chunks) {
            const q = query(
                collection(db, "dictionary"),
                where(documentId(), 'in', chunk)
            );

            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                const dictData = doc.data();
                translations.set(doc.id, {
                    translation: dictData.english || dictData.translation,
                    examples: dictData.examples || []
                });
            });
        }

        // Build the deck object in the format your LessonsView expects
        const trainingCards = wordsToStudy.map(word => {
            const savedData = savedMap.get(word);
            const dictEntry = translations.get(word);
            return {
                spanish: word,
                english: savedData?.translation || (typeof dictEntry === 'object' ? dictEntry.translation : dictEntry) || "No translation found",
                examples: (typeof dictEntry === 'object' ? dictEntry.examples : []),
                vocab: savedData?.vocab,
                source: savedData?.source,
                id: word
            };
        });

        const virtualDeck = {
            title: "Spaced Repetition Training",
            description: "Practice all the words you've saved.",
            cards: trainingCards
        };

        set({ trainingDeck: virtualDeck, isLoading: false });
    },

    updateListeningPreference: async (pref) => {
        const { currentUser, listeningPreference } = get();
        if (!currentUser) return;

        // Backup for potential rollback
        const previousPreference = listeningPreference;

        try {
            // Optimistic update
            set({ listeningPreference: pref });

            // Perform secure network request
            const updatePrefCall = httpsCallable(functions, 'updateListeningPreference');
            await updatePrefCall({ preference: pref });
        } catch (error) {
            console.error("Error updating listening preference: ", error);
            // Rollback UI if the server request fails
            set({ listeningPreference: previousPreference });
            alert("Could not update preference. Please try again.");
        }
    },

    signUpWithEmail: async (email, password) => {
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            await sendEmailVerification(userCredential.user);
        } catch (error) {
            console.error("Error during signUpWithEmail:", error);
            throw error;
        }

        try {
            const verifyAuthFlowCall = httpsCallable(functions, 'verifyAuthFlow');
            await verifyAuthFlowCall({ isSignUpFlow: true });
        } catch (error) {
            console.error("Server-side sign-up verification failed:", error);
            await signOut(auth);
            throw error;
        }
    },

    signInWithEmail: async (email, password) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (error) {
            console.error("Error during signInWithEmail:", error);
            throw error;
        }

        try {
            const verifyAuthFlowCall = httpsCallable(functions, 'verifyAuthFlow');
            await verifyAuthFlowCall({ isSignUpFlow: false });
        } catch (error) {
            console.error("Server-side sign-in verification failed:", error);
            await signOut(auth);
            throw error;
        }
    },

    sendPasswordReset: async (email) => {
        try {
            await sendPasswordResetEmail(auth, email);
        } catch (error) {
            console.error("Error sending password reset email:", error);
            throw error;
        }
    },

    signInWithGoogle: async ({ isSignUpFlow = false } = {}) => {
        try {
            await signInWithPopup(auth, provider);
        } catch (error) {
            console.error("Error during signInWithPopup: ", error);
            throw error;
        }

        try {
            const verifyAuthFlowCall = httpsCallable(functions, 'verifyAuthFlow');
            await verifyAuthFlowCall({ isSignUpFlow });
            // Caching the sign-in / sign-up state
        } catch (error) {
            console.error("Server-side sign-in verification failed:", error);
            await signOut(auth); // Clear the local session immediately
            throw error;
        }
    },

    signInWithFacebook: async ({ isSignUpFlow = false } = {}) => {
        try {
            await signInWithPopup(auth, facebookProvider);
        } catch (error) {
            console.error("Error during signInWithPopup (Facebook): ", error);
            throw error;
        }

        try {
            const verifyAuthFlowCall = httpsCallable(functions, 'verifyAuthFlow');
            await verifyAuthFlowCall({ isSignUpFlow });
            // Caching the sign-in / sign-up state
        } catch (error) {
            console.error("Server-side Facebook sign-in verification failed:", error);
            await signOut(auth); // Clear the local session immediately
            throw error;
        }
    },

    signOutUser: async () => {
        try { await signOut(auth); } catch (error) { console.error("Error during sign-out: ", error); }
    },

    initializeUserData: async (user, isPremium) => {
        if (!user || !user.emailVerified) return;

        // Fetch daily limits if not premium
        if (!isPremium) {
            const today = new Date().toLocaleDateString('en-CA');
            const limitRef = doc(db, 'users', user.uid, 'daily_limits', 'speak');
            try {
                const docSnap = await getDoc(limitRef);
                if (docSnap.exists() && docSnap.data().date === today) {
                    set({ interactionCount: docSnap.data().count || 0 });
                } else {
                    set({ interactionCount: 0 });
                }
            } catch (err) {
                console.error("Error fetching daily limits:", err);
            }
        }

        // Fetch finished articles
        try {
            await get().fetchFinishedArticles();
        } catch (err) {
            console.error("Error fetching finished articles:", err);
        }

        // Sync timezone
        const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const userDocRef = doc(db, 'users', user.uid);
        try {
            const userDocSnap = await getDoc(userDocRef);
            const userData = userDocSnap.exists() ? userDocSnap.data() : null;
            if (userData && (!userData.timezone || userData.timezone !== browserTimezone)) {
                const updateUserTimezoneCall = httpsCallable(functions, 'updateUserTimezone');
                await updateUserTimezoneCall({ timezone: browserTimezone });
            }
        } catch (err) {
            console.error("Failed to sync timezone post-verification:", err);
        }
    },

    checkEmailVerification: async () => {
        if (auth.currentUser) {
            await auth.currentUser.reload();
            set({
                currentUser: auth.currentUser,
                authTrigger: Date.now()
            });

            if (auth.currentUser.emailVerified) {
                const { isAdmin, hasActiveSubscription } = get();
                const isPremium = isAdmin || hasActiveSubscription;
                await get().initializeUserData(auth.currentUser, isPremium);
            }
        }
    },

    deleteUserAccount: async () => {
        const { currentUser } = get();
        if (!currentUser) return { success: false, error: 'No user logged in.' };
        try {
            await deleteUser(currentUser);
            return { success: true };
        } catch (error) {
            console.error("Error deleting user account:", error);
            if (error.code === 'auth/requires-recent-login') {
                return { success: false, requiresRecentLogin: true };
            }
            return { success: false, error: error.message };
        }
    },

    fetchDecks: async () => {
        const { isDecksLoading, decksLoaded } = get();
        // Prevent double fetch if already loading or already fetched
        if (isDecksLoading || decksLoaded) return;

        set({ isLoading: true, isDecksLoading: true });
        try {
            const decksCollection = collection(db, 'decks');
            const deckSnapshot = await getDocs(decksCollection);
            const decksData = {};
            deckSnapshot.forEach(doc => { decksData[doc.id] = doc.data(); });
            set({ decks: decksData, isLoading: false, isDecksLoading: false, decksLoaded: true });
        } catch (error) {
            console.error("Error fetching decks: ", error);
            set({ isLoading: false, isDecksLoading: false, decksLoaded: true });
        }
    },

    // --- NEW: Fetch aggregated user stats for Admin Panel ---
    fetchUserStats: async () => {
        const { isAdmin, currentUser, isUsersLoading, userStatsLoaded } = get();
        if (!isAdmin || !currentUser || isUsersLoading || userStatsLoaded) return;

        set({ isUsersLoading: true });
        try {
            const fetchStatsCall = httpsCallable(functions, 'getUserStats');
            const result = await fetchStatsCall();
            set({
                userStats: { total: result.data.totalUsers, premium: result.data.premiumUsers },
                isUsersLoading: false,
                userStatsLoaded: true
            });
        } catch (error) {
            console.error("Error fetching user stats: ", error);
            set({ isUsersLoading: false });
        }
    },

    fetchStripeProducts: async () => {
        const { stripeProducts, isProductsLoading } = get();
        if (stripeProducts.length > 0 || isProductsLoading) return;

        set({ isProductsLoading: true });
        try {
            const productsCol = collection(db, 'products');
            const productsSnap = await getDocs(productsCol);

            const productsList = [];
            for (const docObj of productsSnap.docs) {
                const productData = docObj.data();

                // Fetch only active prices under this product
                const pricesCol = collection(db, 'products', docObj.id, 'prices');
                const pricesSnap = await getDocs(query(pricesCol, where('active', '==', true)));

                const prices = pricesSnap.docs.map(priceDoc => {
                    const priceData = priceDoc.data();
                    return {
                        id: priceDoc.id,
                        ...priceData
                    };
                });

                // Only include the product if it has at least one active pricing plan
                if (prices.length > 0) {
                    productsList.push({
                        id: docObj.id,
                        ...productData,
                        prices
                    });
                }
            }

            set({ stripeProducts: productsList, isProductsLoading: false });
        } catch (error) {
            console.error("Error fetching Stripe products/prices from Firestore:", error);
            set({ isProductsLoading: false });
        }
    },

    // --- MODIFIED: fetchArticles now checks version numbers ---
    fetchArticles: async () => {
        const { isArticlesLoading, articles } = get();
        if (isArticlesLoading || (articles && Object.keys(articles).length > 0)) return;

        set({ isLoading: true, isArticlesLoading: true });
        const cache = getCache();

        try {
            // 1. Fetch the remote metadata version
            const metadataRef = doc(db, 'appInfo', 'metadata');
            const metadataSnap = await getDoc(metadataRef);
            const remoteArticlesVersion = metadataSnap.exists() ? metadataSnap.data().articlesVersion : 1;

            // 2. Compare with local cached version
            const localArticlesVersion = cache.articlesVersion || 0;

            if (cache.articles && localArticlesVersion === remoteArticlesVersion && isCacheValid(cache.articles.timestamp)) {
                // Cache is valid and version matches, use cache
                set({ articles: cache.articles.data, isLoading: false, isArticlesLoading: false });
                return;
            }

            // 3. Cache is stale or invalid. Fetch from Firestore.
            const articlesCollection = collection(db, 'articles');
            const articleSnapshot = await getDocs(articlesCollection);
            const articlesData = {};
            articleSnapshot.forEach(doc => {
                articlesData[doc.id] = doc.data();
            });

            // 4. Save new data and the new version number to cache
            cache.articles = {
                timestamp: Date.now(),
                data: articlesData
            };
            cache.articlesVersion = remoteArticlesVersion; // Save the new version
            setCache(cache);

            set({ articles: articlesData, isLoading: false, isArticlesLoading: false });

        } catch (error) {
            console.error("Error fetching articles: ", error);
            // Fallback to cache if network fails but cache exists
            if (cache.articles) {
                set({ articles: cache.articles.data, isLoading: false, isArticlesLoading: false });
            } else {
                set({ isLoading: false, isArticlesLoading: false });
            }
        }
    },

    fetchScenarios: async () => {
        // Cache check: if we already have scenarios, don't re-fetch
        // Also check isScenariosLoading to prevent double-fetch in Strict Mode
        if (get().scenarios.length > 0 || get().isScenariosLoading) return;

        set({ isScenariosLoading: true });
        try {
            // --- OPTIMIZATION: Fetch scenarios and prompts in parallel ---
            const [scenariosSnapshot, promptsDoc] = await Promise.all([
                getDocs(collection(db, 'scenarios')),
                getDoc(doc(db, 'appInfo', 'aiPrompts'))
            ]);

            const fetchedScenarios = scenariosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            let instructions = '';
            if (promptsDoc.exists()) {
                instructions = promptsDoc.data().scenariosAiInstructions || '';
                if (instructions === '') {
                    console.warn("AI instructions are missing! Please add them in Firestore under appInfo/aiPrompts to fully use the Scenarios feature.");
                }
            }

            set({ scenarios: fetchedScenarios, scenariosAiInstructions: instructions, isScenariosLoading: false });
        } catch (error) {
            console.error("Error fetching scenarios:", error);
            set({ isScenariosLoading: false });
        }
    },


    // --- NEW: Fetch translation for a single word on demand ---
    fetchTranslationForWord: async (word) => {
        if (!word) return;
        // Clean the word to ensure we match the dictionary key format
        const normalizedWord = word.toLowerCase().replace(/[^\p{L}]/gu, '');
        if (!normalizedWord) return;

        const { activeArticleTranslations } = get();

        // If we already have it in memory, skip the network request
        if (activeArticleTranslations.has(normalizedWord)) return;

        try {
            const wordRef = doc(db, 'dictionary', normalizedWord);
            const wordSnap = await getDoc(wordRef);

            const dictData = wordSnap.data();
            const translation = wordSnap.exists()
                ? {
                    translation: dictData.english || dictData.translation,
                    examples: dictData.examples || []
                }
                : "No translation found";

            set(state => {
                const newMap = new Map(state.activeArticleTranslations);
                newMap.set(normalizedWord, translation);
                return { activeArticleTranslations: newMap };
            });
        } catch (error) {
            console.error("Error fetching translation for word:", word, error);
        }
    },

    // --- NEW: Fetch all translations for admin to highlight missing words ---
    fetchArticleTranslationsForAdmin: async (articleText) => {
        if (!articleText) return;
        const { activeArticleTranslations } = get();

        const matchedWords = articleText.toLowerCase().match(/[\p{L}]+/gu);
        const uniqueWords = [...new Set(matchedWords || [])];

        // Filter words that are not yet in the map
        const wordsToFetch = uniqueWords.filter(w => !activeArticleTranslations.has(w));

        if (wordsToFetch.length === 0) return;

        const chunks = [];
        for (let i = 0; i < wordsToFetch.length; i += 30) {
            chunks.push(wordsToFetch.slice(i, i + 30));
        }

        // Optimistic update: assume missing until found
        const newTranslations = new Map(activeArticleTranslations);
        wordsToFetch.forEach(w => newTranslations.set(w, "No translation found"));

        for (const chunk of chunks) {
            const q = query(
                collection(db, "dictionary"),
                where(documentId(), 'in', chunk)
            );

            const querySnapshot = await getDocs(q);
            querySnapshot.forEach((doc) => {
                const dictData = doc.data();
                newTranslations.set(doc.id, {
                    translation: dictData.english || dictData.translation,
                    examples: dictData.examples || []
                });
            });
        }

        set({ activeArticleTranslations: newTranslations });
    },

    fetchArticleById: async (articleId) => {
        const { loadingArticleId } = get();
        if (loadingArticleId === articleId) return;

        set({ isLoading: true, loadingArticleId: articleId, activeArticleTranslations: new Map() });
        const cache = getCache();

        try {
            // 1. Fetch metadata to check if article cache is valid
            const metadataRef = doc(db, 'appInfo', 'metadata');
            const metadataSnap = await getDoc(metadataRef);
            const remoteArticlesVersion = metadataSnap.exists() ? metadataSnap.data().articlesVersion : 1;

            const cachedDetail = cache.articleDetail[articleId];
            const localArticlesVersion = cache.articlesVersion || 0;

            // 2. Check cache validity
            if (cachedDetail && localArticlesVersion === remoteArticlesVersion && isCacheValid(cachedDetail.timestamp)) {
                const articleData = cachedDetail.data;
                const translations = deserializeMap(cachedDetail.translations);

                set((state) => {
                    const updates = {
                        articles: { ...state.articles, [articleId]: articleData },
                        activeArticleTranslations: translations,
                    };
                    if (state.loadingArticleId === articleId) {
                        updates.isLoading = false;
                        updates.loadingArticleId = null;
                    }
                    return updates;
                });
                return;
            }

            // 3. Cache is stale, fetch from Firestore
            const articleRef = doc(db, 'articles', articleId);
            const articleSnap = await getDoc(articleRef);

            if (articleSnap.exists()) {
                const articleData = articleSnap.data();

                // Reset translations map for the new article
                set({ activeArticleTranslations: new Map() });
                const translations = new Map();

                // 4. Save new data to cache
                cache.articleDetail[articleId] = {
                    timestamp: Date.now(),
                    data: articleData,
                    translations: serializeMap(translations)
                };
                // Ensure the main cache version is also updated
                cache.articlesVersion = remoteArticlesVersion;
                setCache(cache);

                set((state) => {
                    const updates = {
                        articles: { ...state.articles, [articleId]: articleData },
                    };
                    if (state.loadingArticleId === articleId) {
                        updates.isLoading = false;
                        updates.loadingArticleId = null;
                    }
                    return updates;
                });
            } else {
                console.error("No such article found!");
                set((state) => state.loadingArticleId === articleId ? { isLoading: false, loadingArticleId: null } : {});
            }
        } catch (error) {
            console.error("Error fetching single article: ", error);
            set((state) => state.loadingArticleId === articleId ? { isLoading: false, loadingArticleId: null } : {});
        }
    },

    saveDeckProgress: async (deckId, score, total) => {
        const { currentUser, deckProgress } = get();
        if (!currentUser || !deckId) return;

        const percentage = total > 0 ? Math.round((score / total) * 100) : 100;

        // Optimistic local state update
        const updatedProgress = {
            ...deckProgress,
            [deckId]: {
                percentage,
                score,
                total,
                updatedAt: new Date().toISOString()
            }
        };

        set({ deckProgress: updatedProgress, progress: updatedProgress });

        try {
            const saveProgressCall = httpsCallable(functions, 'saveDeckProgress');
            await saveProgressCall({ deckId, score, total });
        } catch (error) {
            console.error("Error saving deck progress via Cloud Function: ", error);
        }
    },

    saveDeck: async (deckData, deckId) => {
        try {
            const saveDeckCall = httpsCallable(functions, 'saveDeck');
            await saveDeckCall({ deckData, deckId });

            // Optionally force clear the decks cache here if fetchDecks isn't updating it
            set({ decks: {} });
            await get().fetchDecks();
        } catch (error) {
            console.error("Error saving deck: ", error);
            alert("Failed to save deck. Please try again.");
        }
    },

    saveArticle: async (articleData, articleId) => {
        try {
            const saveArticleCall = httpsCallable(functions, 'saveArticle');
            await saveArticleCall({ articleData, articleId });

            // Invalidate caches so the UI fetches the fresh article
            const cache = getCache();
            if (articleId && cache.articleDetail) {
                delete cache.articleDetail[articleId];
            }
            cache.articlesVersion = 0; // Force-invalidate the main article list
            setCache(cache);

            // Clear memory state so it forces a re-fetch
            set({ articles: {} });
            await get().fetchArticles();
        } catch (error) {
            console.error("Error saving article: ", error);
            alert("Failed to save article. Please try again.");
        }
    },

    saveWord: async (wordData) => {
        try {
            const saveWordCall = httpsCallable(functions, 'saveWord');
            await saveWordCall({ wordData });
        } catch (error) {
            console.error("Error saving word: ", error);
            alert("Failed to save word.");
        }
    },
    // --- MODIFIED: This now also invalidates the article list cache ---
    saveWordTranslation: async (spanishWord, newTranslation) => {
        // ... (admin check is the same) ...
        if (!get().isAdmin) {
            console.error("User is not authorized to perform this action.");
            alert("You do not have permission to edit the dictionary.");
            return;
        }
        try {
            const saveWordCall = httpsCallable(functions, 'saveWord');
            await saveWordCall({ wordData: { spanish: spanishWord, translation: newTranslation } });

            set(state => {
                const newTranslations = new Map(state.activeArticleTranslations);
                newTranslations.set(spanishWord, newTranslation);
                return { activeArticleTranslations: newTranslations };
            });

            // --- MODIFIED: Invalidate all caches on edit ---
            const cache = getCache();
            cache.articleDetail = {}; // Clear all detailed article caches
            cache.articlesVersion = 0; // Force-invalidate the main article list
            setCache(cache);

        } catch (error) {
            console.error("Error saving word translation: ", error);
            alert("Failed to save translation. Please try again.");
        }
    },
}));
