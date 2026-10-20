import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, NavLink, useLocation } from 'react-router-dom';
import { useDecksStore } from '../store';
import { db, functions } from '../firebase';
import { collection, addDoc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { CircularProgress } from './SpeakCompanion'; // Assuming CircularProgress is still used elsewhere or will be.
import { BsCheckCircleFill } from 'react-icons/bs';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FaArrowCircleRight, FaFire } from 'react-icons/fa';

const AccountPage = ({ decks }) => {
    const navigate = useNavigate();
    const location = useLocation();

    const currentUser = useDecksStore((state) => state.currentUser);
    {/* Fetch Scenarios */ }
    const scenarios = useDecksStore((state) => state.scenarios);
    const userProgress = useDecksStore((state) => state.speakProgress);
    const fetchScenarios = useDecksStore((state) => state.fetchScenarios);
    const fetchSpeakProgress = useDecksStore((state) => state.fetchSpeakProgress);
    {/* Fetch everything for articles */ }
    const fetchArticles = useDecksStore((state) => state.fetchArticles);
    const articles = useDecksStore((state) => state.articles);

    const finishedArticles = useDecksStore((state) => state.finishedArticles);
    const xpHistory = useDecksStore((state) => state.xpHistory);
    const totalXp = useDecksStore((state) => state.totalXp);
    const fetchXpHistory = useDecksStore((state) => state.fetchXpHistory);
    const streak = useDecksStore((state) => state.streak);

    {/* fetch SRS */ }
    const savedWordsList = useDecksStore((state) => state.savedWordsList);
    const prepareTrainingDeck = useDecksStore((state) => state.prepareTrainingDeck);
    {/* Fetch settings */ }
    const listeningPreference = useDecksStore((state) => state.listeningPreference);
    const updateListeningPreference = useDecksStore((state) => state.updateListeningPreference);
    const theme = useDecksStore((state) => state.theme);
    const toggleTheme = useDecksStore((state) => state.toggleTheme);

    const isAdmin = useDecksStore((state) => state.isAdmin);
    const hasActiveSubscription = useDecksStore((state) => state.hasActiveSubscription);
    const isPremium = isAdmin || hasActiveSubscription;
    const startSession = useDecksStore((state) => state.startSession);

    // --- NEW: Account Deletion State ---
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deleteConfirmation, setDeleteConfirmation] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const deleteUserAccount = useDecksStore((state) => state.deleteUserAccount);
    const signOutUser = useDecksStore((state) => state.signOutUser);

    // --- Active Level State ---
    const [userActiveLevel, setUserActiveLevel] = useState(() => {
        return localStorage.getItem('user_active_level') || 'A1';
    });

    useEffect(() => {
        const storedLevel = localStorage.getItem('user_active_level') || 'A1';
        setUserActiveLevel(storedLevel);
    }, [location.pathname]);

    // --- Stripe Payments Integration State ---
    const fetchStripeProducts = useDecksStore((state) => state.fetchStripeProducts);
    const stripeProducts = useDecksStore((state) => state.stripeProducts);
    const isProductsLoading = useDecksStore((state) => state.isProductsLoading);
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [portalLoading, setPortalLoading] = useState(false);

    const handleUpgrade = async (priceId) => {
        if (checkoutLoading) return;
        setCheckoutLoading(true);
        try {
            const checkoutSessionsRef = collection(db, 'users', currentUser.uid, 'checkout_sessions');
            const docRef = await addDoc(checkoutSessionsRef, {
                price: priceId,
                allow_promotion_codes: true,
                success_url: window.location.origin + '/?checkout=success',
                cancel_url: window.location.origin + '/?checkout=cancel'
            });

            // Listen for the redirect URL to be written by the Stripe extension
            const unsubscribeDoc = onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    if (data.url) {
                        unsubscribeDoc();
                        window.location.href = data.url;
                    } else if (data.error) {
                        unsubscribeDoc();
                        console.error("Stripe session creation error:", data.error);
                        alert(`Stripe Error: ${data.error.message || 'Failed to initiate checkout.'}`);
                        setCheckoutLoading(false);
                    }
                }
            });
        } catch (error) {
            console.error("Error creating checkout session:", error);
            alert("Failed to start upgrade flow. Please try again.");
            setCheckoutLoading(false);
        }
    };

    const handleManageSubscription = async () => {
        if (portalLoading) return;
        setPortalLoading(true);
        try {
            const createPortalLink = httpsCallable(functions, 'ext-firestore-stripe-payments-createPortalLink');
            const { data } = await createPortalLink({
                returnUrl: window.location.origin + '/accountPage'
            });

            if (data?.url) {
                window.location.href = data.url;
            } else {
                throw new Error("No billing portal URL was returned.");
            }
        } catch (error) {
            console.error("Error opening billing portal:", error);
            alert(`Failed to open billing portal: ${error.message || 'Please try again.'}`);
            setPortalLoading(false);
        }
    };

    {/* --- Calculate the sentences and words read on the finished articles --- */ }
    const { wordsRead, sentencesRead, articlesRead } = useMemo(() => {
        let wordCount = 0;
        let sentenceCount = 0;
        let articleCount = 0;
        Object.entries(articles).forEach(([key, article]) => {
            if (finishedArticles.has(key) && article.sentences) {
                sentenceCount += article.sentences.length;
                articleCount++;
                article.sentences.forEach(sentence => {
                    if (sentence.spanish && sentence.spanish.trim()) {
                        wordCount += sentence.spanish.trim().split(/\s+/).length;
                    }
                });
            }
        });
        return { wordsRead: wordCount, sentencesRead: sentenceCount, articlesRead: articleCount };
    }, [articles, finishedArticles]);

    {/* --- NEW: Calculate completed scenarios --- */ }
    const scenariosCompleted = useMemo(() => {
        let count = 0;
        scenarios.forEach(scenario => {
            const completedCount = userProgress[scenario.id]?.length || 0;
            const totalCount = scenario.rolePlays ? scenario.rolePlays.length : 0;
            const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
            if (progressPercent === 100 && totalCount > 0) {
                count++;
            }
        });
        return count;
    }, [scenarios, userProgress]);

    const levelOrder = { 'A1': 1, 'A2': 2, 'B1': 3, 'B2': 4, 'C1': 5, 'C2': 6 };
    const getLevelValue = (level) => levelOrder[level?.toUpperCase()] || 99;

    const nextArticle = useMemo(() => {
        const availableArticles = Object.entries(articles)
            .map(([id, data]) => ({ id, ...data }))
            .filter(article => !finishedArticles.has(article.id))
            .filter(article => isPremium || !article.premium)
            .sort((a, b) => {
                const diff = getLevelValue(a.level) - getLevelValue(b.level);
                if (diff !== 0) return diff;
                return (a.title || "").localeCompare(b.title || "");
            });

        return availableArticles.length > 0 ? availableArticles[0] : null;
    }, [articles, finishedArticles, isPremium]);

    const handlePreferenceChange = (e) => {
        const newPreference = e.target.value;
        updateListeningPreference(newPreference);
    };

    // --- NEW: Handle Account Deletion ---
    const handleDeleteAccount = async () => {
        if (deleteConfirmation.toLowerCase() !== 'delete') return;
        setIsDeleting(true);
        const result = await deleteUserAccount();

        if (result.success) {
            // Firebase automatically triggers onAuthStateChanged which handles the logout
            setShowDeleteModal(false);
        } else if (result.requiresRecentLogin) {
            alert("For security reasons, you must have logged in recently to delete your account. You will now be logged out. Please log back in and try again.");
            setShowDeleteModal(false);
            signOutUser();
        } else {
            alert(`Error deleting account: ${result.error}`);
            setIsDeleting(false);
        }
    };

    // Fetch Scenarios and Goals from Firestore
    useEffect(() => {
        fetchScenarios();
        fetchSpeakProgress();
        fetchXpHistory();
    }, [fetchScenarios, fetchSpeakProgress, fetchXpHistory]);

    useEffect(() => {
        if (!isPremium) {
            fetchStripeProducts();
        }
    }, [isPremium, fetchStripeProducts]);

    useEffect(() => {
        const lastFetch = sessionStorage.getItem('articles_last_fetch');
        const now = Date.now();
        const ONE_DAY = 24 * 60 * 60 * 1000;

        // Fetch if we have no articles, OR if there's no fetch history, OR if 1 day has passed
        if (Object.keys(articles).length === 0 || !lastFetch || (now - parseInt(lastFetch, 10) > ONE_DAY)) {
            fetchArticles();
            sessionStorage.setItem('articles_last_fetch', now.toString());
        }
    }, [fetchArticles]);

    useEffect(() => {
        if (location.hash === '#premium' && !isProductsLoading) {
            const timer = setTimeout(() => {
                const element = document.getElementById('premium-section');
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isProductsLoading, location.hash]);

    const weeklyXpData = useMemo(() => {
        const data = [];
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const day = new Date(today);
            day.setDate(today.getDate() - i);

            const dateString = day.toLocaleDateString('en-CA'); // YYYY-MM-DD format
            const dayName = day.toLocaleDateString('en-US', { weekday: 'short' });

            const xp = xpHistory[dateString] || 0;
            data.push({ name: dayName, xp });
        }
        return data;
    }, [xpHistory]);

    // Filter words that are due for review
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    const endOfToday = today.getTime();

    const dueWords = savedWordsList.filter(w => {
        if (w.stage >= 5) return false; // Mastered words are done
        if (!w.nextReviewDate) return true; // Legacy/New words are due
        return w.nextReviewDate <= endOfToday;
    });

    const handleStartReview = async () => {
        if (dueWords.length === 0) return;
        // Take up to 5 words for the quick review session
        const wordsToReview = dueWords.slice(0, 5).map(w => w.id);
        await prepareTrainingDeck(wordsToReview);
        navigate('/review/training');
    };

    // Determine if there are any words due for review to enable/disable the button
    const hasDueWords = dueWords.length > 0;

    // Calculate total words being learned (not mastered)
    const learningWordsCount = savedWordsList.filter(w => w.stage < 5).length;

    if (!currentUser) {
        return <div className="text-center dark:text-gray-300">Loading user data...</div>;
    }

    return (
        <div className="animate-fade-in">
            {/* --- Delete Account Confirmation Modal --- */}
            {showDeleteModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md p-6 relative transform transition-all">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-white mb-4">Delete Account</h2>

                        <div className="space-y-4">
                            <div className="p-3 bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200 rounded-lg font-semibold text-sm border border-red-200 dark:border-red-800">
                                Warning: This action is irreversible. All your progress, XP, streaks, and saved words will be permanently lost.
                            </div>
                            <p className="text-gray-700 dark:text-gray-300 text-sm">
                                To confirm, please type <strong>delete</strong> in the box below:
                            </p>
                            <input
                                type="text"
                                value={deleteConfirmation}
                                onChange={(e) => setDeleteConfirmation(e.target.value)}
                                placeholder="Type 'delete' here..."
                                className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-500"
                                disabled={isDeleting}
                            />
                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => !isDeleting && setShowDeleteModal(false)}
                                    disabled={isDeleting}
                                    className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white font-semibold transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleDeleteAccount}
                                    disabled={deleteConfirmation.toLowerCase() !== 'delete' || isDeleting}
                                    className="px-6 py-2 bg-red-600 text-white font-bold rounded-xl shadow-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {isDeleting ? 'Deleting...' : 'Permanently Delete'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* --- Profile Section --- */}
            <div className="inline-flex items-center bg-white dark:bg-gray-700 p-2 shadow-lg rounded-full my-8 text-left">
                {/* add profile image */}
                <div className="w-12 h-12 rounded-full bg-gray-300 dark:bg-gray-600 shrink-0 mr-4">
                    {currentUser.photoURL ? (
                        <img src={currentUser.photoURL} alt="Profile" className="w-full h-full rounded-full object-cover" />
                    ) : (
                        <div className="w-full h-full rounded-full bg-gray-400 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold">
                            {currentUser.displayName ? currentUser.displayName.charAt(0).toUpperCase() : 'U'}
                        </div>
                    )}
                </div>
                <h1 className="text-3xl sm:text-3xl font-bold text-gray-800 dark:text-gray-200 pr-2">Hi {currentUser.displayName?.split(' ')[0] || 'Spanish Learner'}!</h1>
            </div>

            {nextArticle && (
                <div className="bg-linear-to-r from-red-500 to-purple-500 rounded-xl shadow-lg p-6 mb-8 text-white flex flex-col md:flex-row items-center justify-between gap-4">
                    <div className="text-center md:text-left">
                        <h2 className="text-2xl font-bold mb-2">Ready to learn?</h2>
                        <p className="mb-1 text-blue-100">Your next recommended story is waiting:</p>
                        <p className="font-semibold text-lg">"{nextArticle.title}" <span className="text-sm bg-white/20 px-2 py-0.5 rounded ml-2">{nextArticle.level}</span></p>
                    </div>
                    <div className="relative">
                        <button
                            onClick={() => {
                                startSession(nextArticle.id);
                                navigate('/lesson');
                            }}
                            className="px-6 py-3 bg-white border border-black text-blue-600 font-bold rounded-lg shadow-md hover:bg-gray-100 transition-transform transform hover:scale-105 flex items-center gap-2 whitespace-nowrap"
                        >
                            Start Reading
                        </button>
                        <div className="absolute -top-1 -right-1">
                            <span className="relative flex size-4 ">
                                <span className="absolute inline-flex border border-black h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75"></span>
                                <span className="relative inline-flex size-4 rounded-full bg-yellow-500"></span>
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* --- My Journey --- */}
            {/* <div className="rounded-xl shadow-lg p-6 mb-8 text-white flex flex-col md:flex-row items-center justify-between gap-4 bg-linear-to-r from-green-500 to-amber-500">
                <div className="text-center md:text-left">
                    <h2 className="text-2xl font-bold mb-2">My Journey</h2>
                    <p className="mb-1 text-blue-100">You are currently on section {userActiveLevel}.</p>
                </div>
                <button
                    onClick={() => navigate('/journey')}
                    className="animate-pulse px-6 py-3 bg-white text-blue-600 font-bold rounded-full shadow-md hover:bg-gray-100 transition-transform transform hover:scale-105 flex items-center gap-2 whitespace-nowrap"
                >
                    Keep Learning / Continue Journey <FaArrowCircleRight />
                </button>
            </div> */}

            {/* --- Words Due for Review Section --- */}
            <div className={`rounded-xl shadow-lg p-6 mb-8 text-white flex flex-col md:flex-row items-center justify-between gap-4 ${hasDueWords ? 'bg-linear-to-r from-blue-500 to-teal-500' : 'bg-gray-400 dark:bg-gray-700'}`}>
                <div className="text-center md:text-left">
                    <h2 className="text-2xl font-bold mb-2">Time to Review!</h2>
                    {hasDueWords ? (
                        <p className="mb-1 text-blue-100">You have <span className="font-semibold">{dueWords.length} words</span> due for review.</p>
                    ) : (
                        <p className="mb-1 text-gray-200">No words currently due for review. Keep reading!</p>
                    )}
                </div>
                <div className="relative">
                    <button
                        onClick={handleStartReview}
                        disabled={!hasDueWords}
                        className={`px-6 py-3 bg-white text-blue-600 border border-black font-bold rounded-lg shadow-md hover:bg-gray-100 transition-transform transform hover:scale-105 flex items-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        Review Now ({Math.min(dueWords.length, 5)})
                    </button>
                    {
                        hasDueWords && (
                            <div className="absolute -top-1 -right-1">
                                <span className="relative flex size-4">
                                    <span className="absolute inline-flex border border-black h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75"></span>
                                    <span className="relative inline-flex size-4 rounded-full bg-yellow-500"></span>
                                </span>
                            </div>
                        )
                    }
                </div>
            </div>

            {/* --- Billing & Subscription Section --- */}
            <div id="premium-section" className="bg-white dark:bg-gray-700 p-6 rounded-lg shadow-md mb-8 transition-all hover:shadow-lg">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4 flex items-center gap-2">
                    <span role="img" aria-label="crown">👑</span> Premium Subscription
                </h2>

                {isPremium ? (
                    <div>
                        <div className="bg-linear-to-r from-yellow-500/20 to-amber-500/20 dark:from-yellow-500/10 dark:to-amber-500/10 border border-yellow-300 dark:border-yellow-600/30 rounded-xl p-4 mb-4">
                            <p className="text-gray-800 dark:text-gray-200 font-semibold mb-1">The Spanish Suite PRO Active</p>
                            <p className="text-gray-600 dark:text-gray-400 text-sm">
                                Thank you for being a Premium subscriber! You have unlimited access to lessons, flashcards, and the AI conversation Sandbox.
                            </p>
                        </div>
                        <button
                            onClick={handleManageSubscription}
                            disabled={portalLoading}
                            className="w-full py-3 bg-gray-800 hover:bg-gray-900 dark:bg-gray-600 dark:hover:bg-gray-500 text-white font-bold rounded-xl shadow transition-all transform active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {portalLoading ? (
                                <>
                                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                    Opening Portal...
                                </>
                            ) : (
                                'Manage Billing & Subscription'
                            )}
                        </button>
                    </div>
                ) : (
                    <div>
                        <div className="bg-linear-to-r from-red-500/10 to-purple-500/10 border border-gray-200 dark:border-gray-600 rounded-xl p-5 mb-6">
                            <p className="text-gray-800 dark:text-gray-200 font-bold text-lg mb-2">Upgrade to the Spanish Suite PRO</p>
                            <p className="text-gray-600 dark:text-gray-400 text-sm mb-4">
                                Take your learning to the next level with full, unrestricted access to the entire app:
                            </p>
                            <ul className="space-y-2 mb-4 text-sm text-gray-700 dark:text-gray-300">
                                <li className="flex items-center gap-2">
                                    <BsCheckCircleFill className="text-green-500 shrink-0" />
                                    <span>Unlimited AI Sandbox conversations & scenarios</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <BsCheckCircleFill className="text-green-500 shrink-0" />
                                    <span>Premium reading library with advanced stories</span>
                                </li>
                                <li className="flex items-center gap-2">
                                    <BsCheckCircleFill className="text-green-500 shrink-0" />
                                    <span>Unlimited saved words in Spaced Repetition deck</span>
                                </li>
                            </ul>
                        </div>

                        {isProductsLoading ? (
                            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                                <span className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin inline-block mr-2 align-middle"></span>
                                Loading premium offers...
                            </div>
                        ) : stripeProducts.length === 0 ? (
                            <div className="text-center py-4 text-yellow-600 dark:text-yellow-400 text-sm bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-100 dark:border-yellow-900/30 rounded-xl">
                                No premium products available at the moment. Please check back later!
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {stripeProducts.map((product) => {
                                    const activePrice = product.prices?.[0];
                                    if (!activePrice) return null;

                                    const currencySymbol = activePrice.currency?.toUpperCase() === 'USD' ? '$' : activePrice.currency?.toUpperCase();
                                    const priceAmount = (activePrice.unit_amount / 100).toFixed(2);
                                    const intervalLabel = activePrice.interval === 'month' ? 'month' : activePrice.interval === 'year' ? 'year' : activePrice.interval;

                                    return (
                                        <div key={product.id} className="border border-custom-200 dark:border-gray-600 rounded-xl p-4 bg-custom-50/50 dark:bg-gray-800/40 flex flex-col justify-between items-center sm:flex-row gap-4">
                                            <div className="text-center sm:text-left">
                                                <h3 className="font-bold text-gray-800 dark:text-gray-100">{product.name}</h3>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">{product.description || 'Full premium access'}</p>
                                            </div>
                                            <div className="flex flex-col items-center sm:items-end gap-2 shrink-0">
                                                <span className="font-extrabold text-2xl text-gray-800 dark:text-gray-200">
                                                    {currencySymbol}{priceAmount} <span className="text-xs font-normal text-gray-500 dark:text-gray-400">/ {intervalLabel}</span>
                                                </span>
                                                <button
                                                    onClick={() => handleUpgrade(activePrice.id)}
                                                    disabled={checkoutLoading}
                                                    className="px-6 py-2.5 bg-linear-to-r from-red-500 to-purple-600 hover:from-red-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-md transition-all transform active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                >
                                                    {checkoutLoading ? (
                                                        <>
                                                            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                                                            Redirecting...
                                                        </>
                                                    ) : (
                                                        'Subscribe Now'
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* --- STATS --- */}
            <div className="flex justify-center my-8">
                <h1 className="text-4xl font-bold dark:bg-gray-700 p-2 shadow-lg rounded-lg text-centergray-800 dark:text-gray-200 text-center">Your Stats</h1>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:gap-4 mb-8 w-full">
                <div className="flex flex-col justify-center items-center bg-linear-to-b from-purple-400 to-purple-700 p-4 sm:p-6 rounded-xl shadow-md w-full">
                    <h2 className="text-xs sm:text-sm md:text-base font-bold text-gray-800 tracking-widest uppercase mb-2">Learning</h2>
                    <div className="flex flex-col items-center gap-1 text-blue-100">
                        <span className="font-extrabold text-3xl sm:text-4xl leading-none">{learningWordsCount}</span>
                        <span className="text-xs sm:text-sm font-medium text-purple-100 uppercase tracking-wide">Words</span>
                    </div>
                </div>
                <div className="flex flex-col justify-center items-center bg-linear-to-b from-sky-500 to-blue-700 p-4 sm:p-6 rounded-xl shadow-md w-full">
                    <h2 className="text-xs sm:text-sm md:text-base font-bold text-gray-800 tracking-widest uppercase mb-2">Read</h2>
                    <div className="flex flex-col items-center gap-1 text-blue-100">
                        <span className="font-extrabold text-3xl sm:text-4xl leading-none">{wordsRead}</span>
                        <span className="text-xs sm:text-sm font-medium text-blue-100 uppercase tracking-wide">Words</span>
                    </div>
                </div>
                <div className="flex flex-col justify-center items-center bg-linear-to-b from-green-500 to-green-900 p-4 sm:p-6 rounded-xl shadow-md w-full">
                    <h2 className="text-xs sm:text-sm md:text-base font-bold text-gray-800 tracking-widest uppercase mb-2">Completed</h2>
                    <div className="flex flex-col items-center gap-1 text-green-100">
                        <span className="font-extrabold text-3xl sm:text-4xl leading-none">{scenariosCompleted}</span>
                        <span className="text-xs sm:text-sm font-medium text-green-100 uppercase tracking-wide">Roles</span>
                    </div>
                </div>
                <div className="flex flex-col justify-center items-center bg-linear-to-b from-orange-500 to-red-700 p-4 sm:p-6 rounded-xl shadow-md w-full">
                    <h2 className="text-xs sm:text-sm md:text-base font-bold text-gray-800 tracking-widest uppercase mb-2">Streak</h2>
                    <div className="flex flex-col items-center gap-1 text-orange-100">
                        <span className="inline-flex items-center font-extrabold text-3xl sm:text-4xl leading-none gap-2">
                            {streak} <FaFire className="text-2xl sm:text-3xl text-orange-300" />
                        </span>
                        <span className="text-xs sm:text-sm font-medium text-orange-100 uppercase tracking-wide">Days</span>
                    </div>
                </div>
            </div>


            {/* --- Weekly XP Chart --- */}
            <div className="bg-white dark:bg-gray-700 p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">Weekly Activity</h2>
                <div style={{ width: '100%', height: 300 }}>
                    <ResponsiveContainer>
                        <LineChart
                            data={weeklyXpData}
                            margin={{ top: 5, right: 20, left: -10, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#4A5568' : '#E2E8F0'} />
                            <XAxis dataKey="name" stroke={theme === 'dark' ? '#A0AEC0' : '#4A5568'} />
                            <YAxis stroke={theme === 'dark' ? '#A0AEC0' : '#4A5568'} />
                            <Tooltip
                                contentStyle={{
                                    backgroundColor: theme === 'dark' ? '#2D3748' : '#FFFFFF',
                                    borderColor: theme === 'dark' ? '#4A5568' : '#E2E8F0'
                                }}
                                labelStyle={{ color: theme === 'dark' ? '#E2E8F0' : '#1A202C' }}
                            />
                            <Line type="monotone" dataKey="xp" name="XP Gained" stroke="#DC143C" strokeWidth={2} activeDot={{ r: 8 }} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
            {/* --- Settings Section --- */}
            <div className="bg-white dark:bg-gray-700 p-6 rounded-lg shadow-md mb-8">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">Settings</h2>
                <div className="flex items-center justify-between mb-4">
                    <span className="font-bold text-gray-700 dark:text-gray-300">Appearance</span>
                    <button
                        onClick={toggleTheme}
                        className="px-4 py-2  border-gray-700 dark:border-gray-200 bg-white-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                    >
                        {theme === 'dark' ? '🌙 Dark Mode' : '☀️ Light Mode'}
                    </button>
                </div>

                <div className="flex items-center justify-between">
                    <label htmlFor="listening-preference" className="font-bold text-gray-700 dark:text-gray-300">Listening Accent</label>
                    <select
                        id="listening-preference"
                        value={listeningPreference}
                        onChange={handlePreferenceChange}
                        className="p-2  border-gray-700 dark:border-gray-200 rounded-md shadow-sm bg-white-100 dark:bg-gray-700 dark:text-gray-200"
                    >
                        <option value="es-ES">Spain</option>
                        <option value="es-MX">Mexico</option>
                        <option value="es-US">United States</option>
                    </select>
                </div>
            </div>

            {/* --- Danger Zone --- */}
            <div className="bg-red-50 dark:bg-red-900/10 p-6 rounded-lg shadow-sm mb-8 border border-red-100 dark:border-red-900/30">
                <h2 className="text-xl font-bold text-red-800 dark:text-red-400 mb-2">Danger Zone</h2>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <p className="text-gray-700 dark:text-gray-300 text-sm max-w-md">
                        Permanently delete your account and all associated data. This action cannot be undone.
                    </p>
                    <button
                        onClick={() => {
                            setDeleteConfirmation('');
                            setShowDeleteModal(true);
                        }}
                        className="px-6 py-2.5 bg-red-600 text-white font-bold rounded-lg shadow hover:bg-red-700 transition-colors w-full sm:w-auto shrink-0"
                    >
                        Delete Account
                    </button>
                </div>
            </div>

        </div>
    );
};

export default AccountPage;