import React, { useState } from 'react';
import { useDecksStore } from '../store';
import { FaTiktok, FaCalendarAlt, FaBars, FaTimes, FaInfoCircle, FaUserPlus, FaChevronDown } from 'react-icons/fa';
import { BsCheckCircleFill, BsSunFill, BsMoonStarsFill } from 'react-icons/bs';
import { Link } from 'react-router-dom';

const LandingPage = () => {
    const [errorMessage, setErrorMessage] = useState('');
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const theme = useDecksStore((state) => state.theme);
    const toggleTheme = useDecksStore((state) => state.toggleTheme);
    const signInWithGoogle = useDecksStore((state) => state.signInWithGoogle);
    const signInWithFacebook = useDecksStore((state) => state.signInWithFacebook);
    const signUpWithEmail = useDecksStore((state) => state.signUpWithEmail);

    const handleGoogleSignUp = async () => {
        setErrorMessage('');

        try {
            await signInWithGoogle({ isSignUpFlow: true });
        } catch (error) {
            console.error("Error signing up with Google", error);
            if (error.code === 'auth/popup-closed-by-user') {
                setErrorMessage('Sign-up was cancelled.');
            } else if (error.code === 'auth/popup-blocked') {
                setErrorMessage('Popup blocked. Please allow popups for this site.');
            } else {
                setErrorMessage('An unexpected error occurred. Please try again.');
            }
        }
    };

    const handleFacebookSignUp = async () => {
        setErrorMessage('');

        try {
            await signInWithFacebook({ isSignUpFlow: true });
        } catch (error) {
            console.error("Error signing up with Facebook", error);
            if (error.code === 'auth/popup-closed-by-user') {
                setErrorMessage('Sign-up was cancelled.');
            } else if (error.code === 'auth/popup-blocked') {
                setErrorMessage('Popup blocked. Please allow popups for this site.');
            } else {
                setErrorMessage('An unexpected error occurred. Please try again.');
            }
        }
    };

    const handleEmailSignUp = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            setErrorMessage('Please enter both email and password.');
            return;
        }
        if (password.length < 6) {
            setErrorMessage('Password must be at least 6 characters.');
            return;
        }
        setErrorMessage('');

        try {
            await signUpWithEmail(email, password);
        } catch (error) {
            console.error("Error signing up with email:", error);
            if (error.code === 'auth/email-already-in-use') {
                setErrorMessage('This email address is already in use.');
            } else if (error.code === 'auth/invalid-email') {
                setErrorMessage('Invalid email address format.');
            } else if (error.code === 'auth/weak-password') {
                setErrorMessage('Password is too weak.');
            } else {
                setErrorMessage('Failed to sign up. Please try again.');
            }
        }
    };

    return (
        <div className="w-full max-w-6xl mx-auto mt-2 lg:mt-6 animate-fade-in">

            {/* --- Landing Page Header Navigation Bar --- */}
            <div className="flex justify-between items-center mb-8 bg-white dark:bg-gray-800 p-4 px-6 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 relative z-30">
                <div className="flex items-center gap-2">
                    <span className="text-xl md:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                        The Spanish <span className="text-teal-600 dark:text-teal-400">Suite</span>
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={toggleTheme}
                        className="hidden sm:flex p-2.5 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all items-center justify-center cursor-pointer shadow-xs"
                        title={`Switch to ${theme === 'dark' ? 'Light' : 'Dark'} Mode`}
                        aria-label="Toggle theme"
                    >
                        {theme === 'dark' ? (
                            <BsSunFill className="w-4 h-4 text-amber-400" />
                        ) : (
                            <BsMoonStarsFill className="w-4 h-4 text-indigo-600" />
                        )}
                    </button>

                    <span className="hidden sm:inline text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Already a member?
                    </span>
                    <Link
                        to="/login"
                        className="px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-md transition-all text-sm flex items-center justify-center transform hover:scale-105 active:scale-95"
                    >
                        Log In
                    </Link>
                    {/* Navigation Menu Dropdown */}
                    <div className="relative">
                        <button
                            type="button"
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="px-3.5 py-2 text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all flex items-center gap-2 cursor-pointer text-sm font-semibold shadow-xs"
                            aria-expanded={isMenuOpen}
                            aria-label="Toggle navigation menu"
                        >
                            {isMenuOpen ? <FaTimes className="text-sm" /> : <FaBars className="text-sm" />}
                        </button>

                        {/* Dropdown Menu Popup */}
                        {isMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsMenuOpen(false)}></div>
                                <div className="absolute right-0 mt-2 w-60 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 py-2 z-50 animate-fade-in">
                                    <div className="px-4 py-1.5 text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                                        Navigation
                                    </div>

                                    {/* 1. Schedule 1-on-1 Link (Beginning of the list) */}
                                    <Link
                                        to="/free-booking"
                                        onClick={() => setIsMenuOpen(false)}
                                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/40 transition-colors"
                                    >
                                        <FaCalendarAlt className="text-teal-600 dark:text-teal-400 text-base shrink-0" />
                                        <div className="flex flex-col">
                                            <span>Book Free Coaching</span>
                                            <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">Free Google Meet session</span>
                                        </div>
                                    </Link>

                                    <div className="my-1 border-t border-gray-100 dark:border-gray-700"></div>

                                    {/* 2. About Link */}
                                    <a
                                        href="#about"
                                        onClick={() => setIsMenuOpen(false)}
                                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <FaInfoCircle className="text-gray-400 text-base shrink-0" />
                                        <span>About Platform</span>
                                    </a>

                                    {/* 3. Sign Up Link */}
                                    <a
                                        href="#signup"
                                        onClick={() => setIsMenuOpen(false)}
                                        className="flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                    >
                                        <FaUserPlus className="text-gray-400 text-base shrink-0" />
                                        <span>Sign Up Form</span>
                                    </a>

                                    <div className="my-1 border-t border-gray-100 dark:border-gray-700"></div>

                                    {/* 4. Theme Switch Button */}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            toggleTheme();
                                            setIsMenuOpen(false);
                                        }}
                                        className="sm:hidden flex w-full items-center gap-3 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-left cursor-pointer"
                                    >
                                        {theme === 'dark' ? (
                                            <BsSunFill className="text-amber-400 text-base shrink-0" />
                                        ) : (
                                            <BsMoonStarsFill className="text-indigo-600 dark:text-indigo-400 text-base shrink-0" />
                                        )}
                                        <span>Switch to {theme === 'dark' ? 'Light' : 'Dark'} Mode</span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8 items-start">

                {/* --- Left Column: Main Content --- */}
                <div className="flex-1 w-full space-y-8">

                    {/* Hero Title */}
                    <div className="text-center lg:text-left">
                        <h1 className="text-4xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight mb-4">
                            Master Spanish <span className='md:text-5xl italic bg-gradient-to-r from-red-600 to-amber-400 bg-clip-text text-transparent'>Through Immersion</span>
                        </h1>
                        <p className="text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto lg:mx-0">
                            Unlock your Spanish potential through interactive stories, spaced repetition, and real-world AI conversations.
                        </p>
                    </div>

                    {/* Welcome Video */}
                    <div className="w-full rounded-2xl overflow-hidden shadow-xl border border-gray-200 dark:border-gray-700 bg-black">
                        <video
                            controls
                            preload="metadata"
                            className="w-full aspect-video rounded-2xl object-cover"
                        >
                            <source src="/welcome-video.mp4" type="video/mp4" />
                            Your browser does not support the video tag.
                        </video>
                    </div>
                    <div className="flex gap-4 justify-center items-center">
                        <a
                            href="#signup"
                            className="block lg:hidden px-5 py-2 bg-teal-600 hover:bg-teal-500 text-white font-bold rounded-xl shadow-md transition-all text-sm flex items-center justify-center transform hover:scale-105 active:scale-95"
                        >
                            Sign up
                        </a>
                        <Link
                            to="/free-booking"
                            onClick={() => setIsMenuOpen(false)}
                            className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-teal-600 dark:text-teal-400 hover:bg-teal-50 border-2 rounded-xl border-teal-600 dark:hover:bg-teal-900/40 transition-colors"
                        >
                            <FaCalendarAlt className="text-teal-600 dark:text-teal-400 text-base shrink-0" />
                            <div className="flex flex-col">
                                <span>Book Free Coaching</span>
                                <span className="text-[11px] font-normal text-gray-500 dark:text-gray-400">Free Google Meet session</span>
                            </div>
                        </Link>
                    </div>
                    {/* About Section */}
                    <div id="about" className="bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-sm border border-gray-200 dark:border-gray-700">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">About this platform</h2>
                        <div className="text-gray-700 dark:text-gray-300 space-y-4 leading-relaxed text-lg">
                            <p>
                                ¡Hola! My name is Henry, and I'm here to help you learn Spanish the right way. I built this app to combine the most effective language learning methods into one seamless, daily experience.
                            </p>
                            <p>
                                Instead of boring grammar drills, you'll learn through context and practice:
                            </p>
                            <ul className="space-y-4 mt-6 pb-2">
                                <li className="flex items-start">
                                    <BsCheckCircleFill className="text-teal-500 mt-1.5 mr-3 shrink-0 text-xl" />
                                    <span><strong>Reading Library:</strong> Immerse yourself in Spanish stories tailored to your level. Save words you don't know with a single click.</span>
                                </li>
                                <li className="flex items-start">
                                    <BsCheckCircleFill className="text-teal-500 mt-1.5 mr-3 shrink-0 text-xl" />
                                    <span><strong>Spaced Repetition:</strong> Review your saved vocabulary using a smart algorithm that ensures you never forget what you've learned.</span>
                                </li>
                                <li className="flex items-start">
                                    <BsCheckCircleFill className="text-teal-500 mt-1.5 mr-3 shrink-0 text-xl" />
                                    <span><strong>AI Speak Companion:</strong> Put your knowledge to the test in real-time. Practice ordering at a restaurant, booking a hotel, or chatting with a friend.</span>
                                </li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* --- Right Column: Sticky CTA Card --- */}
                <div id="signup" className="w-full lg:w-96 shrink-0">
                    <div className="sticky top-8 bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-xl border border-gray-200 dark:border-gray-700">

                        <div>
                            <div className="mb-6">
                                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Join the Community</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Create a free account to start practicing Spanish.</p>
                            </div>

                            {/* Email/Password Fields */}
                            <form onSubmit={handleEmailSignUp} className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="signup-email">
                                        Email Address
                                    </label>
                                    <input
                                        type="email"
                                        id="signup-email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        placeholder="Enter your email"
                                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-750 text-gray-900 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="signup-password">
                                        Password
                                    </label>
                                    <input
                                        type="password"
                                        id="signup-password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder="Minimum 6 characters"
                                        className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-750 text-gray-900 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                                        required
                                    />
                                </div>

                                {/* Terms & Conditions Checkbox */}
                                <div className="flex items-center gap-3 pt-2">
                                    <input
                                        type="checkbox"
                                        id="terms-checkbox"
                                        checked={agreedToTerms}
                                        onChange={(e) => setAgreedToTerms(e.target.checked)}
                                        className="w-5 h-5 rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500 dark:bg-gray-750 cursor-pointer mt-0.5"
                                    />
                                    <label htmlFor="terms-checkbox" className="text-xs text-gray-600 dark:text-gray-400 leading-normal select-none cursor-pointer">
                                        I agree to the <Link to="/terms" className="text-blue-600 dark:text-teal-400 hover:underline">Terms of Service</Link> and <Link to="/privacy" className="text-blue-600 dark:text-teal-400 hover:underline">Privacy Policy</Link>
                                    </label>
                                </div>

                                <button
                                    type="submit"
                                    disabled={!agreedToTerms}
                                    className="w-full py-3.5 px-4 mt-2 bg-teal-600 hover:bg-teal-500 disabled:bg-teal-800 text-white rounded-xl shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all font-bold text-center"
                                >
                                    Create Account
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="flex items-center my-6">
                                <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                                <span className="mx-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">or</span>
                                <div className="flex-grow border-t border-gray-200 dark:border-gray-700"></div>
                            </div>

                            <div className="flex gap-3 w-full">
                                <button
                                    onClick={handleGoogleSignUp}
                                    disabled={!agreedToTerms}
                                    className="flex-1 py-3.5 px-4 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 disabled:bg-gray-250 dark:disabled:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                                    title="Sign Up with Google"
                                >
                                    Join With
                                    <svg className="w-6 h-6 ml-2" viewBox="0 0 24 24">
                                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                </button>
                            </div>

                            <div className="text-center mt-6">
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    Already have an account?{' '}
                                    <Link to="/login" className="text-blue-600 dark:text-teal-400 font-bold hover:underline">
                                        Log In
                                    </Link>
                                </p>
                            </div>
                        </div>

                        {errorMessage && (
                            <div className="p-3 mt-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800 text-center font-medium">
                                {errorMessage}
                            </div>
                        )}
                        <br />
                        <a
                            href="https://www.tiktok.com/@aprendespanishtoday"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-3 px-4 bg-gray-900 hover:bg-black dark:bg-gray-700 dark:hover:bg-gray-600 text-white font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-2"
                        >
                            <FaTiktok className="text-lg" />
                            Follow on TikTok
                        </a>
                    </div>
                </div>

            </div>

            {/* Footer */}
            <div className="mt-16 pb-8 text-center text-sm text-gray-500 dark:text-gray-400">
                <p>&copy; {new Date().getFullYear()} The Spanish Suite. All rights reserved.</p>
                <div className="mt-3 space-x-6">
                    <Link to="/privacy" className="hover:text-gray-800 dark:hover:text-gray-200 hover:underline transition-colors">Privacy Policy</Link>
                    <Link to="/terms" className="hover:text-gray-800 dark:hover:text-gray-200 hover:underline transition-colors">Terms of Service</Link>
                </div>
            </div>

        </div>
    );
};

export default LandingPage;