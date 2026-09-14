import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDecksStore } from '../store.js';
import Flashcard from './FlashCard.jsx';
import ListeningView from './ListeningView.jsx';
import MultipleChoiceQuiz from './MultipleChoiceQuiz.jsx';
import FillInTheBlankQuiz from './FillInTheBlankQuiz.jsx';
import { BsBookmark, BsBookmarkFill } from 'react-icons/bs';
import { FaGraduationCap, FaBrain, FaArrowRight, FaCheckCircle } from 'react-icons/fa';

const SessionManager = () => {
    const location = useLocation();
    const navigate = useNavigate();

    // Default to 'flashcards' mode if not specified
    const { lessonCards, deckId, mode = 'flashcards' } = location.state || { lessonCards: [], deckId: null };
    const saveDeckProgress = useDecksStore((state) => state.saveDeckProgress);
    const decks = useDecksStore((state) => state.decks);
    const savedWordsSet = useDecksStore((state) => state.savedWordsSet);
    const toggleSavedWord = useDecksStore((state) => state.toggleSavedWord);

    const [phase, setPhase] = useState('loading'); // loading, session, complete
    const [sessionQueue, setSessionQueue] = useState([]);
    const [currentStepIndex, setCurrentStepIndex] = useState(0);
    const [isCardFlipped, setIsCardFlipped] = useState(false);
    const [sessionScore, setSessionScore] = useState(0);

    // Create an interleaved queue: Learn concept -> Quiz concept right after!
    const createInterleavedQueue = (cards, isTestMode) => {
        const queue = [];
        const quizTypes = ['mcq', 'listen', 'fill'];
        let lastQuizType = null;

        cards.forEach((card, index) => {
            // Step 1: Learn phase for this concept (unless pure test mode)
            if (!isTestMode) {
                queue.push({
                    id: `learn-${card.id || index}`,
                    card,
                    stepType: 'learn',
                    conceptIndex: index + 1
                });
            }

            // Step 2: Immediate Quiz phase for this exact concept right after!
            let possible = quizTypes.filter(t => t !== lastQuizType && (card.vocab || t !== 'fill'));
            if (possible.length === 0) possible = quizTypes.filter(t => card.vocab || t !== 'fill');
            if (possible.length === 0) possible = ['mcq', 'listen'];

            const type = possible[Math.floor(Math.random() * possible.length)];
            lastQuizType = type;

            queue.push({
                id: `quiz-${card.id || index}`,
                card,
                stepType: 'quiz',
                quizType: type,
                conceptIndex: index + 1
            });
        });

        return queue;
    };

    useEffect(() => {
        if (lessonCards && lessonCards.length > 0) {
            const queue = createInterleavedQueue(lessonCards, mode === 'test');
            setSessionQueue(queue);
            setCurrentStepIndex(0);
            setIsCardFlipped(false);
            setSessionScore(0);
            setPhase('session');
        }
    }, [lessonCards, mode]);

    const handleNextStep = () => {
        if (currentStepIndex < sessionQueue.length - 1) {
            setCurrentStepIndex(prev => prev + 1);
            setIsCardFlipped(false);
        } else {
            finishSession(sessionScore);
        }
    };

    const handleAnswer = (wasCorrect) => {
        const newScore = wasCorrect ? sessionScore + 1 : sessionScore;
        if (wasCorrect) {
            setSessionScore(newScore);
        }

        if (currentStepIndex < sessionQueue.length - 1) {
            setCurrentStepIndex(prev => prev + 1);
            setIsCardFlipped(false);
        } else {
            finishSession(newScore);
        }
    };

    const finishSession = (finalScore) => {
        const totalQuizQuestions = sessionQueue.filter(item => item.stepType === 'quiz').length;
        if (totalQuizQuestions > 0) {
            saveDeckProgress(deckId, finalScore, totalQuizQuestions);
        }
        setPhase('complete');
    };

    const renderProgressBar = (current, total) => {
        const percentage = Math.round(((current + 1) / total) * 100);
        return (
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700 mb-6 overflow-hidden">
                <div
                    className={`h-2.5 rounded-full transition-all duration-300 ease-out ${percentage < 33 ? 'bg-amber-500' : percentage < 66 ? 'bg-sky-500' : 'bg-emerald-500'}`}
                    style={{ width: `${percentage}%` }}
                ></div>
            </div>
        );
    };

    if (phase === 'loading' || sessionQueue.length === 0) {
        return <div className="text-center p-8 dark:text-gray-300">Loading session...</div>;
    }

    const currentItem = sessionQueue[currentStepIndex];
    const deck = decks[deckId];
    const totalQuizQuestions = sessionQueue.filter(item => item.stepType === 'quiz').length;

    // --- Active Session Phase (Interleaved Learn -> Quiz) ---
    if (phase === 'session' && currentItem) {
        const { card, stepType, quizType, conceptIndex } = currentItem;
        const isSaved = card ? savedWordsSet.has(card.spanish) : false;

        return (
            <div className="w-full max-w-xl mx-auto animate-fade-in space-y-4">
                <title>{stepType === 'learn' ? 'Learn Concept' : 'Test Concept'} | Spanish Now</title>

                {/* Header Title & Badge */}
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${stepType === 'learn'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                            }`}>
                            {stepType === 'learn' ? <FaGraduationCap /> : <FaBrain />}
                            {stepType === 'learn' ? `Learn Concept ${conceptIndex}/${lessonCards.length}` : `Test Concept ${conceptIndex}/${lessonCards.length}`}
                        </span>
                    </div>
                    <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                        Step {currentStepIndex + 1} of {sessionQueue.length}
                    </span>
                </div>

                {renderProgressBar(currentStepIndex, sessionQueue.length)}

                {/* --- Step 1: Learn Step (Flashcard) --- */}
                {stepType === 'learn' && (
                    <div className="space-y-4">
                        <div className="relative">
                            <Flashcard cardData={card} isFlipped={isCardFlipped} onFlip={() => setIsCardFlipped(!isCardFlipped)} />
                            <div className="absolute top-4 right-4 z-10">
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        toggleSavedWord(card.spanish, {
                                            translation: card.english,
                                            vocab: card.vocab,
                                            explanation: card.explanation,
                                            source: deck?.title
                                        });
                                    }}
                                    className={`p-2.5 rounded-full shadow-md transition-all ${isSaved ? 'bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300' : 'bg-white text-gray-400 hover:text-teal-500'}`}
                                    title={isSaved ? "Remove from Spaced Repetition" : "Add to Spaced Repetition"}
                                >
                                    <span className="text-lg">{isSaved ? <BsBookmarkFill /> : <BsBookmark />}</span>
                                </button>
                            </div>
                        </div>

                        <p className="text-center text-gray-400 dark:text-gray-500 text-xs">(Tap card to flip & view usage note)</p>

                        <div className="mt-6">
                            <button
                                onClick={handleNextStep}
                                className="w-full py-3.5 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2"
                            >
                                <span>Got It! Test This Concept</span>
                                <FaArrowRight />
                            </button>
                        </div>
                    </div>
                )}

                {/* --- Step 2: Quiz Step (Immediate Practice) --- */}
                {stepType === 'quiz' && (
                    <div className="space-y-4">
                        {quizType === 'listen' && (
                            <ListeningView
                                currentCard={card}
                                onCorrect={() => handleAnswer(true)}
                                onIncorrect={() => handleAnswer(false)}
                            />
                        )}
                        {quizType === 'mcq' && (
                            <MultipleChoiceQuiz
                                lessonCards={lessonCards}
                                currentCard={card}
                                onCorrect={() => handleAnswer(true)}
                                onIncorrect={() => handleAnswer(false)}
                            />
                        )}
                        {quizType === 'fill' && (
                            <FillInTheBlankQuiz
                                lessonCards={lessonCards}
                                currentCard={card}
                                onCorrect={() => handleAnswer(true)}
                                onIncorrect={() => handleAnswer(false)}
                            />
                        )}
                    </div>
                )}

                <div className="pt-4 text-center">
                    <button
                        onClick={() => navigate('/decks')}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                        ← Return to Decks Library
                    </button>
                </div>
            </div>
        );
    }

    // --- Completion Screen ---
    const scorePercentage = totalQuizQuestions > 0 ? Math.round((sessionScore / totalQuizQuestions) * 100) : 100;

    return (
        <div className="text-center animate-fade-in max-w-md mx-auto py-8">
            <title>Session Complete | Spanish Suite App</title>

            <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-300 rounded-full flex items-center justify-center mx-auto mb-4 text-4xl shadow-md">
                <FaCheckCircle />
            </div>

            <h2 className="text-3xl font-extrabold text-gray-800 dark:text-gray-100 mb-2">
                Session Complete!
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Great job! You learned and practiced {lessonCards.length} concepts.
            </p>

            {totalQuizQuestions > 0 && (
                <div className="mb-8 p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-md border border-gray-100 dark:border-gray-700">
                    <p className="text-xs uppercase font-bold text-gray-400 tracking-wider mb-2">Quiz Mastery Score</p>
                    <p className="text-5xl font-black text-blue-600 dark:text-blue-400 mb-2">
                        {sessionScore} / {totalQuizQuestions}
                    </p>
                    <div className="inline-block bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-bold px-3 py-1 rounded-full mt-2">
                        {scorePercentage}% Accuracy
                    </div>
                </div>
            )}

            <div className="flex justify-center">
                <button
                    onClick={() => navigate('/decks')}
                    className="px-8 py-3.5 bg-custom-600 hover:bg-custom-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all"
                >
                    Back to Decks Library
                </button>
            </div>
        </div>
    );
};

export default SessionManager;