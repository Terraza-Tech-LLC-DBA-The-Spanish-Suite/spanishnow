import React, { useState, useEffect, useRef } from 'react';
import { useDecksStore } from '../store.js';
import { LuTurtle } from "react-icons/lu";
import { BsBookmark, BsBookmarkFill, BsFillVolumeUpFill } from "react-icons/bs";
import { FaInfoCircle, FaPlayCircle, FaRegPauseCircle, FaStopCircle, FaBook } from 'react-icons/fa';
import { CiPlay1 } from 'react-icons/ci';
import AdminMissingWordsDrawer from './AdminMissingWordsDrawer.jsx';

const StoryReader = ({ articleId, onComplete }) => {
    // --- Store Data ---
    const fetchArticleById = useDecksStore((state) => state.fetchArticleById);
    const article = useDecksStore((state) => state.articles[articleId]);
    const isLoading = useDecksStore((state) => state.isLoading);
    const listeningPreference = useDecksStore((state) => state.listeningPreference);
    const translations = useDecksStore((state) => state.activeArticleTranslations);
    const isDictionaryLoading = useDecksStore((state) => state.isDictionaryLoading);
    const isAdmin = useDecksStore((state) => state.isAdmin);
    const currentUser = useDecksStore((state) => state.currentUser);
    const fetchSavedWords = useDecksStore((state) => state.fetchSavedWords);

    const savedWords = useDecksStore((state) => state.savedWordsSet);
    const toggleSavedWord = useDecksStore((state) => state.toggleSavedWord);
    const saveWordTranslation = useDecksStore((state) => state.saveWordTranslation);
    const fetchTranslationForWord = useDecksStore((state) => state.fetchTranslationForWord);
    const fetchArticleTranslationsForAdmin = useDecksStore((state) => state.fetchArticleTranslationsForAdmin);
    const markArticleAsFinished = useDecksStore((state) => state.markArticleAsFinished);
    const activeSession = useDecksStore((state) => state.activeSession);

    // --- UI State ---
    const [lookupResult, setLookupResult] = useState(null);
    const [popupPosition, setPopupPosition] = useState({ x: 0, y: 0 });
    const [showTranslations, setShowTranslations] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState("");
    const [isTranslationsOn, setIsTranslationsOn] = useState(false);
    const [playingState, setPlayingState] = useState({ text: null, rate: null });
    const [isMissingWordsDrawerOpen, setIsMissingWordsDrawerOpen] = useState(false);
    const currentSpeechRef = useRef({ text: null, rate: null });
    const [isCompleting, setIsCompleting] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1.0);
    const speechSessionRef = useRef({
        id: 0,
        sentences: [],
        sentenceIndex: 0,
        words: [],
        wordIndex: 0,
        sentenceStartTime: 0,
        rate: 1.0,
        boundaryCharIndex: -1,
        boundaryFired: false,
        textIdentifier: null
    });

    const POPUP_WIDTH = 220;
    const POPUP_HEIGHT_ESTIMATE = 120;

    const sessionWords = activeSession?.wordsSavedInSession || [];
    const [toastMessage, setToastMessage] = useState(null);
    const prevSessionWordsLength = useRef(sessionWords.length);

    // --- Sentence Recording State ---
    const [isRecordingSentence, setIsRecordingSentence] = useState(false);
    const [recordingSelection, setRecordingSelection] = useState(null); // { sentenceIndex, startIndex, endIndex }
    const [shakingWordKey, setShakingWordKey] = useState(null); // `${sIndex}-${wIndex}`
    const [toastPrompt, setToastPrompt] = useState(null); // { message, onConfirm, onCancel }

    useEffect(() => {
        return () => {
            if (window.speechSynthesis) {
                speechSessionRef.current.id++;
                if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                }
                window.speechSynthesis.cancel();
            }
        };
    }, []);

    useEffect(() => {
        if (sessionWords.length > prevSessionWordsLength.current) {
            setToastMessage(`Word saved! ${sessionWords.length} added in this session`);
            const timer = setTimeout(() => setToastMessage(null), 2000);
            prevSessionWordsLength.current = sessionWords.length;
            return () => clearTimeout(timer);
        } else if (sessionWords.length < prevSessionWordsLength.current) {
            setToastMessage(`Word removed! ${sessionWords.length} left in this session`);
            const timer = setTimeout(() => setToastMessage(null), 2000);
            prevSessionWordsLength.current = sessionWords.length;
            return () => clearTimeout(timer);
        }
    }, [sessionWords.length]);

    useEffect(() => {
        if (articleId) {
            fetchArticleById(articleId);
        }
    }, [articleId, fetchArticleById]);

    useEffect(() => {
        if (currentUser) {
            fetchSavedWords();
        }
    }, [currentUser, fetchSavedWords]);

    useEffect(() => {
        if (article && isAdmin) {
            const fullText = article.sentences.map(s => s.spanish).join(' ');
            fetchArticleTranslationsForAdmin(fullText);
        }
    }, [article, isAdmin, fetchArticleTranslationsForAdmin]);

    // Calculate missing words for admins
    const missingWords = React.useMemo(() => {
        if (!isAdmin || !article || !article.sentences) return [];
        const fullStoryWords = article.sentences
            .map(s => s.spanish)
            .join(' ')
            .toLowerCase()
            .match(/[\p{L}]+/gu) || [];
        const unique = [...new Set(fullStoryWords)];
        return unique.filter(w => {
            if (!translations.has(w)) return false;
            const trans = translations.get(w);
            const translationText = typeof trans === 'object' ? trans.translation : trans;
            return !translationText || translationText === "No translation found";
        });
    }, [isAdmin, article, translations]);

    if (isLoading || !article) {
        return (
            <div className="p-4 flex flex-col justify-center items-center h-full">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mb-4"></div>
                <p className="text-gray-600 dark:text-gray-300">Loading your story...</p>
            </div>
        );
    }

    const fullStoryText = article ? article.sentences.map(s => s.spanish).join(' ') : '';

    // --- Speech Synthesis Handlers ---
    const stopSpeech = () => {
        speechSessionRef.current.id++;
        if (window.speechSynthesis) {
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
            window.speechSynthesis.cancel();
        }
        speechSessionRef.current = {
            id: speechSessionRef.current.id,
            sentences: [],
            sentenceIndex: 0,
            words: [],
            wordIndex: 0,
            sentenceStartTime: 0,
            rate: playbackRate,
            boundaryCharIndex: -1,
            boundaryFired: false,
            textIdentifier: null
        };
        currentSpeechRef.current = { text: null, rate: null };
        setPlayingState({ text: null, rate: null });
        setIsPaused(false);
    };

    const calculateCurrentWordIndex = () => {
        const session = speechSessionRef.current;
        if (!session.words || session.words.length === 0) return 0;

        const remainingWords = session.words.slice(session.wordIndex);
        if (remainingWords.length <= 1) {
            return session.wordIndex;
        }

        // 1. If onboundary fired, map boundary character index to the corresponding word
        if (session.boundaryFired && session.boundaryCharIndex >= 0) {
            let accumulated = 0;
            for (let i = 0; i < remainingWords.length; i++) {
                accumulated += remainingWords[i].length + 1;
                if (session.boundaryCharIndex < accumulated) {
                    return session.wordIndex + i;
                }
            }
            return session.wordIndex + remainingWords.length - 1;
        }

        // 2. Elapsed time fallback (for engines/platforms where onboundary does not fire, e.g. Windows Chrome)
        const elapsedSec = Math.max(0, (performance.now() - session.sentenceStartTime) / 1000);
        // Average Spanish speaking rate: ~2.6 words/sec at 1.0 rate
        const wordsPerSec = 2.6 * (session.rate || 1.0);
        const estimatedSpoken = Math.floor(elapsedSec * wordsPerSec);
        return Math.min(
            session.wordIndex + estimatedSpoken,
            session.words.length - 1
        );
    };

    const playSentenceAt = (sentenceIndex, wordIndex, rate) => {
        if (!window.speechSynthesis) return;

        const session = speechSessionRef.current;
        if (sentenceIndex >= session.sentences.length) {
            stopSpeech();
            return;
        }

        const sentenceText = session.sentences[sentenceIndex] || '';
        const words = sentenceText.trim().split(/\s+/).filter(Boolean);
        if (words.length === 0) {
            playSentenceAt(sentenceIndex + 1, 0, rate);
            return;
        }

        if (wordIndex >= words.length) {
            if (sentenceIndex + 1 < session.sentences.length) {
                playSentenceAt(sentenceIndex + 1, 0, rate);
            } else {
                stopSpeech();
            }
            return;
        }

        const validWordIndex = Math.max(0, wordIndex);
        const wordsToSpeak = words.slice(validWordIndex);
        const textToSpeak = wordsToSpeak.join(' ');

        if (!textToSpeak.trim()) {
            if (sentenceIndex + 1 < session.sentences.length) {
                playSentenceAt(sentenceIndex + 1, 0, rate);
            } else {
                stopSpeech();
            }
            return;
        }

        const sessionId = ++session.id;
        session.sentenceIndex = sentenceIndex;
        session.words = words;
        session.wordIndex = validWordIndex;
        session.sentenceStartTime = performance.now();
        session.rate = rate;
        session.boundaryCharIndex = -1;
        session.boundaryFired = false;

        currentSpeechRef.current = { text: session.textIdentifier, rate };

        if (window.speechSynthesis.paused) {
            window.speechSynthesis.resume();
        }
        window.speechSynthesis.cancel();

        setTimeout(() => {
            if (speechSessionRef.current.id !== sessionId) return;

            const utterance = new SpeechSynthesisUtterance(textToSpeak);
            utterance.lang = listeningPreference || 'es-ES';
            utterance.rate = rate;

            if (window.speechSynthesis.getVoices) {
                const voices = window.speechSynthesis.getVoices();
                const preferredVoice = voices.find(v => v.lang === (listeningPreference || 'es-ES')) ||
                    voices.find(v => v.lang && v.lang.startsWith('es'));
                if (preferredVoice) {
                    utterance.voice = preferredVoice;
                }
            }

            utterance.onboundary = (event) => {
                if (speechSessionRef.current.id !== sessionId) return;
                speechSessionRef.current.boundaryFired = true;
                if (typeof event.charIndex === 'number') {
                    speechSessionRef.current.boundaryCharIndex = event.charIndex;
                }
            };

            utterance.onend = () => {
                if (speechSessionRef.current.id !== sessionId) return;
                const nextIdx = speechSessionRef.current.sentenceIndex + 1;
                if (nextIdx < speechSessionRef.current.sentences.length) {
                    playSentenceAt(nextIdx, 0, speechSessionRef.current.rate);
                } else {
                    stopSpeech();
                }
            };

            utterance.onerror = (event) => {
                if (speechSessionRef.current.id !== sessionId) return;
                if (event.error === 'canceled' || event.error === 'interrupted') return;
                console.warn("Speech synthesis error:", event.error);
                stopSpeech();
            };

            window.speechSynthesis.speak(utterance);
        }, 25);
    };

    const handleSpeak = (textToSpeak, rate = playbackRate) => {
        if (!textToSpeak || !window.speechSynthesis) return;

        // Toggle off if clicking the text/sentence currently playing
        if (
            window.speechSynthesis.speaking &&
            currentSpeechRef.current.text === textToSpeak &&
            !isPaused
        ) {
            stopSpeech();
            return;
        }

        stopSpeech();
        speechSessionRef.current = {
            id: ++speechSessionRef.current.id,
            sentences: [textToSpeak],
            sentenceIndex: 0,
            words: textToSpeak.trim().split(/\s+/).filter(Boolean),
            wordIndex: 0,
            sentenceStartTime: performance.now(),
            rate: rate,
            boundaryCharIndex: -1,
            boundaryFired: false,
            textIdentifier: textToSpeak
        };
        setPlayingState({ text: textToSpeak, rate });
        setIsPaused(false);
        playSentenceAt(0, 0, rate);
    };

    const togglePlaybackRate = () => {
        const RATES = [1.0, 0.90, 0.75, 0.5];
        const currentIndex = RATES.indexOf(playbackRate);
        const newRate = currentIndex !== -1 ? RATES[(currentIndex + 1) % RATES.length] : 1.0;
        setPlaybackRate(newRate);

        // If speech is currently active (speaking or paused)
        if (playingState.text && window.speechSynthesis) {
            const session = speechSessionRef.current;
            if (window.speechSynthesis.speaking && !isPaused) {
                // Actively speaking: seamlessly continue from the current word at the new speed
                const currentWord = calculateCurrentWordIndex();
                session.id++;
                if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                }
                window.speechSynthesis.cancel();
                setPlayingState(prev => ({ ...prev, rate: newRate }));
                playSentenceAt(session.sentenceIndex, currentWord, newRate);
            } else if (isPaused) {
                // Currently paused: remember the new rate so when resumed it plays at newRate
                session.rate = newRate;
                setPlayingState(prev => ({ ...prev, rate: newRate }));
            }
        }
    };

    const handlePlayPauseFullStory = () => {
        if (!window.speechSynthesis) return;

        if (playingState.text === fullStoryText) {
            if (isPaused) {
                // Resume from where it was paused (at current playbackRate)
                const session = speechSessionRef.current;
                setIsPaused(false);
                playSentenceAt(session.sentenceIndex, session.wordIndex, playbackRate);
            } else {
                // Pause current speech
                const currentWord = calculateCurrentWordIndex();
                speechSessionRef.current.wordIndex = currentWord;
                speechSessionRef.current.id++;
                if (window.speechSynthesis.paused) {
                    window.speechSynthesis.resume();
                }
                window.speechSynthesis.cancel();
                setIsPaused(true);
            }
        } else {
            // Start full story from the beginning
            stopSpeech();
            const sentences = article ? article.sentences.map(s => s.spanish).filter(Boolean) : [];
            if (sentences.length === 0) return;

            speechSessionRef.current = {
                id: ++speechSessionRef.current.id,
                sentences,
                sentenceIndex: 0,
                words: sentences[0].trim().split(/\s+/).filter(Boolean),
                wordIndex: 0,
                sentenceStartTime: performance.now(),
                rate: playbackRate,
                boundaryCharIndex: -1,
                boundaryFired: false,
                textIdentifier: fullStoryText
            };
            setPlayingState({ text: fullStoryText, rate: playbackRate });
            setIsPaused(false);
            playSentenceAt(0, 0, playbackRate);
        }
    };

    const handleStopFullStory = () => {
        stopSpeech();
    };

    const handleWordClick = (e, word, sentence) => {
        e.stopPropagation();
        const cleanedWordMatch = word.toLowerCase().match(/[\p{L}]+/gu);
        if (!cleanedWordMatch) return;

        const cleanedWord = cleanedWordMatch[0];
        const rect = e.target.getBoundingClientRect();

        if (!translations.has(cleanedWord)) {
            fetchTranslationForWord(cleanedWord);
        }
        const translation = translations.get(cleanedWord) || "Loading...";

        // Smart Popup Positioning
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;

        // Adjusting Y coordinate to not use window.scrollY because we are in an overflow container
        let x = rect.left;
        if (x + POPUP_WIDTH > screenWidth) {
            x = screenWidth - POPUP_WIDTH - 16;
        }
        if (x < 16) {
            x = 16;
        }

        let y;
        if (rect.bottom + POPUP_HEIGHT_ESTIMATE > screenHeight) {
            y = rect.top - POPUP_HEIGHT_ESTIMATE - 8;
        } else {
            y = rect.bottom + 8;
        }

        setLookupResult({ word: cleanedWord, translation: translation, sentence: sentence });
        setPopupPosition({ x, y });
        setIsEditing(false);
        setEditText((translation === "No translation found." || translation === "Loading...") ? "" : translation);
    };

    const closePopup = () => {
        setLookupResult(null);
        setIsEditing(false);
    };

    const handleSaveEdit = (e) => {
        e.stopPropagation();
        if (!lookupResult) return;

        saveWordTranslation(lookupResult.word, editText);
        setLookupResult(prev => ({ ...prev, translation: editText }));
        setIsEditing(false);
    };

    const handleFinishArticle = async (articleId) => {
        if (sessionWords.length > 5) {
            alert(`You have saved ${sessionWords.length} words. Only the first 5 words will be included in the flashcard review.`);
        }
        setIsCompleting(true);
        try {
            await markArticleAsFinished(articleId);
        } catch (error) {
            alert("Failed to save progress. Please check your connection and try again.", error.message);
        } finally {
            setIsCompleting(false);
        }
    }

    const triggerShake = (wordKey) => {
        setShakingWordKey(wordKey);
        setTimeout(() => setShakingWordKey(null), 400);
    };

    const handleSentenceWordClick = (e, sIndex, wIndex, rawWords) => {
        e.stopPropagation();
        if (lookupResult) closePopup();

        // 1. Initial selection
        if (!recordingSelection) {
            setRecordingSelection({ sentenceIndex: sIndex, startIndex: wIndex, endIndex: wIndex });
            return;
        }

        // 2. Different sentence isolation check
        if (recordingSelection.sentenceIndex !== sIndex) {
            triggerShake(`${sIndex}-${wIndex}`);
            return;
        }

        const { startIndex, endIndex } = recordingSelection;

        // 3. Deselection checks
        if (wIndex >= startIndex && wIndex <= endIndex) {
            // Sole word deselect
            if (startIndex === endIndex && wIndex === startIndex) {
                setRecordingSelection(null);
                return;
            }
            // Start boundary word deselect
            if (wIndex === startIndex) {
                setRecordingSelection(prev => ({ ...prev, startIndex: prev.startIndex + 1 }));
                return;
            }
            // End boundary word deselect
            if (wIndex === endIndex) {
                setRecordingSelection(prev => ({ ...prev, endIndex: prev.endIndex - 1 }));
                return;
            }
            // Inner word click -> confirmation toast
            setToastPrompt({
                message: "Deselecting this word will drop the entire selection. Do you want to continue?",
                onConfirm: () => {
                    setRecordingSelection(null);
                    setToastPrompt(null);
                },
                onCancel: () => {
                    setToastPrompt(null);
                }
            });
            return;
        }

        const endsWithPunctuation = (wordStr) => /[,.]$/.test((wordStr || '').trim());

        // 4. Forward Expansion (adjacent right)
        if (wIndex === endIndex + 1) {
            const prevWord = rawWords[endIndex];
            if (endsWithPunctuation(prevWord)) {
                setToastPrompt({
                    message: "The selected word crosses punctuation (comma/period). Continuing will drop your previous selection and start a new one here. Do you want to continue?",
                    onConfirm: () => {
                        setRecordingSelection({ sentenceIndex: sIndex, startIndex: wIndex, endIndex: wIndex });
                        setToastPrompt(null);
                    },
                    onCancel: () => {
                        setToastPrompt(null);
                    }
                });
                return;
            }
            setRecordingSelection(prev => ({ ...prev, endIndex: wIndex }));
            return;
        }

        // 5. Backward Expansion (adjacent left)
        if (wIndex === startIndex - 1) {
            const clickedWord = rawWords[wIndex];
            if (endsWithPunctuation(clickedWord)) {
                setToastPrompt({
                    message: "The selected word crosses punctuation (comma/period). Continuing will drop your previous selection and start a new one here. Do you want to continue?",
                    onConfirm: () => {
                        setRecordingSelection({ sentenceIndex: sIndex, startIndex: wIndex, endIndex: wIndex });
                        setToastPrompt(null);
                    },
                    onCancel: () => {
                        setToastPrompt(null);
                    }
                });
                return;
            }
            setRecordingSelection(prev => ({ ...prev, startIndex: wIndex }));
            return;
        }

        // 6. Invalid non-adjacent click
        triggerShake(`${sIndex}-${wIndex}`);
    };

    // Dynamic extraction of the contiguous selected words
    const selectedSentenceText = (() => {
        if (!recordingSelection || !article?.sentences) return "";
        const sentenceObj = article.sentences[recordingSelection.sentenceIndex];
        if (!sentenceObj?.spanish) return "";
        const words = sentenceObj.spanish.split(' ');
        return words.slice(recordingSelection.startIndex, recordingSelection.endIndex + 1).join(' ');
    })();

    const selectedWordsCount = recordingSelection
        ? recordingSelection.endIndex - recordingSelection.startIndex + 1
        : 0;

    const handleSaveRecordedSentence = async () => {
        if (!recordingSelection || !selectedSentenceText.trim()) return;

        const cleanSentence = selectedSentenceText.trim();

        if (savedWords.has(cleanSentence)) {
            setToastMessage("This sentence is already saved in your session!");
            setTimeout(() => setToastMessage(null), 2500);
            return;
        }

        try {
            await toggleSavedWord(cleanSentence, {
                translation: "",
                source: `Library (${article?.title || 'Story'})`
            });

            setToastMessage(`Sentence saved! ${sessionWords.length + 1} added in this session`);
            setTimeout(() => setToastMessage(null), 2500);

            // Reset selection so user can immediately record another sentence or exit
            setRecordingSelection(null);
            setIsRecordingSentence(null);
        } catch (error) {
            console.error("Error saving sentence:", error);
            alert("Could not save sentence. Please try again.");
        }
    };

    // --- Component Renders ---
    const renderedContent = (article.sentences || []).map((sentenceObj, sIndex) => {
        const rawWords = sentenceObj.spanish.split(' ');

        // Find all word indices in this sentence that belong to a saved sentence in sessionWords
        const savedSentenceIndices = new Set();
        const multiWordEntries = sessionWords.filter(item => item && item.includes(' '));

        multiWordEntries.forEach(phrase => {
            const phraseWords = phrase.split(' ');
            const pLen = phraseWords.length;
            if (pLen === 0) return;

            for (let i = 0; i <= rawWords.length - pLen; i++) {
                let matches = true;
                for (let j = 0; j < pLen; j++) {
                    if (rawWords[i + j] !== phraseWords[j]) {
                        matches = false;
                        break;
                    }
                }
                if (matches) {
                    for (let j = 0; j < pLen; j++) {
                        savedSentenceIndices.add(i + j);
                    }
                }
            }
        });

        return (
            <div key={sIndex} className="mb-2">
                <p className="leading-loose text-gray-700 dark:text-gray-200">
                    {rawWords.map((word, wIndex) => {
                        const cleanedWordMatch = word.toLowerCase().match(/[\p{L}]+/gu);
                        const cleanedWord = cleanedWordMatch ? cleanedWordMatch[0] : "";

                        const isSessionWord = sessionWords.includes(cleanedWord) || savedSentenceIndices.has(wIndex);
                        const baseClass = `cursor-pointer rounded transition-colors duration-150 ${isSessionWord ? 'bg-yellow-300 dark:bg-yellow-700 text-gray-900 dark:text-white font-medium hover:bg-yellow-400 dark:hover:bg-yellow-600' : 'hover:bg-yellow-200 dark:hover:bg-yellow-600'}`;
                        let adminClass = "";

                        // Check if admin is logged in and if word is missing translation
                        if (isAdmin && word.length > 0) {
                            if (cleanedWordMatch) {
                                if (translations.has(cleanedWord)) {
                                    const transData = translations.get(cleanedWord);
                                    const translation = typeof transData === 'object' ? transData.translation : transData;

                                    // If no translation is found, apply the admin highlight class
                                    if (!translation || translation === "No translation found") {
                                        adminClass = "bg-red-200 dark:bg-red-700 opacity-75"; // Highlight missing words
                                    }
                                }
                            }
                        }

                        const isSelectedInRecording = isRecordingSentence &&
                            recordingSelection &&
                            recordingSelection.sentenceIndex === sIndex &&
                            wIndex >= recordingSelection.startIndex &&
                            wIndex <= recordingSelection.endIndex;

                        const isShaking = shakingWordKey === `${sIndex}-${wIndex}`;

                        let recordingClass = "";
                        if (isSelectedInRecording) {
                            recordingClass = "bg-blue-600 dark:bg-blue-500 text-white font-medium ring-2 ring-blue-400";
                        } else if (isShaking) {
                            recordingClass = "animate-shake bg-red-200 dark:bg-red-800 text-red-900 dark:text-red-100 ring-2 ring-red-400";
                        }

                        return (
                            <span
                                key={wIndex}
                                className={`${baseClass} ${adminClass} ${recordingClass}`}
                                onClick={(e) => {
                                    if (isRecordingSentence) {
                                        handleSentenceWordClick(e, sIndex, wIndex, rawWords);
                                    } else {
                                        handleWordClick(e, word, sentenceObj.spanish);
                                    }
                                }}
                            >
                                {word}{' '}
                            </span>
                        );
                    })}
                </p>
                {showTranslations && (
                    <p className="leading-loose text-blue-600 dark:text-blue-400 mt-2 italic pl-10">
                        &rarr; {sentenceObj.english}
                    </p>
                )}
            </div>
        );
    });
    const renderPopup = () => {
        if (!lookupResult) return null;

        // Check if the current word is in the user's savedWords Set
        const isSaved = savedWords.has(lookupResult.word);
        const transData = translations.get(lookupResult.word);
        const liveTranslation = (typeof transData === 'object' ? transData.translation : transData) || lookupResult.translation;

        return (
            <div
                style={{ top: `${popupPosition.y}px`, left: `${popupPosition.x}px` }}
                // --- MODIFIED: Changed 'fixed' to 'absolute' to scroll with the page ---
                className={`fixed w-55 bg-gray-800 text-white text-sm font-semibold px-4 py-3 rounded-lg shadow-lg z-50`}
                onClick={(e) => e.stopPropagation()} // Prevents popup from closing when clicking inside it
            >
                <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center gap-2">
                        <p className="font-bold capitalize text-base">{lookupResult.word}</p>
                        <button
                            onClick={() => handleSpeak(lookupResult.word)}
                            className="text-gray-400 hover:text-custom-400 transition-colors"
                            title="Listen"
                        >
                            <BsFillVolumeUpFill size={16} />
                        </button>
                    </div>

                    {/* --- NEW: Save Word Button --- */}
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            toggleSavedWord(lookupResult.word, {
                                translation: liveTranslation,
                                source: `Library (${article.title})`
                            })
                        }}
                        className={`text-2xl ${isSaved ? 'text-yellow-400' : 'text-gray-400'} hover:text-yellow-300 transition-colors`}
                        title={isSaved ? "Remove from saved words" : "Save word for training"}
                    >
                        {isSaved ? <BsBookmarkFill /> : <BsBookmark />}
                    </button>
                </div>

                {/* Admin Editing UI */}
                {isEditing ? (
                    <div>
                        <textarea
                            className="w-full bg-gray-700 text-white rounded p-2 text-sm"
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            rows={2}
                        />
                        <button
                            onClick={handleSaveEdit}
                            className="w-full mt-2 px-3 py-1 bg-green-600 hover:bg-green-700 rounded text-white font-bold"
                        >
                            Save
                        </button>
                    </div>
                ) : (
                    // Standard Translation View
                    <div>
                        <p className="font-normal">&rarr; {liveTranslation}</p>
                        {liveTranslation === "No translation found" && (
                            <a
                                href={`https://translate.google.com/?sl=es&tl=en&text=${encodeURIComponent(lookupResult.word)}&op=translate`}
                                className="text-custom-300 hover:underline text-xs"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Translate with Google.
                            </a>
                        )}
                        {isAdmin && (
                            <button
                                onClick={() => {
                                    setIsEditing(true);
                                    setEditText((liveTranslation === "No translation found." || liveTranslation === "Loading...") ? "" : liveTranslation);
                                }}
                                className="w-full mt-2 px-3 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white font-bold text-xs"
                            >
                                {liveTranslation === "No translation found." ? "Add" : "Edit"} Translation
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full h-full overflow-y-auto pb-32 sm:pb-36 animate-fade-in bg-white dark:bg-gray-900" onClick={closePopup} onScroll={closePopup}>
            {toastPrompt && (
                <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in max-w-sm w-full px-4">
                    <div className="bg-gray-900/95 dark:bg-gray-800/95 backdrop-blur-md border border-amber-500/60 text-white p-4 rounded-xl shadow-2xl flex flex-col gap-3">
                        <p className="text-sm font-medium text-gray-100">{toastPrompt.message}</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={toastPrompt.onCancel}
                                className="px-3 py-1 text-xs font-semibold rounded bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={toastPrompt.onConfirm}
                                className="px-3 py-1 text-xs font-semibold rounded bg-amber-600 hover:bg-amber-500 text-white transition-colors"
                            >
                                Continue
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {toastMessage && (
                <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 animate-fade-in">
                    <div className="bg-linear-to-r from-blue-500 to-teal-500 text-white px-4 py-2 rounded-lg shadow-lg font-semibold text-sm text-center whitespace-nowrap">
                        {toastMessage}
                    </div>
                </div>
            )}
            {renderPopup()}
            <div className="max-w-xl m-auto p-6 rounded-lg shadow-lg mb-8">
                <p className="flex justify-center items-center gap-2 rounded-lg p-2 bg-amber-100 text-gray-700 mb-5 text-left italic text-md">
                    <FaInfoCircle className="shrink-0" /><BsBookmark className="inline" />  Click on any word to see its translation and save it for later review
                </p>
                <div className="mb-3 max-w-2xl mx-auto">
                    <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-200">{article.title}</h1>
                </div>
                <div className="flex items-center justify-between flex-wrap gap-2 max-w-2xl mb-4">
                    <div className="flex gap-2">
                        <button onClick={() => {
                            setShowTranslations(!showTranslations);
                            setIsTranslationsOn(!isTranslationsOn);
                        }} className={`text-sm px-3 py-1 text-gray-100 rounded hover:bg-gray-300 dark:hover:bg-green-600 transition-colors ` + (isTranslationsOn ? 'bg-green-800' : 'bg-green-500')}>
                            {showTranslations ? 'Hide translations' : 'Show translations'}
                        </button>
                        <button
                            onClick={() => {
                                if (isRecordingSentence) {
                                    setIsRecordingSentence(false);
                                    setRecordingSelection(null);
                                    setToastPrompt(null);
                                } else {
                                    setIsRecordingSentence(true);
                                    setRecordingSelection(null);
                                    closePopup();
                                }
                            }}
                            className={`text-sm px-3 py-1 text-white font-semibold rounded transition-colors ${isRecordingSentence ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            {isRecordingSentence ? 'Cancel Recording' : 'Record Sentence'}
                        </button>
                    </div>
                    {isAdmin && (
                        <button
                            onClick={() => setIsMissingWordsDrawerOpen(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm transform hover:scale-105 active:scale-95"
                            title="Open Dictionary Inspector for this story"
                        >
                            <FaBook className="text-xs" />
                            <span>Missing Words</span>
                            {missingWords.length > 0 ? (
                                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-bold">
                                    {missingWords.length}
                                </span>
                            ) : (
                                <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold">
                                    0
                                </span>
                            )}
                        </button>
                    )}
                </div>

                <div className="text-lg text-gray-700 dark:text-gray-200 space-y-6 max-w-2xl mx-auto">
                    {isDictionaryLoading ? <p>Loading...</p> : renderedContent}
                </div>
                <div className="mt-12 flex justify-center pb-12">
                    <button
                        onClick={() => handleFinishArticle(articleId)}
                        className="px-10 py-4 bg-linear-to-r from-red-500 to-purple-500 text-white font-bold rounded-full shadow-lg hover:bg-blue-700 transition-transform transform hover:scale-105 flex items-center justify-center w-64"
                        disabled={isCompleting}
                    >
                        {isCompleting ? (
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                        ) : 'Continue to Review ➔'}
                    </button>
                </div>

            </div>
            {/* Floating Bottom Control Bar */}
            <div
                className="fixed bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-50 pointer-events-auto"
                onClick={(e) => e.stopPropagation()}
            >
                {isRecordingSentence ? (
                    <div className="flex items-center gap-2 sm:gap-3 px-3.5 py-2 sm:px-4 sm:py-2.5 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-full shadow-2xl border border-blue-500/60 dark:border-blue-400/60 transition-all max-w-[95vw] sm:max-w-md w-max">
                        <div className="flex-1 min-w-0 pr-1">
                            {recordingSelection ? (
                                <p className="text-xs sm:text-sm font-medium text-gray-800 dark:text-gray-100 truncate max-w-44 sm:max-w-60">
                                    &ldquo;{selectedSentenceText}&rdquo;
                                    <span className="ml-1.5 text-[11px] text-gray-500 dark:text-gray-400 font-normal">
                                        ({selectedWordsCount} {selectedWordsCount === 1 ? 'word' : 'words'})
                                    </span>
                                </p>
                            ) : (
                                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 italic">
                                    Click adjacent words to select...
                                </p>
                            )}
                        </div>

                        {recordingSelection && (
                            <button
                                onClick={() => setRecordingSelection(null)}
                                className="text-xs font-semibold px-2 py-1 text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors shrink-0"
                                title="Clear current selection"
                            >
                                Clear
                            </button>
                        )}

                        <button
                            onClick={handleSaveRecordedSentence}
                            disabled={!recordingSelection}
                            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold transition-all shadow-sm shrink-0 ${recordingSelection
                                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white transform hover:scale-105 active:scale-95 cursor-pointer shadow-emerald-500/20'
                                    : 'bg-gray-200/80 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                }`}
                            title={recordingSelection ? "Save this sentence to your review session" : "Select words first to save"}
                        >
                            <span>Save Sentence</span>
                        </button>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 sm:gap-3 px-3 py-1.5 sm:px-4 sm:py-2 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md rounded-full shadow-xl border border-gray-200/90 dark:border-gray-700/90 transition-all">
                        {lookupResult?.sentence ? (
                            <button
                                onClick={() => handleSpeak(lookupResult.sentence, playbackRate)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500 text-white rounded-full shadow-sm hover:bg-blue-600 transition-all transform hover:scale-105 active:scale-95 text-xs font-bold focus:outline-none shrink-0"
                                title="Play Selected Sentence"
                            >
                                <CiPlay1 className="text-sm sm:text-base" />
                                <span>Sentence</span>
                            </button>
                        ) : (
                            <button
                                disabled
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-200/60 dark:bg-gray-700/50 text-gray-400 dark:text-gray-500 rounded-full text-xs font-semibold cursor-not-allowed focus:outline-none shrink-0"
                                title="Click any word to play its sentence"
                            >
                                <CiPlay1 className="text-sm sm:text-base" />
                                <span>Sentence</span>
                            </button>
                        )}

                        {/* Vertical Divider */}
                        <div className="h-5 w-px bg-gray-200 dark:bg-gray-700 shrink-0" />

                        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
                            {/* Speed Toggle Button */}
                            <button
                                onClick={togglePlaybackRate}
                                className="flex items-center justify-center min-w-7 h-7 sm:min-w-8 sm:h-8 px-1.5 shrink-0 rounded-full border border-blue-500 text-blue-600 dark:text-blue-400 font-bold text-[11px] sm:text-xs transition-transform transform hover:scale-105 active:scale-95 focus:outline-none"
                                title="Adjust Reading Speed"
                            >
                                {playbackRate === 0.9 ? '.90x' : `${playbackRate}x`}
                            </button>
                            {/* Full Story Play/Pause */}
                            <button
                                onClick={handlePlayPauseFullStory}
                                className="text-2xl sm:text-[26px] text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-transform transform hover:scale-110 active:scale-95 focus:outline-none flex items-center justify-center shrink-0"
                                title={playingState.text === fullStoryText && !isPaused ? "Pause Story" : "Play Story"}
                            >
                                {playingState.text === fullStoryText && !isPaused ? <FaRegPauseCircle /> : <FaPlayCircle />}
                            </button>
                            {/* Full Story Stop */}
                            <button
                                onClick={handleStopFullStory}
                                disabled={playingState.text !== fullStoryText}
                                className={`text-2xl sm:text-[26px] transition-transform focus:outline-none flex items-center justify-center shrink-0 ${playingState.text === fullStoryText
                                    ? 'text-red-500 hover:text-red-600 hover:scale-110 active:scale-95 cursor-pointer'
                                    : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                    }`}
                                title="Stop Story"
                            >
                                <FaStopCircle />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Admin Missing Words Drawer */}
            {isAdmin && (
                <AdminMissingWordsDrawer
                    isOpen={isMissingWordsDrawerOpen}
                    onClose={() => setIsMissingWordsDrawerOpen(false)}
                    missingWords={missingWords}
                    articleTitle={article?.title}
                />
            )}
        </div>
    );
};

export default StoryReader;