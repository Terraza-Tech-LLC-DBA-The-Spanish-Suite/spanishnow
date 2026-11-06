import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDecksStore } from '../store';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { CgPlayButtonR } from "react-icons/cg";
import { FaStopCircle, FaKeyboard, FaMicrophone } from "react-icons/fa";
import Modal from './Modal';

export default function AIChatPractice({ articleId, targetVocabulary, onComplete }) {
    const MAX_FREE_INTERACTIONS = 5;
    const navigate = useNavigate();
    const article = useDecksStore((state) => state.articles[articleId]);
    const listeningPreference = useDecksStore((state) => state.listeningPreference);
    const scenariosAiInstructions = useDecksStore((state) => state.scenariosAiInstructions);
    const fetchScenarios = useDecksStore((state) => state.fetchScenarios);
    const isAdmin = useDecksStore((state) => state.isAdmin);
    const hasActiveSubscription = useDecksStore((state) => state.hasActiveSubscription);

    const isPremium = isAdmin || hasActiveSubscription;

    const [showLimitModal, setShowLimitModal] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [userSpeech, setUserSpeech] = useState('');
    const [chatHistory, setChatHistory] = useState([]);
    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [inputMode, setInputMode] = useState('voice');

    const recognitionRef = useRef(null);
    const chatContainerRef = useRef(null);
    const finalTranscriptRef = useRef('');
    const shouldListenRef = useRef(false);

    // --- NEW: Audio tracking ---
    const activeAudioRef = useRef(null);
    const intendedAudioIndexRef = useRef(null);
    const [playingAudioIndex, setPlayingAudioIndex] = useState(null);

    useEffect(() => {
        return () => stopAudio();
    }, []);

    const stopAudio = () => {
        if (activeAudioRef.current) {
            activeAudioRef.current.pause();
            activeAudioRef.current.removeAttribute('src');
            activeAudioRef.current.load();
            activeAudioRef.current = null;
        }
        setPlayingAudioIndex(null);
        intendedAudioIndexRef.current = null;
    };

    const playAudioFromBase64 = (base64String, index) => {
        if (intendedAudioIndexRef.current !== index) return;
        const audio = new Audio(`data:audio/mp3;base64,${base64String}`);
        activeAudioRef.current = audio;
        setPlayingAudioIndex(index);
        audio.onended = () => {
            // Aggressively release audio hardware to immediately free the microphone
            audio.pause();
            audio.removeAttribute('src');
            audio.load();

            setPlayingAudioIndex(null);
            activeAudioRef.current = null;
            intendedAudioIndexRef.current = null;
        };
        audio.play().catch(err => {
            console.error("Audio playback error:", err);
            audio.removeAttribute('src');
            audio.load();
            setPlayingAudioIndex(null);
            activeAudioRef.current = null;
            intendedAudioIndexRef.current = null;
        });
    };

    const handleSpeechError = (errorType) => {
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Mac") && "ontouchend" in document);
        const isSafari = /Safari/.test(navigator.userAgent) && !/Chrome|CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);

        if (isIOS && !isSafari) {
            alert("Voice features are restricted by Apple in third-party browsers. Please open this app in Safari.");
        } else if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
            alert("Microphone access was denied. Please check your browser permissions.");
        } else if (errorType === 'not-supported') {
            alert("Speech Recognition is not supported in this browser. Please try Chrome or Safari.");
        }
    };

    const interactionCount = useDecksStore((state) => state.interactionCount);
    const incrementInteractionCount = useDecksStore((state) => state.incrementInteractionCount);
    const InteractionCounts = () => {
        return (
            <div className="my-2 text-center">
                <span className="text-sm font-semibold text-orange-600 bg-orange-100 px-3 py-1 rounded-full">
                    Free Interactions left: {MAX_FREE_INTERACTIONS - interactionCount}
                </span>
            </div>
        )
    }

    // Ensure AI instructions are loaded
    useEffect(() => {
        fetchScenarios();
    }, [fetchScenarios]);

    useEffect(() => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false;
            recognitionRef.current.interimResults = true;
            recognitionRef.current.lang = listeningPreference || 'es-ES';

            recognitionRef.current.onstart = () => setIsRecording(true);

            recognitionRef.current.onend = () => {
                if (shouldListenRef.current) {
                    try { recognitionRef.current.start(); } catch (e) {
                        setIsRecording(false);
                        shouldListenRef.current = false;
                    }
                } else {
                    setIsRecording(false);
                }
            };

            recognitionRef.current.onresult = (event) => {
                let interimTranscript = '';
                let finalChunk = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalChunk += event.results[i][0].transcript.trim() + ' ';
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                if (finalChunk) finalTranscriptRef.current += finalChunk;
                setUserSpeech(finalTranscriptRef.current + interimTranscript);
            };

            recognitionRef.current.onerror = (event) => {
                console.error("Speech recognition error", event.error);
                shouldListenRef.current = false;
                setIsRecording(false);
                if (event.error !== 'no-speech' && event.error !== 'aborted') {
                    handleSpeechError(event.error);
                }
            };
        }
        return () => {
            if (recognitionRef.current) recognitionRef.current.abort();
        };
    }, [listeningPreference]);

    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [chatHistory, isAiProcessing]);

    const startListening = () => {
        stopAudio();
        if (recognitionRef.current && !isRecording) {
            try {
                shouldListenRef.current = true;
                setUserSpeech('');
                finalTranscriptRef.current = '';
                recognitionRef.current.start();
            } catch (error) {
                console.error("Error starting speech recognition:", error);
                shouldListenRef.current = false;
                setIsRecording(false);
            }
        } else if (!recognitionRef.current) {
            handleSpeechError('not-supported');
        }
    };

    const stopListening = () => {
        shouldListenRef.current = false;
        if (recognitionRef.current && isRecording) {
            recognitionRef.current.stop();
        }
    };

    const toggleRecording = () => {
        if (isRecording) {
            stopListening();
        } else {
            startListening();
        }
    };

    const playMessageAudio = async (msg, index) => {
        if (playingAudioIndex === index) {
            stopAudio();
            return;
        }

        stopAudio();
        intendedAudioIndexRef.current = index;
        setPlayingAudioIndex(index);

        if (msg.audio) {
            playAudioFromBase64(msg.audio, index);
        } else {
            try {
                const functions = getFunctions(getApp());
                const generateAudioTTS = httpsCallable(functions, 'generateAudioTTS');
                const audioResult = await generateAudioTTS({ text: msg.text });
                const base64Audio = audioResult.data.audioBase64;

                setChatHistory(prev => {
                    const newHistory = [...prev];
                    if (newHistory[index]) {
                        newHistory[index].audio = base64Audio;
                    }
                    return newHistory;
                });

                playAudioFromBase64(base64Audio, index);
            } catch (error) {
                console.error("Failed to generate TTS audio:", error);
                if (intendedAudioIndexRef.current === index) {
                    stopAudio();
                }
            }
        }
    };

    const handleSend = async () => {
        if (!userSpeech.trim()) return;

        if (!isPremium && interactionCount >= MAX_FREE_INTERACTIONS) {
            setShowLimitModal(true);
            return;
        }

        const newUserMessage = { role: 'user', text: userSpeech };
        const newHistory = [...chatHistory, newUserMessage];
        setChatHistory(newHistory);
        setUserSpeech('');
        setIsAiProcessing(true);

        try {
            const functions = getFunctions(getApp());
            const chatForLesson = httpsCallable(functions, 'chatForLesson');

            const result = await chatForLesson({
                history: newHistory,
                articleId: articleId,
                targetVocabulary: targetVocabulary || [],
                date: new Date().toLocaleDateString('en-CA')
            });

            const aiResponseText = result.data.text;

            setChatHistory(prev => [...prev, { role: 'model', text: aiResponseText }]);
            if (!isPremium) incrementInteractionCount();

            // Auto generate and play audio
            try {
                const newModelIndex = newHistory.length;
                intendedAudioIndexRef.current = newModelIndex;
                setPlayingAudioIndex(newModelIndex);

                const generateAudioTTS = httpsCallable(functions, 'generateAudioTTS');
                const audioResult = await generateAudioTTS({ text: aiResponseText });
                const base64Audio = audioResult.data.audioBase64;

                setChatHistory(prev => {
                    const updatedHistory = [...prev];
                    const lastIndex = updatedHistory.length - 1;
                    if (updatedHistory[lastIndex] && updatedHistory[lastIndex].role === 'model') {
                        updatedHistory[lastIndex].audio = base64Audio;
                    }
                    return updatedHistory;
                });

                playAudioFromBase64(base64Audio, newModelIndex);
            } catch (error) {
                console.error("Failed to generate TTS audio:", error);
                if (intendedAudioIndexRef.current === newModelIndex) {
                    stopAudio();
                }
            }
        } catch (error) {
            console.error("Error calling Gemini:", error);
            setChatHistory(prev => [...prev, { role: 'model', text: `Error: ${error.message}` }]);
        } finally {
            setIsAiProcessing(false);
        }
    };

    const renderHighlightedSpeech = (speech) => {
        const cleanSpeech = speech ? speech.replace(/[*_#~`]/g, '') : '';
        if (!targetVocabulary || targetVocabulary.length === 0) return cleanSpeech;

        const escapedVocab = targetVocabulary.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
        // Uses Unicode boundaries so it only highlights isolated words (ignoring punctuation/spaces) but supports Spanish accents
        const regex = new RegExp(`(?<![\\p{L}\\p{M}\\p{N}_])(${escapedVocab})(?![\\p{L}\\p{M}\\p{N}_])`, 'giu');
        const parts = cleanSpeech.split(regex);

        return (
            <>
                {parts.map((part, i) => {
                    const isVocab = targetVocabulary.some(v => v.toLowerCase() === part.toLowerCase());
                    return isVocab
                        ? <span key={i} className="text-white bg-yellow-600 mx-1 px-1 rounded">{part}</span>
                        : part;
                })}
            </>
        );
    };

    return (
        <div className="flex flex-col h-full w-full max-w-3xl mx-auto p-4 animate-fade-in pb-24">
            <div className="text-center mb-2">
                <h2 className="text-2xl font-bold text-teal-600 dark:text-teal-400">Put it into Practice</h2>
                {!isPremium &&
                    <InteractionCounts />
                }
            </div>

            <div ref={chatContainerRef} className="flex-1 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900 mb-4">
                <div className="text-center mb-4">
                    <p className="text-lg text-gray-600 dark:text-gray-300 mt-1">
                        Chat with AI about <strong>{article?.title}</strong>
                    </p>

                    {targetVocabulary && targetVocabulary.length > 0 && (
                        <p className="flex flex-wrap gap-1 text-md text-gray-500 dark:text-gray-400 mt-2">
                            Try to use: {targetVocabulary.map(word => (
                                <span key={word} className='gap-1 text-white bg-blue-700 mx-1 px-2 py-1 rounded'>
                                    {word}
                                </span>
                            ))}
                        </p>
                    )}
                </div>
                {chatHistory.length === 0 && (
                    <div className="text-center text-gray-500 dark:text-gray-400 mt-2">
                        <p>Start the conversation!</p>
                        <p className="text-sm mt-2">Try saying: <i>"Hola, acabo de leer la historia."</i></p>
                    </div>
                )}
                {chatHistory.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] my-2 p-3 rounded-lg shadow-sm ${msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-bl-none'
                            }`}>
                            {renderHighlightedSpeech(msg.text)}
                        </div>
                        {msg.role !== 'user' && (
                            <div className="ml-2 cursor-pointer hover:text-teal-500 transition-colors flex flex-col justify-center flex-start w-10 h-10" onClick={() => playMessageAudio(msg, index)}>
                                {playingAudioIndex === index ? (
                                    <FaStopCircle className="inline mr-1 w-8 h-8" />
                                ) : (
                                    <CgPlayButtonR className="inline mr-1 w-8 h-8" />
                                )}
                            </div>
                        )}
                    </div>
                ))}
                {isAiProcessing && (
                    <div className="flex justify-start">
                        <div className="bg-gray-200 dark:bg-gray-700 text-gray-500 px-4 py-2 rounded-lg rounded-bl-none animate-pulse">
                            Thinking...
                        </div>
                    </div>
                )}
            </div>

            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 mb-4 select-none relative transition-all duration-300">
                {/* Segmented Mode Toggle */}
                <div className="flex bg-gray-200 dark:bg-gray-800 p-1 rounded-xl mb-8 w-full max-w-[220px] shadow-inner relative z-10 border dark:border-gray-700">
                    <button
                        disabled={isRecording || isAiProcessing}
                        onClick={() => setInputMode('voice')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all duration-200 ${inputMode === 'voice'
                                ? 'bg-white dark:bg-gray-700 shadow-md text-custom-600 dark:text-custom-400 font-bold'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30'
                            }`}
                    >
                        <FaMicrophone size={14} />
                        <span className="text-[10px] uppercase tracking-widest">Voice</span>
                    </button>
                    <button
                        disabled={isRecording || isAiProcessing}
                        onClick={() => setInputMode('text')}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg transition-all duration-200 ${inputMode === 'text'
                                ? 'bg-white dark:bg-gray-700 shadow-md text-custom-600 dark:text-custom-400 font-bold'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-30'
                            }`}
                    >
                        <FaKeyboard size={14} />
                        <span className="text-[10px] uppercase tracking-widest">Text</span>
                    </button>
                </div>

                {inputMode === 'voice' ? (
                    <>
                        <div className="flex items-center justify-center">
                            <button
                                onClick={toggleRecording}
                                onContextMenu={(e) => e.preventDefault()}
                                style={{ WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTapHighlightColor: 'transparent' }}
                                className={`p-5 rounded-full shadow-2xl transition-all transform hover:scale-105 active:scale-95 touch-none select-none ${isRecording
                                        ? 'bg-red-500 text-white animate-pulse ring-8 ring-red-500/20 shadow-red-500/40'
                                        : 'bg-custom-500 text-white hover:bg-custom-600 shadow-custom-500/40'
                                    }`}
                                aria-label={isRecording ? "Tap to stop recording" : "Tap to start recording"}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                </svg>
                            </button>
                        </div>

                        <div className="mt-8 text-center min-h-12 w-full px-4">
                            {isRecording ? (
                                <p className="text-red-500 font-bold animate-pulse tracking-wide uppercase text-xs">Listening... (Tap to stop)</p>
                            ) : userSpeech ? (
                                <div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] mb-2">Speech Preview:</p>
                                    <p className="text-lg font-medium text-gray-800 dark:text-gray-200 italic mb-6">"{renderHighlightedSpeech(userSpeech)}"</p>
                                    <div className="flex gap-3 justify-center">
                                        <button
                                            onClick={handleSend}
                                            className="px-10 py-2.5 bg-blue-600 text-white font-bold rounded-full shadow-lg hover:bg-blue-700 transition-all transform active:scale-95"
                                        >
                                            Send
                                        </button>
                                        <button
                                            onClick={() => setUserSpeech('')}
                                            className="px-6 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-gray-500 dark:text-gray-400 text-sm font-medium tracking-wide">Tap the microphone to start speaking</p>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="w-full relative px-2">
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] mb-3 text-left">Your Message:</label>
                        <textarea
                            value={userSpeech}
                            onChange={(e) => setUserSpeech(e.target.value)}
                            className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none shadow-inner"
                            rows="2"
                            placeholder="Escribe algo en español..."
                        ></textarea>
                        <div className="mt-6 flex gap-3 justify-center">
                            <button
                                onClick={handleSend}
                                disabled={!userSpeech.trim() || isAiProcessing}
                                className="px-10 py-2.5 bg-blue-600 text-white font-bold rounded-full shadow-lg hover:bg-blue-700 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Send
                            </button>
                            <button
                                onClick={() => setUserSpeech('')}
                                className="px-6 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold rounded-full hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
                            >
                                Clear
                            </button>
                        </div>
                    </div>
                )}
            </div>


            <div className="flex justify-center mt-2">
                <button
                    onClick={onComplete}
                    className="px-8 py-3 bg-green-600 text-white font-bold rounded-full shadow-lg hover:bg-green-700 transition-transform transform hover:scale-105 w-full max-w-sm flex justify-center items-center gap-2"
                >
                    Finish Lesson ➔
                </button>
            </div>

            <Modal
                isOpen={showLimitModal}
                onClose={() => setShowLimitModal(false)}
                title="Premium Limit Reached 🔒"
                footer={
                    <div className="flex gap-2 text-sm sm:text-base">
                        <button
                            onClick={() => setShowLimitModal(false)}
                            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 font-bold rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-95"
                        >
                            Close
                        </button>
                        <button
                            onClick={() => {
                                setShowLimitModal(false);
                                navigate('/#premium');
                            }}
                            className="px-4 py-2 bg-linear-to-r from-red-500 to-purple-600 hover:from-red-600 hover:to-purple-700 text-white font-bold rounded-xl shadow-md transition-all active:scale-95"
                        >
                            Get Premium
                        </button>
                    </div>
                }
            >
                <p>You've reached the limit of {MAX_FREE_INTERACTIONS} free interactions. Please upgrade to Premium to continue.</p>
            </Modal>
        </div>
    );
}
