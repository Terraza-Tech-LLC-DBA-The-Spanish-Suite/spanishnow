const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const { GoogleGenerativeAI } = require("@google/generative-ai");

const geminiApiKey = defineSecret("GEMINI_API_KEY");

exports.updateDictionary = onCall(async (request) => {
    if (!request.auth || !request.auth.token.admin) {
        throw new HttpsError('permission-denied', 'You must be an admin to update the dictionary.');
    }

    const { spanishWord, translation } = request.data;

    if (!spanishWord || typeof spanishWord !== 'string' || !translation || typeof translation !== 'string' || spanishWord.length > 100 || translation.length > 100) {
        throw new HttpsError('invalid-argument', 'Invalid word or translation provided.');
    }

    const wordRef = admin.firestore().doc(`dictionary/${spanishWord.toLowerCase()}`);
    await wordRef.set({ translation: translation }, { merge: true });

    return { success: true };
});

/**
 * Securely creates or updates a dictionary word with translation and optional examples.
 * Only accessible by admins.
 */
exports.saveWord = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Email Verification Check
    if (!request.auth.token.email_verified) {
        throw new HttpsError('failed-precondition', 'Email verification required.');
    }

    const db = admin.firestore();
    const uid = request.auth.uid;
    const userDoc = await db.collection('users').doc(uid).get();

    // Verify admin status via custom claim OR Firestore user document
    const isAdmin = request.auth.token.admin === true || (userDoc.exists && userDoc.data().isAdmin === true);

    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Only admins can save words.');
    }

    const { wordData } = request.data;

    if (!wordData || typeof wordData.spanish !== 'string' || typeof wordData.translation !== 'string' || wordData.spanish.trim() === '' || wordData.translation.trim() === '' || wordData.spanish.length > 100 || wordData.translation.length > 100) {
        throw new HttpsError('invalid-argument', 'Valid word data is required.');
    }

    try {
        const updatePayload = {
            spanish: wordData.spanish.trim().toLowerCase(),
            translation: wordData.translation.trim(),
            english: wordData.translation.trim()
        };
        if (Array.isArray(wordData.examples)) {
            updatePayload.examples = wordData.examples
                .slice(0, 2)
                .filter(ex => ex && typeof ex.spanish === 'string' && typeof ex.english === 'string')
                .map(ex => ({
                    spanish: ex.spanish.trim().slice(0, 300),
                    english: ex.english.trim().slice(0, 300)
                }));
        }
        await db.collection('dictionary').doc(wordData.spanish.trim().toLowerCase()).set(updatePayload, { merge: true });
        return { success: true };
    } catch (error) {
        console.error("Error saving word:", error);
        throw new HttpsError('internal', 'Failed to save the word.');
    }
});

/**
 * Securely saves a batch of words with translations and examples to the dictionary.
 * Only accessible by admins.
 */
exports.saveDictionaryBatch = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    if (!request.auth.token.email_verified) {
        throw new HttpsError('failed-precondition', 'Email verification required.');
    }

    const db = admin.firestore();
    const uid = request.auth.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    const isAdmin = request.auth.token.admin === true || (userDoc.exists && userDoc.data().isAdmin === true);

    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Only admins can update dictionary in batch.');
    }

    const { words } = request.data;
    if (!Array.isArray(words) || words.length === 0 || words.length > 100) {
        throw new HttpsError('invalid-argument', 'An array of between 1 and 100 words is required.');
    }

    const batch = db.batch();
    let validCount = 0;

    for (const item of words) {
        if (!item || typeof item.spanish !== 'string' || typeof item.translation !== 'string') {
            continue;
        }
        const spanish = item.spanish.trim().toLowerCase();
        const translation = item.translation.trim();
        if (!spanish || !translation || spanish.length > 100 || translation.length > 200) {
            continue;
        }

        let sanitizedExamples = [];
        if (Array.isArray(item.examples)) {
            sanitizedExamples = item.examples
                .slice(0, 2)
                .filter(ex => ex && typeof ex.spanish === 'string' && typeof ex.english === 'string')
                .map(ex => ({
                    spanish: ex.spanish.trim().slice(0, 300),
                    english: ex.english.trim().slice(0, 300)
                }));
        }

        const docRef = db.collection('dictionary').doc(spanish);
        batch.set(docRef, {
            spanish: spanish,
            translation: translation,
            english: translation,
            examples: sanitizedExamples
        }, { merge: true });

        validCount++;
    }

    if (validCount === 0) {
        throw new HttpsError('invalid-argument', 'No valid words provided to save.');
    }

    try {
        await batch.commit();
        return { success: true, count: validCount };
    } catch (error) {
        console.error("Error saving dictionary batch:", error);
        throw new HttpsError('internal', 'Failed to save dictionary batch.');
    }
});

/**
 * Uses Gemini to generate English translations and 2 contextual example sentences
 * for a list of missing Spanish words.
 * Only accessible by admins.
 */
exports.generateDictionaryEntries = onCall({
    secrets: [geminiApiKey],
    region: "us-central1",
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const db = admin.firestore();
    const uid = request.auth.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    const isAdmin = request.auth.token.admin === true || (userDoc.exists && userDoc.data().isAdmin === true);

    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Only admins can generate dictionary entries.');
    }

    const { words } = request.data;
    if (!Array.isArray(words) || words.length === 0 || words.length > 50) {
        throw new HttpsError('invalid-argument', 'Provide an array of 1 to 50 words.');
    }

    const sanitizedWords = words
        .filter(w => typeof w === 'string' && w.trim().length > 0)
        .map(w => w.trim().toLowerCase().slice(0, 100));

    if (sanitizedWords.length === 0) {
        throw new HttpsError('invalid-argument', 'No valid words provided.');
    }

    const prompt = `You are an expert Spanish-English lexicographer for a language learning platform.
For each of the following Spanish words, generate:
1. A concise, accurate English translation.
2. Exactly 2 natural example sentences in Spanish demonstrating common, realistic usage (at A2-B1 difficulty), along with their accurate English translations.

Spanish words:
${sanitizedWords.map(w => `- ${w}`).join('\n')}

Respond ONLY with a valid JSON array in this exact format:
[
  {
    "spanish": "palabra",
    "translation": "word",
    "examples": [
      { "spanish": "Ejemplo de frase en español 1.", "english": "Example sentence in English 1." },
      { "spanish": "Ejemplo de frase en español 2.", "english": "Example sentence in English 2." }
    ]
  }
]`;

    try {
        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const model = genAI.getGenerativeModel({ model: 'gemini-flash-latest' });
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
        });

        const rawText = result.response.text();
        const parsed = JSON.parse(rawText);

        if (!Array.isArray(parsed)) {
            throw new Error("Gemini response is not a JSON array.");
        }

        return { entries: parsed };
    } catch (error) {
        console.error("Error generating dictionary entries with Gemini:", error);
        throw new HttpsError('internal', 'Failed to generate dictionary entries with AI.');
    }
});