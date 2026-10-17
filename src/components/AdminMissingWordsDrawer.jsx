import React, { useState, useEffect, useRef } from 'react';
import { useDecksStore } from '../store.js';
import { 
    FaTimes, 
    FaRobot, 
    FaFileDownload, 
    FaFileUpload, 
    FaCheckCircle, 
    FaExclamationTriangle,
    FaBook,
    FaChevronDown,
    FaChevronUp,
    FaTrashAlt
} from 'react-icons/fa';

const AdminMissingWordsDrawer = ({ isOpen, onClose, missingWords = [], articleTitle = "Story" }) => {
    const saveDictionaryBatch = useDecksStore((state) => state.saveDictionaryBatch);
    const generateDictionaryEntriesWithAI = useDecksStore((state) => state.generateDictionaryEntriesWithAI);

    const [entries, setEntries] = useState([]);
    const [isAiLoading, setIsAiLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [statusMessage, setStatusMessage] = useState(null);
    const [statusType, setStatusType] = useState('info'); // 'info' | 'success' | 'error'
    const [expandedWordIndex, setExpandedWordIndex] = useState(0);
    const fileInputRef = useRef(null);

    // Initialize or sync entries when missingWords changes
    useEffect(() => {
        if (!isOpen) return;

        setEntries(prev => {
            // Keep existing edited entries if word is still in missingWords
            const existingMap = new Map(prev.map(e => [e.spanish, e]));
            return missingWords.map(word => {
                if (existingMap.has(word)) {
                    return existingMap.get(word);
                }
                return {
                    spanish: word,
                    translation: '',
                    examples: [
                        { spanish: '', english: '' },
                        { spanish: '', english: '' }
                    ]
                };
            });
        });
    }, [missingWords, isOpen]);

    if (!isOpen) return null;

    const showStatus = (msg, type = 'info', duration = 3500) => {
        setStatusMessage(msg);
        setStatusType(type);
        if (duration) {
            setTimeout(() => setStatusMessage(null), duration);
        }
    };

    // --- AI Auto-Fill with Gemini ---
    const handleAiAutoFill = async () => {
        const wordsToFill = entries.map(e => e.spanish);
        if (wordsToFill.length === 0) {
            showStatus("No missing words to generate.", 'error');
            return;
        }

        setIsAiLoading(true);
        showStatus("Generating translations and 2 examples with Gemini AI...", 'info', null);

        try {
            const result = await generateDictionaryEntriesWithAI(wordsToFill);
            if (result.success && Array.isArray(result.entries)) {
                const aiMap = new Map(result.entries.map(item => [item.spanish.toLowerCase(), item]));
                
                setEntries(prev => prev.map(item => {
                    const aiEntry = aiMap.get(item.spanish.toLowerCase());
                    if (!aiEntry) return item;
                    return {
                        spanish: item.spanish,
                        translation: aiEntry.translation || item.translation,
                        examples: Array.isArray(aiEntry.examples) && aiEntry.examples.length >= 2
                            ? aiEntry.examples.slice(0, 2)
                            : item.examples
                    };
                }));
                showStatus(`✨ Generated definitions and examples for ${result.entries.length} words!`, 'success');
            } else {
                showStatus("Failed to get valid definitions from AI.", 'error');
            }
        } catch (error) {
            console.error("AI Generation error:", error);
            showStatus(`AI Generation error: ${error.message || 'Please try again.'}`, 'error');
        } finally {
            setIsAiLoading(false);
        }
    };

    // --- Export JSON ---
    const handleExportJson = () => {
        if (entries.length === 0) {
            showStatus("No entries to export.", 'error');
            return;
        }

        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(entries, null, 2));
        const downloadAnchor = document.createElement('a');
        const cleanTitle = (articleTitle || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `${cleanTitle}_missing_words.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();

        showStatus("📥 Downloaded missing_words.json template!", 'success');
    };

    // --- Import JSON ---
    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const parsed = JSON.parse(event.target.result);
                if (!Array.isArray(parsed)) {
                    throw new Error("JSON file must contain an array of word objects.");
                }

                let importedCount = 0;
                setEntries(prev => {
                    const importedMap = new Map(parsed.map(item => [item.spanish?.toLowerCase(), item]));
                    return prev.map(item => {
                        const imported = importedMap.get(item.spanish.toLowerCase());
                        if (imported) {
                            importedCount++;
                            return {
                                spanish: item.spanish,
                                translation: imported.translation || imported.english || item.translation,
                                examples: Array.isArray(imported.examples) && imported.examples.length > 0
                                    ? imported.examples.slice(0, 2)
                                    : item.examples
                            };
                        }
                        return item;
                    });
                });

                showStatus(`📤 Successfully imported ${importedCount} word definitions!`, 'success');
            } catch (err) {
                console.error("JSON parse error:", err);
                showStatus("Invalid JSON file: " + err.message, 'error');
            }
        };
        reader.readAsText(file);
        // Reset file input so same file can be uploaded again if needed
        e.target.value = null;
    };

    // --- In-Place Form Edits ---
    const updateTranslation = (index, value) => {
        setEntries(prev => {
            const next = [...prev];
            next[index] = { ...next[index], translation: value };
            return next;
        });
    };

    const updateExample = (wordIndex, exIndex, field, value) => {
        setEntries(prev => {
            const next = [...prev];
            const examples = [...next[wordIndex].examples];
            examples[exIndex] = { ...examples[exIndex], [field]: value };
            next[wordIndex] = { ...next[wordIndex], examples };
            return next;
        });
    };

    const removeEntry = (index) => {
        setEntries(prev => prev.filter((_, i) => i !== index));
    };

    // --- Push All to Dictionary ---
    const handlePushToDictionary = async () => {
        const validWords = entries.filter(e => e.spanish && e.translation.trim().length > 0);
        if (validWords.length === 0) {
            showStatus("Please provide a translation for at least one word before pushing.", 'error');
            return;
        }

        setIsSaving(true);
        showStatus(`Saving ${validWords.length} words to dictionary...`, 'info', null);

        try {
            const result = await saveDictionaryBatch(validWords);
            if (result.success) {
                showStatus(`🎉 Saved ${result.count || validWords.length} words to dictionary!`, 'success', 4000);
                setTimeout(() => {
                    onClose();
                }, 1200);
            } else {
                showStatus(result.error || "Failed to save words.", 'error');
            }
        } catch (error) {
            showStatus(error.message || "Failed to push dictionary entries.", 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const filledCount = entries.filter(e => e.translation.trim().length > 0).length;

    return (
        <div 
            className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-xs flex justify-end animate-fade-in"
            onClick={onClose}
        >
            <div 
                className="w-full max-w-xl h-full bg-white dark:bg-gray-900 shadow-2xl flex flex-col border-l border-gray-200 dark:border-gray-800 animate-slide-left"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="p-4 sm:p-5 border-b border-gray-200 dark:border-gray-800 bg-linear-to-r from-teal-50 to-blue-50 dark:from-gray-800 dark:to-gray-850 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-lg">
                            <FaBook />
                        </div>
                        <div>
                            <h2 className="text-base sm:text-lg font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2">
                                Dictionary Inspector
                                <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-semibold">
                                    {entries.length} missing
                                </span>
                            </h2>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                Review, auto-fill, or import definitions & examples for this story
                            </p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                        title="Close Inspector"
                    >
                        <FaTimes size={18} />
                    </button>
                </div>

                {/* Status Alert Banner */}
                {statusMessage && (
                    <div className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 transition-all ${
                        statusType === 'success' 
                            ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-200 border-b border-emerald-200 dark:border-emerald-800'
                            : statusType === 'error'
                            ? 'bg-red-100 dark:bg-red-950/80 text-red-800 dark:text-red-200 border-b border-red-200 dark:border-red-800'
                            : 'bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 border-b border-blue-200 dark:border-blue-800'
                    }`}>
                        {statusType === 'success' && <FaCheckCircle className="shrink-0 text-emerald-500" />}
                        {statusType === 'error' && <FaExclamationTriangle className="shrink-0 text-red-500" />}
                        <span className="flex-1">{statusMessage}</span>
                    </div>
                )}

                {/* Action Bar (AI, Export, Import) */}
                <div className="p-3 sm:p-4 bg-gray-50 dark:bg-gray-850/60 border-b border-gray-200 dark:border-gray-800 flex flex-wrap items-center gap-2 shrink-0">
                    <button
                        onClick={handleAiAutoFill}
                        disabled={isAiLoading || entries.length === 0}
                        className="flex-1 min-w-[140px] flex items-center justify-center gap-1.5 px-3 py-2 bg-linear-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs hover:shadow transition-all disabled:opacity-50"
                        title="Automatically generate translations and 2 examples with Gemini"
                    >
                        {isAiLoading ? (
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                        ) : (
                            <FaRobot className="text-sm" />
                        )}
                        <span>{isAiLoading ? "Generating..." : "Auto-Fill with AI"}</span>
                    </button>

                    <button
                        onClick={handleExportJson}
                        disabled={entries.length === 0}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-semibold transition-all disabled:opacity-50"
                        title="Download JSON template for offline editing"
                    >
                        <FaFileDownload />
                        <span>Export JSON</span>
                    </button>

                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-700 rounded-lg text-xs font-semibold transition-all"
                        title="Upload completed JSON file"
                    >
                        <FaFileUpload />
                        <span>Import JSON</span>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileChange} 
                        accept=".json" 
                        className="hidden" 
                    />
                </div>

                {/* Word List (Accordion / Scrollable cards) */}
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {entries.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 text-gray-500">
                            <FaCheckCircle className="text-emerald-500 text-4xl mb-3" />
                            <p className="font-bold text-gray-800 dark:text-gray-200 text-base">All words in dictionary!</p>
                            <p className="text-xs text-gray-500 mt-1">No missing words detected for this story.</p>
                        </div>
                    ) : (
                        entries.map((item, idx) => {
                            const isExpanded = expandedWordIndex === idx;
                            const isFilled = item.translation.trim().length > 0;

                            return (
                                <div 
                                    key={item.spanish}
                                    className={`rounded-xl border transition-all ${
                                        isExpanded 
                                            ? 'bg-white dark:bg-gray-800/90 border-teal-500/50 shadow-md ring-1 ring-teal-500/20' 
                                            : 'bg-white dark:bg-gray-800/40 border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                                    }`}
                                >
                                    {/* Card Header */}
                                    <div 
                                        className="p-3.5 flex items-center justify-between cursor-pointer select-none"
                                        onClick={() => setExpandedWordIndex(isExpanded ? -1 : idx)}
                                    >
                                        <div className="flex items-center gap-2.5">
                                            <span className="w-5 text-center text-xs text-gray-400 font-mono">
                                                {idx + 1}
                                            </span>
                                            <span className="text-sm font-bold text-gray-900 dark:text-gray-100">
                                                {item.spanish}
                                            </span>
                                            {isFilled ? (
                                                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium italic truncate max-w-[160px]">
                                                    &rarr; {item.translation}
                                                </span>
                                            ) : (
                                                <span className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                                                    (needs translation)
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeEntry(idx);
                                                }}
                                                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded"
                                                title="Ignore / remove word"
                                            >
                                                <FaTrashAlt size={12} />
                                            </button>
                                            <div className="text-gray-400">
                                                {isExpanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Expanded Form */}
                                    {isExpanded && (
                                        <div className="px-3.5 pb-4 pt-1 space-y-3 border-t border-gray-100 dark:border-gray-750">
                                            <div>
                                                <label className="block text-[11px] font-bold text-gray-600 dark:text-gray-300 mb-1">
                                                    English Translation
                                                </label>
                                                <input 
                                                    type="text"
                                                    value={item.translation}
                                                    onChange={(e) => updateTranslation(idx, e.target.value)}
                                                    placeholder="e.g. table, forest, to run..."
                                                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                            </div>

                                            {/* Example 1 */}
                                            <div className="p-2.5 rounded-lg bg-gray-50/70 dark:bg-gray-850/50 border border-gray-100 dark:border-gray-800 space-y-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                                    Example 1
                                                </span>
                                                <input 
                                                    type="text"
                                                    value={item.examples[0]?.spanish || ''}
                                                    onChange={(e) => updateExample(idx, 0, 'spanish', e.target.value)}
                                                    placeholder="Spanish sentence..."
                                                    className="w-full px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                                <input 
                                                    type="text"
                                                    value={item.examples[0]?.english || ''}
                                                    onChange={(e) => updateExample(idx, 0, 'english', e.target.value)}
                                                    placeholder="English translation..."
                                                    className="w-full px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                            </div>

                                            {/* Example 2 */}
                                            <div className="p-2.5 rounded-lg bg-gray-50/70 dark:bg-gray-850/50 border border-gray-100 dark:border-gray-800 space-y-2">
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                                    Example 2
                                                </span>
                                                <input 
                                                    type="text"
                                                    value={item.examples[1]?.spanish || ''}
                                                    onChange={(e) => updateExample(idx, 1, 'spanish', e.target.value)}
                                                    placeholder="Spanish sentence..."
                                                    className="w-full px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                                <input 
                                                    type="text"
                                                    value={item.examples[1]?.english || ''}
                                                    onChange={(e) => updateExample(idx, 1, 'english', e.target.value)}
                                                    placeholder="English translation..."
                                                    className="w-full px-2.5 py-1 text-xs rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-1 focus:ring-teal-500"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Save Button */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-850 flex items-center justify-between shrink-0">
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                        {filledCount} of {entries.length} defined
                    </span>
                    <button
                        onClick={handlePushToDictionary}
                        disabled={isSaving || filledCount === 0}
                        className="px-5 py-2.5 bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:scale-100 flex items-center gap-2"
                    >
                        {isSaving ? (
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                        ) : (
                            <FaCheckCircle />
                        )}
                        <span>Push to Dictionary ({filledCount})</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminMissingWordsDrawer;
