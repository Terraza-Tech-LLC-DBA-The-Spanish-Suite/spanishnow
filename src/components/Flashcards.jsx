import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDecksStore } from "../store";
import Modal from "./Modal";
import { BsBookmarkFill } from "react-icons/bs";
import {
    FaSearch,
    FaBookOpen,
    FaPlus,
    FaCheckCircle,
    FaLock,
    FaGraduationCap,
    FaLayerGroup,
    FaRegSmile,
    FaUtensils,
    FaPlane,
    FaHospital,
    FaFutbol,
    FaFolderOpen,
    FaFire,
    FaBrain,
    FaHandPeace
} from "react-icons/fa";

const TOPIC_CONFIG = {
    greetings: { name: "Greetings & Basics", icon: FaHandPeace, gradient: "from-blue-500 to-cyan-500", badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300" },
    restaurant: { name: "Dining & Food", icon: FaUtensils, gradient: "from-amber-500 to-orange-500", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" },
    airport: { name: "Travel & Airport", icon: FaPlane, gradient: "from-sky-500 to-indigo-500", badge: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300" },
    hospital: { name: "Health & Hospital", icon: FaHospital, gradient: "from-emerald-500 to-teal-500", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" },
    soccer: { name: "Sports & Hobbies", icon: FaFutbol, gradient: "from-green-500 to-emerald-600", badge: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300" },
    General: { name: "General Vocabulary", icon: FaFolderOpen, gradient: "from-purple-500 to-pink-500", badge: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300" }
};

const Flashcards = ({ decks }) => {
    const navigate = useNavigate();
    const [showLimitModal, setShowLimitModal] = useState(false);
    const [limitModalMessage, setLimitModalMessage] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedTopicFilter, setSelectedTopicFilter] = useState('all');
    const [addedSrsDeckId, setAddedSrsDeckId] = useState(null);

    const storeDecks = useDecksStore((state) => state.decks);
    const deckProgress = useDecksStore((state) => state.deckProgress);
    const progress = useDecksStore((state) => state.progress);
    const isAdmin = useDecksStore((state) => state.isAdmin);
    const hasActiveSubscription = useDecksStore((state) => state.hasActiveSubscription);
    const addCardToSRS = useDecksStore((state) => state.addCardToSRS);

    const activeDecks = decks || storeDecks || {};

    // Group decks by topic
    const groupedTopics = useMemo(() => {
        const topics = {};
        const TOPIC_ORDER = ['greetings', 'restaurant', 'airport', 'hospital', 'soccer', 'General'];

        TOPIC_ORDER.forEach(topic => {
            topics[topic] = [];
        });
        for (const deckId in activeDecks) {
            const deck = activeDecks[deckId];
            const topic = deck.topic || 'General';
            if (!topics[topic]) {
                topics[topic] = [];
            }
            // Filter by search query if applicable
            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const matchesTitle = deck.title?.toLowerCase().includes(query);
                const matchesTopic = topic.toLowerCase().includes(query);
                if (!matchesTitle && !matchesTopic) continue;
            }
            topics[topic].push({ ...deck, id: deckId });
            topics[topic].sort((a, b) => {
                const orderA = Number(a.order ?? a.level ?? 99);
                const orderB = Number(b.order ?? b.level ?? 99);
                if (orderA !== orderB) return orderA - orderB;
                return (a.title || '').localeCompare(b.title || '');
            });
        }
        return topics;
    }, [activeDecks, searchQuery]);

    // Calculate global stats
    const stats = useMemo(() => {
        let totalDecks = 0;
        let totalCards = 0;
        let completedDecks = 0;

        for (const deckId in activeDecks) {
            const deck = activeDecks[deckId];
            totalDecks++;
            totalCards += (deck.cards?.length || 0);
            if (deckProgress[deckId]?.percentage === 100) {
                completedDecks++;
            }
        }
        return { totalDecks, totalCards, completedDecks };
    }, [activeDecks, deckProgress]);

    const handleDeckClick = async (lessonCards, deck, mode) => {
        navigate(`/decks/${deck.id}`, { state: { lessonCards, deckId: deck.id, mode } });
    };

    const handleAddDeckToSRS = async (deck) => {
        if (!deck.cards || deck.cards.length === 0) return;
        if (window.confirm(`Add all ${deck.cards.length} cards from "${deck.title}" to Spaced Repetition?`)) {
            for (const card of deck.cards) {
                await addCardToSRS(card, deck.title);
            }
            setAddedSrsDeckId(deck.id);
            setTimeout(() => setAddedSrsDeckId(null), 3000);
        }
    };

    const availableTopics = Object.keys(groupedTopics).filter(
        topic => groupedTopics[topic] && groupedTopics[topic].length > 0
    );

    const hasAnyResults = availableTopics.some(topic => {
        if (selectedTopicFilter !== 'all' && selectedTopicFilter !== topic) return false;
        return groupedTopics[topic].length > 0;
    });

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6 pb-12">
            <Modal
                isOpen={showLimitModal}
                onClose={() => setShowLimitModal(false)}
                title="Daily Limit Reached 🔒"
            >
                <p>{limitModalMessage}</p>
            </Modal>

            {/* --- Hero Banner & Header --- */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-custom-700 via-custom-800 to-indigo-900 p-6 md:p-8 text-white shadow-xl">
                <div className="relative z-10 flex flex-col justify-between items-start md:items-center gap-6">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-xs font-semibold mb-3 border border-white/20">
                            <FaGraduationCap className="text-amber-400" /> Flashcard Library
                        </div>
                        <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">
                            Master Your Spanish Vocabulary
                        </h1>
                        <p className="text-custom-100 text-sm md:text-base mt-1 max-w-lg">
                            Study flashcards, test your memory with quizzes, or add cards directly to Spaced Repetition.
                        </p>
                    </div>

                    {/* Stats Pill Card */}
                    <div className="flex gap-4 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/15 w-full md:w-auto justify-around">
                        <div className="text-center px-2">
                            <div className="flex items-center justify-center gap-1 text-sky-300 text-xs font-semibold uppercase">
                                <FaLayerGroup /> Decks
                            </div>
                            <div className="text-2xl font-bold mt-1">{stats.totalDecks}</div>
                        </div>
                        <div className="w-px bg-white/20"></div>
                        <div className="text-center px-2">
                            <div className="flex items-center justify-center gap-1 text-amber-300 text-xs font-semibold uppercase">
                                <FaBookOpen /> Cards
                            </div>
                            <div className="text-2xl font-bold mt-1">{stats.totalCards}</div>
                        </div>
                        <div className="w-px bg-white/20"></div>
                        <div className="text-center px-2">
                            <div className="flex items-center justify-center gap-1 text-emerald-300 text-xs font-semibold uppercase">
                                <FaCheckCircle /> Done
                            </div>
                            <div className="text-2xl font-bold mt-1">{stats.completedDecks}</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- Search & Topic Filter Bar --- */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-xl shadow-md border border-gray-100 dark:border-gray-700 flex flex-col md:flex-row gap-4 justify-between items-center">
                {/* Search Bar */}
                <div className="relative w-full md:w-72">
                    <FaSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm" />
                    <input
                        type="text"
                        placeholder="Search decks..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-800 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-custom-500 transition-all"
                    />
                </div>

                {/* Topic Filter Pills */}
                <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0 scrollbar-none">
                    <button
                        onClick={() => setSelectedTopicFilter('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${selectedTopicFilter === 'all'
                            ? 'bg-custom-600 text-white shadow-sm'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                            }`}
                    >
                        All Topics ({stats.totalDecks})
                    </button>
                    {availableTopics.map(topicKey => {
                        const config = TOPIC_CONFIG[topicKey] || { name: topicKey };
                        const isSelected = selectedTopicFilter === topicKey;
                        return (
                            <button
                                key={topicKey}
                                onClick={() => setSelectedTopicFilter(topicKey)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${isSelected
                                    ? 'bg-custom-600 text-white shadow-sm'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                    }`}
                            >
                                {config.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* --- Deck Topics List --- */}
            {hasAnyResults ? (
                <div className="space-y-8">
                    {Object.keys(groupedTopics).map(topicName => {
                        const topicDecks = groupedTopics[topicName];
                        if (!topicDecks || topicDecks.length === 0) return null;
                        if (selectedTopicFilter !== 'all' && selectedTopicFilter !== topicName) return null;

                        const topicMeta = TOPIC_CONFIG[topicName] || {
                            name: topicName,
                            icon: FaFolderOpen,
                            gradient: "from-gray-500 to-gray-700",
                            badge: "bg-gray-100 text-gray-800"
                        };
                        const IconComponent = topicMeta.icon;
                        const isTopicPremium = !topicDecks[0]?.isFree;

                        return (
                            <div key={topicName} className="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-md border border-gray-100 dark:border-gray-700/60 transition-all">
                                {/* Topic Header */}
                                <div className="flex items-center justify-between pb-4 mb-6 border-b border-gray-100 dark:border-gray-700">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl bg-gradient-to-r ${topicMeta.gradient} text-white shadow-md`}>
                                            <IconComponent className="text-xl" />
                                        </div>
                                        <div>
                                            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 capitalize">
                                                {topicMeta.name}
                                            </h2>
                                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                                {topicDecks.length} {topicDecks.length === 1 ? 'deck' : 'decks'} available
                                            </p>
                                        </div>
                                    </div>

                                    {isTopicPremium && (
                                        <span className="flex items-center gap-1 text-xs font-bold bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-3 py-1 rounded-full shadow-sm">
                                            <FaLock className="text-[10px]" /> PREMIUM
                                        </span>
                                    )}
                                </div>

                                {/* Decks Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {topicDecks.map(deck => {
                                        const hasAccess = deck.isFree || isAdmin || hasActiveSubscription;
                                        const lessonCards = deck.cards || [];
                                        const score = deckProgress[deck.id]?.percentage || 0;
                                        const isCompleted = score === 100;
                                        const isAddedToSrs = addedSrsDeckId === deck.id;

                                        return (
                                            <div
                                                key={deck.id}
                                                className={`group relative flex flex-col justify-between border-2 rounded-xl p-5 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg cursor-pointer ${isCompleted
                                                    ? 'border-emerald-400 dark:border-emerald-600 bg-emerald-50/40 dark:bg-emerald-950/20'
                                                    : 'border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800/80 hover:border-custom-400 dark:hover:border-custom-500'
                                                    }`}
                                                onClick={() => handleDeckClick(lessonCards, deck, 'flashcards')}
                                            >
                                                <div>
                                                    {/* Card Title & SRS Action */}
                                                    <div className="flex justify-between items-start gap-2 mb-3">
                                                        <div>
                                                            <h3 className="font-bold text-lg text-gray-800 dark:text-gray-100 group-hover:text-custom-600 dark:group-hover:text-custom-400 transition-colors">
                                                                {deck.title}
                                                            </h3>
                                                            <div className="flex items-center gap-2 mt-1">
                                                                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                                    {lessonCards.length} cards
                                                                </span>
                                                                {isCompleted ? (
                                                                    <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-full dark:bg-emerald-900/60 dark:text-emerald-300">
                                                                        <FaCheckCircle className="text-[10px]" /> Completed
                                                                    </span>
                                                                ) : score > 0 ? (
                                                                    <span className="bg-amber-100 text-amber-800 text-[11px] font-bold px-2 py-0.5 rounded-full dark:bg-amber-900/60 dark:text-amber-300">
                                                                        {score}% Mastered
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                        </div>

                                                        {/* Add Deck to SRS Bookmark Button */}
                                                        <button
                                                            onClick={() => handleAddDeckToSRS(deck)}
                                                            className={`p-2 rounded-lg transition-all ${isAddedToSrs
                                                                ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/60 dark:text-amber-300'
                                                                : 'text-gray-400 hover:text-amber-500 hover:bg-gray-100 dark:hover:bg-gray-700'
                                                                }`}
                                                            title="Add entire deck to Spaced Repetition"
                                                        >
                                                            <BsBookmarkFill className={isAddedToSrs ? "animate-bounce" : ""} />
                                                        </button>
                                                    </div>

                                                    {/* Visual Progress Bar */}
                                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mb-4 overflow-hidden">
                                                        <div
                                                            className={`h-full transition-all duration-500 rounded-full ${isCompleted
                                                                ? 'bg-emerald-500'
                                                                : score > 0
                                                                    ? 'bg-amber-500'
                                                                    : 'bg-custom-500'
                                                                }`}
                                                            style={{ width: `${score}%` }}
                                                        ></div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Empty Search State */
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 text-2xl">
                        <FaSearch />
                    </div>
                    <h3 className="text-lg font-bold text-gray-800 dark:text-gray-200 mb-1">
                        No Decks Found
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm mx-auto mb-4">
                        We couldn't find any decks matching "{searchQuery}". Try searching for another topic or title.
                    </p>
                    <button
                        onClick={() => { setSearchQuery(''); setSelectedTopicFilter('all'); }}
                        className="px-4 py-2 bg-custom-600 text-white rounded-lg text-xs font-bold hover:bg-custom-700 transition-colors"
                    >
                        Clear Filters
                    </button>
                </div>
            )}

            {/* Admin Add New Deck Button */}
            {isAdmin && (
                <div className="flex justify-center mt-8">
                    <button
                        onClick={() => navigate('/create-deck')}
                        className="flex items-center gap-2 px-8 py-3.5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all text-sm"
                    >
                        <FaPlus /> Add New Deck
                    </button>
                </div>
            )}
        </div>
    );
};

export default Flashcards;