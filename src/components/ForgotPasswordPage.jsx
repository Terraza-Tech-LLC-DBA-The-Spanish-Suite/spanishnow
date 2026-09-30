import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useDecksStore } from '../store';

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState('');
    const [statusMessage, setStatusMessage] = useState({ type: '', text: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [cooldownTimer, setCooldownTimer] = useState(0);

    const sendPasswordReset = useDecksStore((state) => state.sendPasswordReset);

    useEffect(() => {
        if (cooldownTimer <= 0) return;
        const interval = setInterval(() => {
            setCooldownTimer((prev) => prev - 1);
        }, 1000);
        return () => clearInterval(interval);
    }, [cooldownTimer]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (cooldownTimer > 0) return;

        if (!email || !email.trim()) {
            setStatusMessage({ type: 'error', text: 'Please enter your email address.' });
            return;
        }

        const submittedEmail = email.trim();
        setStatusMessage({ type: '', text: '' });
        setIsSubmitting(true);

        const genericSuccessText = 'If an account with that email address exists, a password reset link has been sent. Please check your inbox and spam folder.';

        try {
            await sendPasswordReset(submittedEmail);
            setStatusMessage({
                type: 'success',
                text: genericSuccessText
            });
        } catch (error) {
            console.error("Error sending password reset email:", error);
            if (error.code === 'auth/invalid-email') {
                setStatusMessage({ type: 'error', text: 'Please enter a valid email address.' });
            } else if (error.code === 'auth/user-not-found') {
                // Prevent account enumeration by showing the exact same message
                setStatusMessage({
                    type: 'success',
                    text: genericSuccessText
                });
            } else if (error.code === 'auth/too-many-requests') {
                setStatusMessage({ type: 'error', text: 'Too many requests. Please wait a few minutes before trying again.' });
            } else {
                setStatusMessage({ type: 'error', text: 'An unexpected error occurred. Please try again later.' });
            }
        } finally {
            setIsSubmitting(false);
            setEmail(''); // Clear email input field after attempt
            setCooldownTimer(30); // Start 30-second cooldown lapse
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

            {/* Forgot Password Card */}
            <div className="w-full bg-white dark:bg-gray-800 rounded-2xl p-6 md:p-8 shadow-xl border border-gray-200 dark:border-gray-700">
                <div className="mb-6">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Reset Your Password</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Enter the email address registered with your account and we will send you a password reset link.
                    </p>
                </div>

                {statusMessage.text && (
                    <div
                        className={`p-4 mb-6 text-sm rounded-xl border font-medium ${statusMessage.type === 'success'
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                            : 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800'
                            }`}
                    >
                        {statusMessage.text}
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1.5" htmlFor="reset-email">
                            Email Address
                        </label>
                        <input
                            type="email"
                            id="reset-email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your registered email"
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-750 text-gray-900 placeholder-gray-400 focus:outline-hidden focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500 transition-all text-sm"
                            required
                            disabled={isSubmitting || cooldownTimer > 0}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isSubmitting || cooldownTimer > 0}
                        className="w-full py-3.5 px-4 mt-2 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded-xl shadow-md transition-transform transform active:scale-95 font-bold text-center flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <>
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                <span>Sending Reset Link...</span>
                            </>
                        ) : cooldownTimer > 0 ? (
                            <span>Please wait {cooldownTimer}s before resending</span>
                        ) : (
                            'Send Reset Link'
                        )}
                    </button>
                </form>

                <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700 flex flex-col space-y-3 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Remembered your password?{' '}
                        <Link to="/login" className="text-teal-600 dark:text-teal-400 font-bold hover:underline">
                            Log In
                        </Link>
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Don't have an account?{' '}
                        <Link to="/" className="text-blue-600 dark:text-teal-400 font-bold hover:underline">
                            Sign Up
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
