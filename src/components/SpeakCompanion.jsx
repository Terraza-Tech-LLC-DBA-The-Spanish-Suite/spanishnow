import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDecksStore } from '../store';
import Modal from './Modal';
import { getApp } from 'firebase/app';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { CgPlayButtonR } from "react-icons/cg";
import { BsCheckCircleFill } from "react-icons/bs";
import { FaInfoCircle, FaStopCircle, FaKeyboard, FaMicrophone } from "react-icons/fa";

const MAX_FREE_INTERACTIONS = 5;
const MAX_FREE_CHARS = 100;

// --- NEW: Custom Circular Progress Component ---
export const CircularProgress = ({ percentage, size = 50, strokeWidth = 4 }) => {
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percentage / 100) * circumference;

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            {/* Background Circle */}
            <svg className="transform -rotate-90 w-full h-full">
                <circle
                    className="text-gray-200 dark:text-gray-700"
                    strokeWidth={strokeWidth}
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
                {/* Progress Circle */}
                <circle
                    className="text-custom-500 transition-all duration-1000 ease-out"
                    strokeWidth={strokeWidth}
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx={size / 2}
                    cy={size / 2}
                />
            </svg>
            <span className="absolute text-xs font-bold text-gray-700 dark:text-gray-200">
                {Math.round(percentage)}%
            </span>
        </div>
    );
};

