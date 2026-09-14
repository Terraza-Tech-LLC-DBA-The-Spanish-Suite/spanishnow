import React, { useEffect, useRef, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';

// Import the store and our components
import { useDecksStore } from './store';
import Header from './components/Header';
import Navigation from './components/Navigation';
import LandingPage from './components/LandingPage';
import StreakNotification from './components/StreakNotification';


// Lazy load components to improve initial load time
const FlashcardView = lazy(() => import('./components/FlashcardView'));
const DeckForm = lazy(() => import('./components/DeckForm'));
const AccountPage = lazy(() => import('./components/AccountPage'));
const ListeningView = lazy(() => import('./components/ListeningView'));
const SessionManager = lazy(() => import('./components/SessionManager'));
const TopicManager = lazy(() => import('./components/TopicManager'));
const ArticleForm = lazy(() => import('./components/ArticleForm'));
const ReaderView = lazy(() => import('./components/ReaderView'));
const DictionaryManager = lazy(() => import('./components/DictionaryManager'));
const ReadingLibrary = lazy(() => import('./components/ReadingLibrary'));
const SpeakCompanion = lazy(() => import('./components/SpeakCompanion'));
const Booking = lazy(() => import('./components/Booking'));
const Review = lazy(() => import('./components/Review'));
const Flashcards = lazy(() => import('./components/Flashcards'));
const LessonFlow = lazy(() => import('./components/LessonFlow'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./components/TermsOfService'));
const DeleteAccountPage = lazy(() => import('./components/DeleteAccountPage'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const VerifyEmailPage = lazy(() => import('./components/VerifyEmailPage'));
const LearningJourney = lazy(() => import('./components/LearningJourney'));

// This component is the main layout for authenticated (logged-in) users.
const AppLayout = () => {
    const { decks, isDecksLoading, decksLoaded, fetchDecks, fetchUserProgress } = useDecksStore();
    const location = useLocation(); // Hook to get the current URL path

    // Define routes that require decks to be loaded
    const deckRoutes = ['/', '/decks', '/create', '/review', '/listen', '/edit', '/admin', '/lesson', '/journey'];
    const shouldLoadDecks = deckRoutes.some(route => route === '/' ? location.pathname === '/' : location.pathname.startsWith(route));

    const isSpeakActive = location.pathname.includes('/speakCompanion/session');
    const isReviewTraining = location.pathname.startsWith('/review/training');
    // hides navgation and header for lesson flow, speak companion practice sessions, and review training sessions
    const isLessonRoute = location.pathname.startsWith('/lesson') || isSpeakActive || isReviewTraining;

    useEffect(() => {
        if (shouldLoadDecks) {
            fetchDecks();
            fetchUserProgress(); // Lazy load progress only when needed
        }
    }, [shouldLoadDecks, fetchDecks, fetchUserProgress]);

    if (shouldLoadDecks && (!decksLoaded || isDecksLoading)) {
        return <h1 className="text-4xl font-bold text-sky-800 mb-8 text-center p-8">Loading...</h1>;
    }

    return (
        <div className="w-full dark:text-gray-200 max-w-2xl flex flex-col min-h-[calc(100vh-2rem)]">
            <StreakNotification />
            {!isLessonRoute && <Header />}
            <main className={`w-full text-gray-800 dark:bg-gray-800 dark:text-gray-200 p-2 rounded-lg shadow-inner flex-grow ${isLessonRoute ? '' : 'pb-24'} flex flex-col`}>
                <div className="w-full max-w-xl mx-auto flex flex-col flex-grow">
                    <Suspense fallback={<div className="text-center p-8">Loading...</div>}>
                        <Routes>
                            <Route path="/" element={<AccountPage decks={decks} />} />
                            <Route path="/reading-library" element={<ReadingLibrary />} />
                            <Route path="/create" element={<DeckForm decks={decks} />} />
                            <Route path="/review/:deckId" element={<FlashcardView />} />
                            <Route path="/spaced-repetition" element={<Review />} />
                            <Route path="/listen/:deckId" element={<ListeningView decks={decks} />} />
                            <Route path="/reading/:articleId" element={<ReaderView />} />
                            <Route path="/speakCompanion" element={<SpeakCompanion />} />
                            <Route path="/speakCompanion/:scenarioId" element={<SpeakCompanion />} />
                            <Route path="/speakCompanion/session/:scenarioId/:roleIndex" element={<SpeakCompanion />} />
                            <Route path="/booking" element={<Booking />} />
                            {/* <Route path="/decks" element={<Flashcards decks={decks} />} /> */}
                            {/* <Route path="/decks/:deckId" element={<SessionManager />} /> */}
                            {/* --- NEW: Admin Route --- */}
                            <Route path="/admin" element={<TopicManager decks={decks} />} />
                            <Route path="*" element={<Navigate to="/" replace />} />
                            <Route path="/admin/create-article" element={<ArticleForm />} />
                            <Route path="/admin/edit-article/:articleId" element={<ArticleForm />} />
                            <Route path="/edit/:deckId" element={<DeckForm decks={decks} />} />
                            <Route path="/admin/dictionary" element={<DictionaryManager />} />
                            <Route path="/lesson" element={<LessonFlow />} />
                            <Route path="/journey" element={<LearningJourney />} />
                        </Routes>
                    </Suspense>
                </div>
            </main>
            {!isLessonRoute && <Navigation />}
        </div>
    );
};

// The main App component that controls everything
export default function App() {
    const { currentUser, listenForAuthChanges } = useDecksStore();
    const navigate = useNavigate();
    const prevUserRef = useRef(currentUser);
    const theme = useDecksStore((state) => state.theme);


    useEffect(() => {
        const unsubscribe = listenForAuthChanges();
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    useEffect(() => {
        if (!prevUserRef.current && currentUser) {
            navigate('/');
        }
        prevUserRef.current = currentUser;
    }, [currentUser, navigate]);

    useEffect(() => {
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light');
        } else {
            document.documentElement.classList.add('light');
            document.documentElement.classList.remove('dark');
        }
    }, [theme]);

    return (
        <div className="dark:bg-gray-900 text-gray-800 dark:text-gray-200 min-h-screen flex flex-col items-center justify-top font-sans p-4">
            <Routes>
                {/* Public Legal Routes */}
                <Route path="/privacy" element={
                    <Suspense fallback={<div className="text-center p-8">Loading...</div>}>
                        <PrivacyPolicy />
                    </Suspense>
                } />
                <Route path="/terms" element={
                    <Suspense fallback={<div className="text-center p-8">Loading...</div>}>
                        <TermsOfService />
                    </Suspense>
                } />
                <Route path="/delete-account" element={
                    <Suspense fallback={<div className="text-center p-8">Loading...</div>}>
                        <DeleteAccountPage />
                    </Suspense>
                } />

                {/* Auth-gated Routes */}
                {currentUser ? (
                    !currentUser.emailVerified ? (
                        <>
                            <Route path="/verify-email" element={
                                <Suspense fallback={<div className="text-center p-8">Loading...</div>}>
                                    <VerifyEmailPage />
                                </Suspense>
                            } />
                            <Route path="*" element={<Navigate to="/verify-email" replace />} />
                        </>
                    ) : (
                        <Route path="/*" element={<AppLayout />} />
                    )
                ) : (
                    <>
                        <Route path="/login" element={
                            <Suspense fallback={<div className="text-center p-8">Loading...</div>}>
                                <LoginPage />
                            </Suspense>
                        } />
                        <Route path="*" element={<LandingPage />} />
                    </>
                )}
            </Routes>
        </div>
    );
}
