import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDecksStore } from '../store.js';
import { MdCalendarToday } from 'react-icons/md';
import { FaBookOpen } from 'react-icons/fa';
import { IoPersonSharp } from 'react-icons/io5';
import { RiBrain2Fill, RiSpeakFill } from 'react-icons/ri';
import { PiCardsFill } from 'react-icons/pi';

const Header = () => {
    const navigate = useNavigate();
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const menuRef = useRef(null); // Ref to detect clicks outside the menu
    const [errorMessage, setErrorMessage] = useState('');

    const currentUser = useDecksStore((state) => state.currentUser);
    const isAdmin = useDecksStore((state) => state.isAdmin);
    const signInWithGoogle = useDecksStore((state) => state.signInWithGoogle);
    const signOutUser = useDecksStore((state) => state.signOutUser);
    const savedWordsList = useDecksStore((state) => state.savedWordsList);
    const fetchSavedWords = useDecksStore((state) => state.fetchSavedWords);
    const theme = useDecksStore((state) => state.theme);
    const toggleTheme = useDecksStore((state) => state.toggleTheme);
    const hasActiveSubscription = useDecksStore((state) => state.hasActiveSubscription);
    const isPremium = isAdmin || hasActiveSubscription;

    useEffect(() => {
        if (currentUser) {
            fetchSavedWords();
        }
    }, [currentUser, fetchSavedWords]);

    // Effect to close the menu if the user clicks outside of it
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsMenuOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [menuRef]);

    const handleNavigate = (path) => {
        navigate(path);
        setIsMenuOpen(false); // Close menu after navigation
    };

    // Filter words that are due for review
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    const endOfToday = today.getTime();
    const dueWords = savedWordsList.filter(w => {
        if (w.stage >= 5) return false; // Mastered words are done
        if (!w.nextReviewDate) return true; // Legacy/New words are due
        return w.nextReviewDate <= endOfToday;
    });

    const handleGoogleSignIn = async () => {
        setErrorMessage('');
        try {
            await signInWithGoogle();
        } catch (error) {
            console.error("Error signing in with Google", error);
            if (error.code === 'auth/popup-closed-by-user') {
                setErrorMessage('Sign-in cancelled.');
            } else if (error.code === 'auth/popup-blocked') {
                setErrorMessage('Popup blocked.');
            } else {
                setErrorMessage('Sign-in failed.');
            }
            setTimeout(() => setErrorMessage(''), 5000);
        }
    };

    return (
        <header className="w-full p-4 mb-4 flex justify-between items-center bg-white dark:bg-gray-800 shadow-md rounded-lg">
            <h1
                className="p-3 text-xl font-bold cursor-pointer text-custom-800 dark:text-custom-200"
                onClick={() => navigate('/')}
            >
                <span className='underline decoration-amber-500'>The Spanish</span> <span className="underline decoration-sky-500">Suite</span> <span className='underline decoration-red-500'>App</span> <span className="text-xs font-normal dark:text-gray-200 text-gray-800 ml-1">v1.1</span>
            </h1>
            <div>
                {currentUser ? (
                    <div className="relative" ref={menuRef}>
                        {/* --- Dropdown Toggle Button --- */}
                        <button onClick={() => setIsMenuOpen(!isMenuOpen)} className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                            {/* hamburger icon that become x when menu is open */}
                            {isMenuOpen ? (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                                </svg>
                            )}
                        </button>

                        {/* --- Dropdown Menu --- */}
                        {isMenuOpen && (
                            <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-gray-900 rounded-md shadow-lg py-1 z-20 border dark:border-gray-700">
                                {isAdmin && (
                                    <div>
                                        <button
                                            onClick={() => handleNavigate('/admin')}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        >
                                            Admin Panel
                                        </button>
                                        <button
                                            onClick={() => handleNavigate('/journey')}
                                            className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                        >
                                            Journey Control
                                        </button>
                                    </div>
                                )}
                                <button
                                    onClick={() => handleNavigate('/account')}
                                    className="flex flex-row items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <IoPersonSharp />
                                    <span className="ml-2">My Account</span>
                                </button>
                                <button
                                    onClick={() => handleNavigate('/reading-library')}
                                    className="flex flex-row items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <FaBookOpen />
                                    <span className="ml-2">Learn</span>
                                </button>
                                <button
                                    onClick={() => handleNavigate('/spaced-repetition')}
                                    className="flex flex-row items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <RiBrain2Fill />
                                    <span className="ml-2">Deck</span>
                                    <span className="ml-2 text-xs bg-teal-500 text-white px-2 py-1 rounded-full">{dueWords.length}</span>
                                </button>
                                <button
                                    onClick={() => handleNavigate('/speakCompanion')}
                                    className="flex flex-row items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <RiSpeakFill />
                                    <span className="ml-2">SandBox</span>
                                </button>
                                <button
                                    onClick={() => handleNavigate('/booking')}
                                    className="flex flex-row items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <MdCalendarToday />
                                    <span className="ml-2">Book Tutoring</span>
                                </button>
                                <button
                                    onClick={() => { toggleTheme(); setIsMenuOpen(false); }}
                                    className="flex flex-row items-center w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <span className="text-lg">{theme === 'dark' ? '☀️' : '🌙'}</span>
                                    <span className="ml-2">Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode</span>
                                </button>
                                <button
                                    onClick={signOutUser}
                                    className="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    Sign Out
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-end">
                        <button
                            onClick={handleGoogleSignIn}
                            className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-lg shadow-sm hover:bg-blue-600 transition-colors"
                        >
                            Sign in with Google
                        </button>
                        {errorMessage && <span className="text-red-500 text-xs mt-1">{errorMessage}</span>}
                    </div>
                )}
            </div>
        </header>
    );
};

export default Header;
