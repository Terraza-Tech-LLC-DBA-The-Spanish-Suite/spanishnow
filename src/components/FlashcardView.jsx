import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useDecksStore } from '../store';
import FlashCard from './FlashCard';
import Modal from './Modal';
import { RiDoubleQuotesL } from 'react-icons/ri';
import { BsFillVolumeUpFill } from 'react-icons/bs';
import { FaLock, FaLightbulb } from 'react-icons/fa';
import { TbSparkles } from 'react-icons/tb';

// Helper function to shuffle an array
const shuffleArray = (array) => {
    const newArray = [...array];
    for (let i = newArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
    }
    return newArray;
};

const FlashcardView = () => {
    const navigate = useNavigate();
    const { deckId } = useParams();

    const listeningPreference = useDecksStore((state) => state.listeningPreference);
    const trainingDeck = useDecksStore((state) => state.trainingDeck);
    const updateSavedWordProgress = useDecksStore((state) => state.updateSavedWordProgress);
    const resetSavedWordProgress = useDecksStore((state) => state.resetSavedWordProgress);
    const flushStandaloneSrsProgress = useDecksStore((state) => state.flushStandaloneSrsProgress);
    const isAdmin = useDecksStore((state) => state.isAdmin);
    const hasActiveSubscription = useDecksStore((state) => state.hasActiveSubscription);
    const generateWordContext = useDecksStore((state) => state.generateWordContext);
    const isPremium = isAdmin || hasActiveSubscription;

    const [sessionCards, setSessionCards] = useState([]);
    const [isFlipped, setIsFlipped] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [showPremiumModal, setShowPremiumModal] = useState(false);
    const [isGeneratingContext, setIsGeneratingContext] = useState(false);
    const [cardContexts, setCardContexts] = useState({});
    const [contextError, setContextError] = useState(null);

    // Guarantee progress is flushed if the user navigates away mid-review
    useEffect(() => {
        return () => {
            flushStandaloneSrsProgress();
        };
    }, [flushStandaloneSrsProgress]);

    const speakText = (e, text) => {
        e.stopPropagation();
        if (!window.speechSynthesis) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = listeningPreference;
        window.speechSynthesis.speak(utterance);
    };

    useEffect(() => {
        if (trainingDeck && trainingDeck.cards) {
            setSessionCards(shuffleArray(trainingDeck.cards));
        }
    }, [trainingDeck]);

    const currentCard = sessionCards[0];

    const handleAnswer = async (knewIt) => {
        if (isProcessing || !currentCard) return;

        setIsProcessing(true); // Lock the buttons

        try {
            // --- TRAINING SESSION LOGIC ---
            if (knewIt) {
                // User pressed "Next" - advance the SRS stage
                await updateSavedWordProgress(currentCard.spanish);
            } else {
                // User pressed "Forgot" - reset SRS stage
                await resetSavedWordProgress(currentCard.spanish);
            }

            // Common logic: move to the next card
            setIsFlipped(false);
            setTimeout(() => {
                setSessionCards(prevCards => {
                    const nextCards = prevCards.slice(1);
                    // Flush the queue when reaching the end of the deck
                    if (nextCards.length === 0) flushStandaloneSrsProgress();
                    return nextCards;
                });
                setIsProcessing(false); // Unlock the buttons for the next card
            }, 50);

        } catch (error) {
            console.error("An error occurred while saving progress:", error);
            setIsProcessing(false);
        }
    };

    const handleGenerateContext = async () => {
        if (!isPremium) {
            setShowPremiumModal(true);
            return;
        }
        if (!currentCard || isGeneratingContext) return;

        setIsGeneratingContext(true);
        setContextError(null);

        try {
            const result = await generateWordContext(currentCard.spanish, currentCard.english);
            if (result && result.success) {
                setCardContexts(prev => ({
                    ...prev,
                    [currentCard.spanish]: {
                        explanation: result.explanation,
                        examples: result.examples || []
                    }
                }));
            }
        } catch (err) {
            console.error("Context generation error:", err);
            const errMsg = err?.message || "Failed to generate context.";
            setContextError(errMsg);
        } finally {
            setIsGeneratingContext(false);
        }
    };

    const isSessionComplete = sessionCards.length === 0;

    if (isSessionComplete) {
        return (
            <div className="text-center animate-fade-in">
                <h2 className="text-4xl font-bold text-teal-800 mb-4">🏆 Session Complete!</h2>
                <p className="text-lg text-gray-600 mb-8">You've finished this session. Great job!</p>
                <div className="flex justify-center">
                    <button onClick={() => navigate('/spaced-repetition')} className="px-8 py-3 bg-gray-600 text-white font-semibold rounded-lg shadow-md hover:bg-gray-700 transition-colors">
                        Back to Spaced Repetition
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full animate-fade-in">
            {/* Focused session exit button for Training mode */}
            {deckId === 'training' && (
                <div className="flex justify-start mb-2">
                    <button
                        onClick={() => {
                            if (window.confirm("Are you sure you want to quit this training session?")) {
                                navigate('/spaced-repetition');
                            }
                        }}
                        className="p-2 -ml-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        aria-label="Quit training"
                    >
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>
            )}
            <h1 className="text-2xl font-bold text-teal-500 mb-6 text-center">{trainingDeck?.title || 'Loading...'}</h1>
            <h2 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-4 text-center">{sessionCards.length} cards left</h2>
            <div className="relative">
                <FlashCard cardData={currentCard} isFlipped={isFlipped} onFlip={() => setIsFlipped(!isFlipped)} />
            </div>

            {/* --- Usage Context & AI Expansion Section --- */}
            <div className="mt-8 max-w-md mx-auto w-full animate-slide-up">
                {currentCard?.examples && currentCard.examples.length > 0 && (
                    <>
                        <div className="flex items-center gap-2 mb-4 px-2">
                            <RiDoubleQuotesL className="text-teal-500 text-xl" />
                            <span className="text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">Usage Context</span>
                        </div>

                        <div className="space-y-3">
                            {currentCard.examples.map((ex, idx) => (
                                <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-700 p-4 rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start gap-4">
                                        <p className="text-lg font-medium text-gray-800 dark:text-gray-200 leading-snug">
                                            {ex.spanish}
                                        </p>
                                        <button
                                            onClick={(e) => speakText(e, ex.spanish)}
                                            className="p-2 text-gray-400 hover:text-teal-500 transition-colors"
                                            title="Pronounce example"
                                        >
                                            <BsFillVolumeUpFill size={18} />
                                        </button>
                                    </div>
                                    <p className={`mt-2 text-sm text-teal-600 dark:text-teal-400 italic transition-all duration-500 ${isFlipped ? 'opacity-100' : 'opacity-0 blur-sm select-none'}`}>
                                        {ex.english}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {/* AI Context Generation Action Button */}
                {(() => {
                    const activeContext = currentCard ? cardContexts[currentCard.spanish] : null;

                    return (
                        <div className="mt-4 flex flex-col items-center">
                            <button
                                onClick={handleGenerateContext}
                                disabled={isGeneratingContext || Boolean(activeContext)}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs sm:text-sm font-bold transition-all shadow-sm transform hover:scale-105 active:scale-95 disabled:scale-100 ${activeContext
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 cursor-default'
                                    : isPremium
                                        ? 'bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white cursor-pointer shadow-indigo-500/20'
                                        : 'bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white cursor-pointer'
                                    }`}
                                title={activeContext ? "Context already generated" : isPremium ? "Generate deep explanation and extra examples with AI" : "Premium feature - upgrade to unlock"}
                            >
                                {isGeneratingContext ? (
                                    <>
                                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                                        <span>Generating Context...</span>
                                    </>
                                ) : activeContext ? (
                                    <>
                                        <FaLightbulb className="text-emerald-500" />
                                        <span>Context Added</span>
                                    </>
                                ) : (
                                    <>
                                        <TbSparkles className="text-sm" />
                                        <span>Explain & More Examples (AI)</span>
                                        {!isPremium && <FaLock className="text-xs ml-0.5 opacity-90" />}
                                    </>
                                )}
                            </button>
                            {contextError && (
                                <p className="mt-2 text-xs text-red-500 text-center font-medium">{contextError}</p>
                            )}

                            {/* Generated Context Display */}
                            {activeContext && (
                                <div className="mt-4 w-full space-y-3 animate-fade-in text-left">
                                    {/* English Explanation Card */}
                                    {activeContext.explanation && (
                                        <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 p-4 rounded-2xl shadow-xs">
                                            <div className="flex items-center gap-2 mb-1.5 text-amber-800 dark:text-amber-300 font-bold text-xs uppercase tracking-wider">
                                                <FaLightbulb className="text-amber-600 dark:text-amber-400" />
                                                <span>Word Usage & Nuance</span>
                                            </div>
                                            <p className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                                                {activeContext.explanation}
                                            </p>
                                        </div>
                                    )}

                                    {/* Extra Examples */}
                                    {activeContext.examples && activeContext.examples.length > 0 && (
                                        <div className="space-y-2.5">
                                            <span className="text-[11px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400 px-1 flex items-center gap-1.5">
                                                <TbSparkles /> Extra Context Examples
                                            </span>
                                            {activeContext.examples.map((ex, idx) => (
                                                <div key={idx} className="bg-white dark:bg-gray-800 border border-purple-100 dark:border-purple-900/40 p-3.5 rounded-2xl shadow-xs hover:shadow-sm transition-shadow">
                                                    <div className="flex justify-between items-start gap-4">
                                                        <p className="text-sm sm:text-base font-medium text-gray-800 dark:text-gray-200 leading-snug">
                                                            {ex.spanish}
                                                        </p>
                                                        <button
                                                            onClick={(e) => speakText(e, ex.spanish)}
                                                            className="p-1.5 text-gray-400 hover:text-purple-500 transition-colors shrink-0"
                                                            title="Pronounce example"
                                                        >
                                                            <BsFillVolumeUpFill size={16} />
                                                        </button>
                                                    </div>
                                                    <p className={`mt-1.5 text-xs sm:text-sm text-purple-600 dark:text-purple-400 italic transition-all duration-300 ${isFlipped ? 'opacity-100' : 'opacity-0 blur-xs select-none'}`}>
                                                        {ex.english}
                                                    </p>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>

            <div className="mt-8 flex justify-around items-center">
                <div className="flex flex-col items-center gap-4">
                    <button
                        onClick={() => handleAnswer(true)}
                        disabled={isProcessing}
                        className="px-12 py-4 bg-blue-600 text-white font-bold rounded-full shadow-lg hover:bg-blue-700 transition-transform transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed disabled:transform-none"
                    >
                        Next
                    </button>
                    <button
                        onClick={() => handleAnswer(false)}
                        disabled={isProcessing}
                        className="text-sm text-gray-500 hover:text-red-500 underline transition-colors disabled:text-gray-300 disabled:cursor-not-allowed"
                    >
                        Forgot / Reset Progress
                    </button>
                </div>
            </div>
            <button onClick={() => navigate('/spaced-repetition')} className="mt-6 text-gray-500 hover:text-gray-700 transition-colors w-full text-center">← Back to review</button>

            {/* Premium Gating Modal */}
            <Modal
                isOpen={showPremiumModal}
                onClose={() => setShowPremiumModal(false)}
                title="Premium Feature 🔒"
                footer={
                    <div className="flex gap-2 text-sm sm:text-base">
                        <button
                            onClick={() => setShowPremiumModal(false)}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-95"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => {
                                setShowPremiumModal(false);
                                navigate('/#premium');
                            }}
                            className="px-4 py-2 bg-linear-to-r from-red-500 to-purple-600 hover:from-red-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
                        >
                            Get Premium
                        </button>
                    </div>
                }
            >
                <p className="text-gray-700 dark:text-gray-300 text-sm leading-relaxed">
                    Generating in-depth word explanations and extra contextual examples powered by AI is a <strong>Premium</strong> feature. Upgrade to unlock this functionality and deepen your learning!
                </p>
            </Modal>
        </div>
    );
};

export default FlashcardView;
