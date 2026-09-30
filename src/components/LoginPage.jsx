import React, { useState } from 'react';
import { useDecksStore } from '../store';
import { Link } from 'react-router-dom';

const LoginPage = () => {
    const [errorMessage, setErrorMessage] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const signInWithGoogle = useDecksStore((state) => state.signInWithGoogle);
    const signInWithFacebook = useDecksStore((state) => state.signInWithFacebook);
    const signInWithEmail = useDecksStore((state) => state.signInWithEmail);

    const handleGoogleSignIn = async () => {
        setErrorMessage('');

        try {
            await signInWithGoogle({ isSignUpFlow: false });
        } catch (error) {
            console.error("Error signing in with Google", error);
            if (error.code === 'auth/popup-closed-by-user') {
                setErrorMessage('Sign-in was cancelled.');
            } else if (error.code === 'auth/popup-blocked') {
                setErrorMessage('Popup blocked. Please allow popups for this site.');
            } else if (error.code === 'functions/not-found') {
                setErrorMessage(error.message); // Use specific backend verification messages
            } else if (error && error.message === 'Account not found') {
                setErrorMessage('Account not found. Please sign up first.');
            } else {
                setErrorMessage('An unexpected error occurred. Please try again.');
            }
        }
    };

    const handleFacebookSignIn = async () => {
        setErrorMessage('');

        try {
            await signInWithFacebook({ isSignUpFlow: false });
        } catch (error) {
            console.error("Error signing in with Facebook", error);
            if (error.code === 'auth/popup-closed-by-user') {
                setErrorMessage('Sign-in was cancelled.');
            } else if (error.code === 'auth/popup-blocked') {
                setErrorMessage('Popup blocked. Please allow popups for this site.');
            } else if (error.code === 'functions/not-found') {
                setErrorMessage(error.message);
            } else if (error && error.message === 'Account not found') {
                setErrorMessage('Account not found. Please sign up first.');
            } else {
                setErrorMessage('An unexpected error occurred. Please try again.');
            }
        }
    };

    const handleEmailSignIn = async (e) => {
        e.preventDefault();
        if (!email || !password) {
            setErrorMessage('Please enter both email and password.');
            return;
        }
        setErrorMessage('');

        try {
            await signInWithEmail(email, password);
        } catch (error) {
            console.error("Error signing in with email:", error);
            if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
                setErrorMessage('Invalid email or password.');
            } else if (error.code === 'auth/invalid-email') {
                setErrorMessage('Invalid email format.');
            } else {
                setErrorMessage('Failed to sign in. Please try again.');
            }
        }
    };

    return (
        <div className="min-h-[75vh] flex flex-col items-center justify-center w-full max-w-md mx-auto p-4 md:p-6 animate-fade-in">

            {/* Logo/Title */}
            <div className="text-center mb-8">
                <h1 className="text-3xl md:text-4xl font-extrabold text-gray-900 dark:text-white tracking-tight">
                    The Spanish <span className="text-teal-600 dark:text-teal-400">Suite</span>
                </h1>
            </div>

            {/* Centered Login Card */}
            <div className="w-full bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-xl border border-gray-200 dark:border-gray-700">
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Welcome Back</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Sign in to continue your learning journey.</p>
                </div>

                {/* Email/Password Fields */}
                <form onSubmit={handleEmailSignIn} className="space-y-4 mb-6">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="login-email">
                            Email Address
                        </label>
                        <input
                            type="email"
                            id="login-email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-750 text-gray-900 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                            required
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider" htmlFor="login-password">
                                Password
                            </label>
                            <Link to="/forgot-password" className="text-xs text-teal-600 dark:text-teal-400 font-semibold hover:underline">
                                Forgot password?
                            </Link>
                        </div>
                        <input
                            type="password"
                            id="login-password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-750 text-gray-900 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="w-full py-3.5 px-4 mt-2 bg-teal-600 hover:bg-teal-500 text-white rounded-xl shadow-md transition-transform transform active:scale-95 font-bold text-center"
                    >
                        Log In
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
                        type="button"
                        onClick={handleGoogleSignIn}
                        className="flex-1 py-3.5 px-4 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-xl shadow-sm hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors flex items-center justify-center"
                        title="Sign In with Google"
                    >
                        Login with
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
                        Don't have an account?{' '}
                        <Link to="/" className="text-blue-600 dark:text-teal-400 font-bold hover:underline">
                            Sign Up
                        </Link>
                    </p>
                </div>

                {errorMessage && (
                    <div className="p-3 mt-4 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 text-sm rounded-lg border border-red-200 dark:border-red-800 text-center font-medium">
                        {errorMessage}
                    </div>
                )}
            </div>

        </div>
    );
};

export default LoginPage;