const SpeakCompanion = () => {
    const { scenarioId, roleIndex } = useParams();
    const navigate = useNavigate();

    const listeningPreference = useDecksStore((state) => state.listeningPreference);
    const isAdmin = useDecksStore((state) => state.isAdmin);
    const hasActiveSubscription = useDecksStore((state) => state.hasActiveSubscription);
    const currentUser = useDecksStore((state) => state.currentUser);
    const isPremium = isAdmin || hasActiveSubscription;


    const scenarios = useDecksStore((state) => state.scenarios);
    const scenariosAiInstructions = useDecksStore((state) => state.scenariosAiInstructions);
    const fetchScenarios = useDecksStore((state) => state.fetchScenarios);
    const fetchSpeakProgress = useDecksStore((state) => state.fetchSpeakProgress);
    const isScenariosLoading = useDecksStore((state) => state.isScenariosLoading);
    const [isRecording, setIsRecording] = useState(false);
    const [userSpeech, setUserSpeech] = useState('');
    const [chatHistory, setChatHistory] = useState([]);

    // --- Derived state from URL ---
    const selectedScenario = useMemo(() =>
        scenarios.find(s => s.id === scenarioId),
        [scenarios, scenarioId]);

    const selectedContextAndObjectives = useMemo(() =>
        (selectedScenario && roleIndex !== undefined) ? selectedScenario.rolePlays[parseInt(roleIndex, 10)] : null,
        [selectedScenario, roleIndex]);

    const [isAiProcessing, setIsAiProcessing] = useState(false);
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [limitMessage, setLimitMessage] = useState('');
    const [inputMode, setInputMode] = useState('voice'); // 'voice' or 'text'

    const speakProgress = useDecksStore((state) => state.speakProgress);
    const updateSpeakProgressLocal = useDecksStore((state) => state.updateSpeakProgressLocal);
    const rollbackSpeakProgressLocal = useDecksStore((state) => state.rollbackSpeakProgressLocal);
    const handleXpResult = useDecksStore((state) => state.handleXpResult);
    const interactionCount = useDecksStore((state) => state.interactionCount);
    const incrementInteractionCount = useDecksStore((state) => state.incrementInteractionCount);

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

    // Fetch Scenarios and Goals from Firestore
    useEffect(() => {
        fetchScenarios();
        fetchSpeakProgress();
    }, [fetchScenarios, fetchSpeakProgress]);

    useEffect(() => {
        // Check for browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (SpeechRecognition) {
            recognitionRef.current = new SpeechRecognition();
            recognitionRef.current.continuous = false; // Use manual restart to avoid Android bugs
            recognitionRef.current.interimResults = true; // Get real-time results
            // Default to Spanish, use store preference if available
            recognitionRef.current.lang = listeningPreference || 'es-ES';

            recognitionRef.current.onstart = () => {
                setIsRecording(true);
            };

            recognitionRef.current.onend = () => {
                if (shouldListenRef.current) {
                    try {
                        recognitionRef.current.start();
                    } catch (error) {
                        console.error("Failed to restart speech recognition:", error);
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
                    const transcript = event.results[i][0].transcript;
                    if (event.results[i].isFinal) {
                        finalChunk += transcript.trim() + ' ';
                    } else {
                        interimTranscript += transcript;
                    }
                }

                if (finalChunk) {
                    finalTranscriptRef.current += finalChunk;
                }
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
            if (recognitionRef.current) {
                recognitionRef.current.abort();
            }
        };
    }, [listeningPreference]);

    // Scroll to bottom of chat when history changes
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
                setUserSpeech(''); // Clear previous speech
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
    const InteractionCounts = () => {
        return (
            <div className="mb-6 text-center">
                <span className="text-sm font-semibold text-orange-600 bg-orange-100 px-3 py-1 rounded-full">
                    Free Interactions left: {MAX_FREE_INTERACTIONS}
                </span>
            </div>
        )
    }

    const handleSend = async () => {
        if (!userSpeech.trim()) return;

        if (!isPremium) {
            if (interactionCount >= MAX_FREE_INTERACTIONS) {
                const now = new Date();
                const tomorrow = new Date(now);
                tomorrow.setDate(tomorrow.getDate() + 1);
                const dayName = tomorrow.toLocaleDateString('en-US', { weekday: 'long' });
                setLimitMessage(`You've reached the limit of ${MAX_FREE_INTERACTIONS} interactions for the free tier. You can chat again on ${dayName} after 12:00 AM. Upgrade to Premium for unlimited conversations!`);
                setShowLimitModal(true);
                return;
            }
            if (userSpeech.length > MAX_FREE_CHARS) {
                setLimitMessage(`Your message is too long (${userSpeech.length} chars). Free tier limit is ${MAX_FREE_CHARS} characters.`);
                setShowLimitModal(true);
                return;
            }
        }

        const newUserMessage = { role: 'user', text: userSpeech };
        const newHistory = [...chatHistory, newUserMessage];
        setChatHistory(newHistory);
        setUserSpeech(''); // Clear input
        setIsAiProcessing(true);

        try {
            const functions = getFunctions(getApp());
            const chatWithGemini = httpsCallable(functions, 'chatWithGemini');
            const today = new Date().toLocaleDateString('en-CA'); // Get local date to send to backend

            const result = await chatWithGemini({
                history: newHistory,
                personaId: selectedScenario.id,
                rolePlayName: selectedContextAndObjectives.name,
                date: today
            });

            const aiResponseText = result.data.text;
            handleXpResult(result.data); // Handle potential streak updates

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
            if (error.message.includes('limit')) {
                setLimitMessage(error.message);
                setShowLimitModal(true);
            } else {
                setChatHistory(prev => [...prev, { role: 'model', text: `Error: ${error.message}` }]);
            }
        } finally {
            setIsAiProcessing(false);
        }
    };

    // --- NEW: Handle marking a roleplay as complete ---
    const handleCompleteRolePlay = async () => {
        if (!currentUser || !selectedScenario || !selectedContextAndObjectives) return;

        const scenarioId = selectedScenario.id;
        const rolePlayName = selectedContextAndObjectives.name;
        const wasAlreadyCompleted = speakProgress[scenarioId]?.includes(rolePlayName);

        // Optimistic UI update if not already marked as complete locally
        if (!wasAlreadyCompleted) {
            updateSpeakProgressLocal(scenarioId, rolePlayName);
            // TODO - notification for completion and how many XP were earned, maybe a confetti animation?
        }

        // --- Store pre-update state for potential rollback ---
        const previousScenario = selectedScenario;
        const previousContext = selectedContextAndObjectives;
        const previousHistory = chatHistory;

        // Reset UI state immediately for a snappy user experience
        stopAudio();
        setChatHistory([]);
        setUserSpeech('');
        navigate('/speakCompanion');
        try {
            // Call the secure cloud function to handle the database write and XP award
            const functions = getFunctions(getApp());
            const completeRolePlayCall = httpsCallable(functions, 'completeRolePlay');
            const result = await completeRolePlayCall({ scenarioId, rolePlayName });
            handleXpResult(result.data); // Pass the result to the global handler
        } catch (error) {
            console.error("Error saving progress via Cloud Function:", error);
            alert(`Failed to save progress: ${error.message}`);

            // --- Rollback UI to pre-save state on error ---
            if (!wasAlreadyCompleted) {
                rollbackSpeakProgressLocal(scenarioId, rolePlayName);
            }
            navigate(`/speakCompanion/session/${scenarioId}/${roleIndex}`);
            setChatHistory(previousHistory);
        }
    };

    if (isScenariosLoading && scenarios.length === 0) {
        return (
            <div className="p-6 flex justify-center items-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-custom-700"></div>
            </div>
        );
    }

    if (!selectedScenario) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md w-full max-w-4xl mx-auto animate-fade-in">
                <h1 className="text-5xl my-4 font-bold text-custom-800 dark:text-custom-500 text-center">Pick a Scenario</h1>
                <p className="flex justify-center items-center gap-2 rounded-lg p-2 bg-amber-100 text-gray-700 mb-8 text-center italic">
                    <FaInfoCircle />Select a real-life scenario to practice your Spanish speaking skills.
                </p>

                {!isPremium &&
                    <InteractionCounts />
                }

                <div className="grid grid-cols-1 gap-6">
                    {scenarios.map(scenario => {
                        // --- NEW: Calculate progress for this scenario ---
                        const completedCount = speakProgress[scenario.id]?.length || 0;
                        const totalCount = scenario.rolePlays ? scenario.rolePlays.length : 0;
                        const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

                        return (
                            <button
                                key={scenario.id}
                                onClick={() => navigate(`/speakCompanion/${scenario.id}`)}
                                className="flex flex-row justify-between items-center text-left p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-custom-500 dark:hover:border-custom-500 hover:shadow-lg transition-all bg-gray-50 dark:bg-gray-900 group"
                            >
                                <div className="flex flex-col gap-2 flex-1">
                                    <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100 group-hover:text-custom-600 dark:group-hover:text-custom-400 transition-colors">
                                        {scenario.name}
                                    </h3>
                                    <div className="flex justify-between items-start w-full">
                                        <span className="px-2 py-1 bg-custom-100 dark:bg-custom-900 text-custom-800 dark:text-custom-200 text-xs font-bold rounded-full uppercase tracking-wide">
                                            {totalCount > 1 ? `${totalCount} Roles` : `${totalCount} Role`}
                                        </span>
                                    </div>
                                </div>

                                {/* --- NEW: Display Progress Gauge --- */}
                                <div className="ml-4 flex flex-col items-center">
                                    <CircularProgress percentage={progressPercent} />
                                </div>
                            </button>
                        )
                    })}
                </div>
            </div>
        );
    }

    if (!selectedContextAndObjectives) {
        return (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md w-full max-w-4xl mx-auto animate-fade-in">
                <div className="flex justify-between items-center mb-4">
                    <h1 className="text-3xl font-bold text-custom-800 dark:text-custom-300 mb-4 text-center">Choose a Role Play</h1>
                    <button
                        onClick={() => {
                            stopAudio();
                            navigate('/speakCompanion');
                            setChatHistory([]);
                            setUserSpeech('');
                        }}
                        className="text-sm text-gray-500 hover:text-custom-600 underline"
                    >
                        Change Scenario
                    </button>
                </div>
                <div className="grid grid-cols-1 gap-4">
                    {selectedScenario.rolePlays.map((rolePlay, index) => {
                        // --- NEW: Check if this specific roleplay is completed ---
                        const isCompleted = speakProgress[selectedScenario.id]?.includes(rolePlay.name);

                        return (
                            <button
                                key={index}
                                onClick={() => navigate(`/speakCompanion/session/${scenarioId}/${index}`)}
                                className="flex flex-col items-center text-left p-6 border-2 border-gray-200 dark:border-gray-700 rounded-xl hover:border-custom-500 dark:hover:border-custom-500 hover:shadow-lg transition-all bg-gray-50 dark:bg-gray-900 group"
                            >
                                <div className="w-full">
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl">{selectedScenario.emoji}</span>
                                            <h2 className="font-bold text-custom-900 dark:text-custom-100">{rolePlay.name}</h2>
                                            {/* --- NEW: Completed Checkmark --- */}
                                        </div>
                                        {rolePlay.difficulty && (
                                            <span className={`px-2 py-1 text-xs font-bold rounded-full uppercase tracking-wide ${rolePlay.difficulty === 'Beginner' ? 'bg-green-100 text-green-800' :
                                                    rolePlay.difficulty === 'Intermediate' ? 'bg-yellow-100 text-yellow-800' :
                                                        'bg-red-100 text-red-800'
                                                }`}>
                                                {rolePlay.difficulty}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex flex-col-2 justify-between items-end">
                                        <div>
                                            <p className="text-sm text-custom-800 dark:text-custom-200 mb-2">
                                                {rolePlay.description}
                                            </p>
                                            <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Objectives:</p>
                                            <ul className="list-disc list-inside text-sm text-custom-700 dark:text-custom-300">
                                                {rolePlay.objectives.map((obj, i) => (
                                                    <li key={i}>{obj}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        {isCompleted && <BsCheckCircleFill className="flex text-green-500 ml-2" title="Completed" />}
                                    </div>
                                </div>
                            </button>
                        )
                    }
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-md w-full max-w-3xl flex flex-col flex-grow">
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
                <p>{limitMessage}</p>
            </Modal>

            <div className="flex justify-between items-center mb-4">
                <h1 className="text-3xl font-bold text-custom-800 dark:text-custom-300 mb-4">Speak Companion</h1>
                <button
                    onClick={() => {
                        stopAudio();
                        if (location.pathname.includes('/session')) {
                            navigate(`/speakCompanion/${scenarioId}`);
                            setChatHistory([]);
                            setUserSpeech('');
                        } else {
                            navigate('/speakCompanion');
                            setChatHistory([]);
                            setUserSpeech('');
                        }
                    }}
                    className="text-sm text-gray-500 hover:text-custom-600 underline"
                >
                    {selectedContextAndObjectives ? 'Change Role Play' : 'Change Scenario'}
                </button>
            </div>
            <div className="flex justify-center">
                {!isPremium &&
                    <InteractionCounts />
                }
            </div>

            {/* Chat History */}
            <div ref={chatContainerRef} className="mb-6 flex-grow min-h-[250px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50 dark:bg-gray-900">
                <div className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-2xl">{selectedScenario.emoji}</span>
                        <h2 className="font-bold text-custom-900 dark:text-custom-100">{selectedContextAndObjectives.name}</h2>
                    </div>
                    <p className="text-sm text-custom-800 dark:text-custom-200">
                        {selectedContextAndObjectives.description}
                    </p>
                    <ul className="list-disc list-inside text-sm text-custom-700 dark:text-custom-300">
                        {selectedContextAndObjectives.objectives.map((obj, i) => (
                            <li key={i}>{obj}</li>
                        ))}
                    </ul>
                </div>

                {chatHistory.length === 0 && (
                    <p className="text-center text-gray-400 mt-2">Start the conversation! Try saying "Hola" to the {selectedContextAndObjectives.role.toLowerCase()}.</p>
                )}
                {chatHistory.map((msg, index) => (
                    <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[80%] p-3 rounded-lg ${msg.role === 'user'
                                ? 'bg-custom-500 text-white rounded-br-none'
                                : 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-600 rounded-bl-none'
                            }`}>
                            {msg.text ? msg.text.replace(/[*_#~`]/g, '') : ''}
                        </div>
                        {msg.role !== 'user' && (
                            <div className="ml-2 cursor-pointer hover:text-custom-500 transition-colors flex flex-col justify-center flex-start w-10 h-10" onClick={() => playMessageAudio(msg, index)}>
                                {playingAudioIndex === index ? (
                                    <FaStopCircle className="inline mr-1 w-10 h-10" />
                                ) : (
                                    <CgPlayButtonR className="inline mr-1 w-10 h-10" />
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

            <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl bg-gray-50 dark:bg-gray-900 select-none relative transition-all duration-300">
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
                                    <p className="text-lg font-medium text-gray-800 dark:text-gray-200 italic mb-6">"{userSpeech}"</p>
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
                    <div className="w-full px-2">
                        <label className="block text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-[0.2em] mb-3 text-left">Your Message:</label>
                        <textarea
                            value={userSpeech}
                            onChange={(e) => setUserSpeech(e.target.value)}
                            className="w-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-800 dark:text-white outline-none focus:ring-2 focus:ring-custom-500 resize-none shadow-inner"
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
            {/* --- NEW: Complete Button --- */}
            <div className="mt-8 text-center">
                <button
                    onClick={handleCompleteRolePlay}
                    className={`px-8 py-3 font-bold rounded-lg shadow-md transition-colors flex items-center justify-center mx-auto gap-2 ${speakProgress[selectedScenario.id]?.includes(selectedContextAndObjectives.name)
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                >
                    <BsCheckCircleFill />
                    {speakProgress[selectedScenario.id]?.includes(selectedContextAndObjectives.name)
                        ? 'Completed - Finish'
                        : 'Finish & Mark Complete'}
                </button>
            </div>
        </div>
    );
};

export default SpeakCompanion;