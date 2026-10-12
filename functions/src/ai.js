const { onCall, HttpsError } = require("firebase-functions/v2/https"); // Make sure to use v2
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const axios = require("axios");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Define the secret for the API Key
const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Initialize the Google Cloud TTS Client
const textToSpeech = require('@google-cloud/text-to-speech');
const ttsClient = new textToSpeech.TextToSpeechClient();

const scenariosInstructions = "since this is a language learning experience for the user, focus on getting the user to complete the objectives listed for the scenario in as few exchanges as possible. Keep your responses concise and to the point, avoiding unnecessary elaboration. Encourage the user to speak and respond in Spanish, providing corrections or suggestions only when necessary to help them improve their language skills. Always respond in Spanish, unless the user specifically asks for a translation or explanation in English. If the user seems stuck or unsure, offer gentle prompts or hints to guide them towards the correct phrases or vocabulary. Maintain a friendly and supportive tone throughout the conversation to create a positive learning environment. Remember, the primary goal is to help the user practice and improve their Spanish speaking skills in a realistic context, if the user doesn't seem to understand what to do, and says things out of the context or doesn't attempt to complete an objective suggest a response that they could use so that the role play makes sense and is completed. If the user deviates from the scenario, gently steer them back on track by reminding them of the context and objectives. If the user completes the objectives, congratulate them and suggest they try another scenario for further practice. ";

const lessonInstructions = "You are a friendly and encouraging Spanish tutor. Your objective is to help the user practice their Spanish reading comprehension and use the new vocabulary they just learned from a story. Keep the conversation entirely in Spanish unless they ask for English. Be concise, supportive, and guide the conversation strictly around the provided story and vocabulary.";

const MAX_FREE_INTERACTIONS = 5; // Maximum free interactions per day for non-premium users
const { addXp, XP_FOR_CHAT, XP_FOR_SCENARIO, addXpInTransaction } = require("./xp.js");

exports.chatWithGemini = onCall({
    secrets: [geminiApiKey],
    region: "us-central1",
    cors: true
}, async (request) => {
    // 1. Authentication Check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // 2. Email Verification Check
    if (!request.auth.token.email_verified) {
        throw new HttpsError('failed-precondition', 'Email verification required.');
    }

    const uid = request.auth.uid;
    const { history, personaId, date, rolePlayName } = request.data;

    // Strict Input Validation for history to prevent API bloating
    if (!history || !Array.isArray(history) || history.length > 40) {
        throw new HttpsError('invalid-argument', 'History must be an array with a maximum of 40 messages.');
    }

    const hasInvalidMessage = history.some(msg =>
        !msg ||
        (msg.role !== 'user' && msg.role !== 'model') ||
        typeof msg.text !== 'string' ||
        msg.text.length > 1000
    );
    if (hasInvalidMessage) {
        throw new HttpsError('invalid-argument', 'History contains invalid roles or excessively long messages.');
    }

    // Strict Input Validation for personaId and rolePlayName and date to prevent abuse and ensure data integrity
    if (!personaId || typeof personaId !== 'string' || personaId.trim() === '' || personaId.length > 100) {
        throw new HttpsError('invalid-argument', 'A valid scenario ID is required.');
    }
    if (!rolePlayName || typeof rolePlayName !== 'string' || rolePlayName.trim() === '' || rolePlayName.length > 100) {
        throw new HttpsError('invalid-argument', 'A valid roleplay name is required.');
    }

    if (date !== undefined && (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
        throw new HttpsError('invalid-argument', 'If provided, date must be a string in YYYY-MM-DD format.');
    }

    const db = admin.firestore();

    // Fetch scenario and instructions from Firestore
    let selectedScenario;
    let fetchedAiInstructions;

    try {
        let [scenarioDoc, promptsDoc] = await Promise.all([
            db.collection('scenarios').doc(personaId).get(),
            db.collection('appInfo').doc('aiPrompts').get()
        ]);

        if (!scenarioDoc.exists) {
            scenarioDoc = await db.collection('scenarios-grammar').doc(personaId).get();
        }

        if (!scenarioDoc.exists) {
            throw new HttpsError('not-found', 'Scenario not found.');
        }

        selectedScenario = { id: scenarioDoc.id, ...scenarioDoc.data() };
        fetchedAiInstructions = promptsDoc.exists ? promptsDoc.data().scenariosAiInstructions : scenariosInstructions; // Fallback to hardcoded if missing

    } catch (error) {
        console.error("Error fetching data:", error);
        // If it's already an HttpsError, rethrow it, otherwise throw internal
        throw error.code ? error : new HttpsError('internal', 'Failed to fetch scenario data.');
    }

    // 2. Premium/Limit Check
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data() || {};

    // Check if user is admin or has active subscription
    const isPremium = userData.isAdmin === true || userData.hasActiveSubscription === true || request.auth.token.admin === true;

    if (!isPremium) {
        const today = date || new Date().toLocaleDateString('en-CA'); // Use user's local date or fallback to server date
        const limitRef = db.collection('users').doc(uid).collection('daily_limits').doc('speak');

        // Run a transaction to ensure atomic increment
        await db.runTransaction(async (t) => {
            const limitDoc = await t.get(limitRef);
            let currentCount = 0;

            if (limitDoc.exists && limitDoc.data().date === today) {
                currentCount = limitDoc.data().count || 0;
            }

            if (currentCount >= MAX_FREE_INTERACTIONS) {
                throw new HttpsError('resource-exhausted', 'You have reached your daily limit for the free tier.');
            }

            t.set(limitRef, { date: today, count: currentCount + 1 }, { merge: true });
        });
    }

    // 3. Call Gemini API
    const rolePlay = selectedScenario.rolePlays ? selectedScenario.rolePlays.find(rp => rp.name === rolePlayName) : null;
    if (!rolePlay) {
        throw new HttpsError('not-found', 'Role play not found.');
    }
    const role = rolePlay.role || 'Assistant';

    const systemInstruction = `${fetchedAiInstructions}

    Scenario: ${selectedScenario.name}
    AI Role: ${role}
    Context: ${rolePlay.context}
    Objectives: ${rolePlay.objectives.join(', ')}`;

    try {
        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-latest',
            systemInstruction: systemInstruction
        });

        const result = await model.generateContent({
            contents: history.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            }))
        });

        const aiResponseText = result.response.text() || "Lo siento, no pude generar una respuesta.";

        // Award XP for chatting and get streak info
        const xpResult = await addXp(db, uid, XP_FOR_CHAT).catch(err => {
            console.error("Non-fatal error awarding XP for chat:", err);
            return null; // Return null on error
        });
        return { text: aiResponseText, ...xpResult };

    } catch (error) {
        console.error("Gemini Chat Error:", error);
        const message = error.message || "An unexpected error occurred with the AI service.";
        if (error.status === 429) throw new HttpsError('resource-exhausted', 'Gemini quota exceeded.');
        if (error.status === 400) throw new HttpsError('invalid-argument', `Gemini request error: ${message}`);
        throw new HttpsError('internal', `AI Error: ${message}`);
    }
});

// --- NEW: Dedicated function for the Lesson Flow AI Chat ---
exports.chatForLesson = onCall({
    secrets: [geminiApiKey],
    region: "us-central1",
    cors: true
}, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    //Email Verification Check
    if (!request.auth.token.email_verified) {
        throw new HttpsError('failed-precondition', 'Email verification required.');
    }

    const uid = request.auth.uid;
    const { history, articleId, targetVocabulary } = request.data;

    if (!articleId || typeof articleId !== 'string' || articleId.trim() === '' || articleId.length > 100) {
        throw new HttpsError('invalid-argument', 'A valid article ID is required.');
    }

    if (!history || !Array.isArray(history) || history.length > 40) {
        throw new HttpsError('invalid-argument', 'History must be an array with a maximum of 40 messages.');
    }

    const hasInvalidMessage = history.some(msg => !msg || (msg.role !== 'user' && msg.role !== 'model') || typeof msg.text !== 'string' || msg.text.length > 1000);
    if (hasInvalidMessage) {
        throw new HttpsError('invalid-argument', 'History contains invalid roles or excessively long messages.');
    }

    if (targetVocabulary !== undefined) {
        if (!Array.isArray(targetVocabulary)) {
            throw new HttpsError('invalid-argument', 'targetVocabulary must be an array.');
        }
        if (targetVocabulary.length > 10) {
            throw new HttpsError('invalid-argument', 'Too many vocabulary words provided. Maximum allowed is 10.');
        }
        if (targetVocabulary.some(word => typeof word !== 'string' || word.trim() === '' || word.length > 100)) {
            throw new HttpsError('invalid-argument', 'One or more vocabulary words are invalid or exceed the maximum length of 100 characters.');
        }
    }

    const db = admin.firestore();

    // 1. Premium / Limit Check (same as chatWithGemini)
    const userDoc = await db.collection('users').doc(uid).get();
    const userData = userDoc.data() || {};

    // --- FIX: Check for admin status in both Firestore doc and auth token claims ---
    const isPremium = userData.isAdmin === true || userData.hasActiveSubscription === true || request.auth.token.admin === true;

    if (!isPremium) {
        const today = new Date().toLocaleDateString('en-CA');
        const limitRef = db.collection('users').doc(uid).collection('daily_limits').doc('speak');
        await db.runTransaction(async (t) => {
            const limitDoc = await t.get(limitRef);
            let currentCount = limitDoc.exists && limitDoc.data().date === today ? (limitDoc.data().count || 0) : 0;
            if (currentCount >= MAX_FREE_INTERACTIONS) { // MAX_FREE_INTERACTIONS
                throw new HttpsError('resource-exhausted', 'You have reached your daily limit for the free tier.');
            }
            t.set(limitRef, { date: today, count: currentCount + 1 }, { merge: true });
        });
    }

    // 2. Fetch the Article and Global AI Instructions securely on the server
    const articleDoc = await db.collection('articles').doc(articleId).get();
    const articleData = articleDoc.data() || {};

    // 3. Build the context and objectives securely!
    const context = `The user just finished reading a Spanish story/article titled "${articleData.title || 'Unknown'}". The overall topic is "${articleData.topic || 'General'}". They want to practice having a conversation about it.`;

    const vocabInstruction = targetVocabulary && targetVocabulary.length > 0
        ? `Encourage the user to use the following vocabulary words they just learned: ${targetVocabulary.join(', ')}.`
        : `if no target vocabulary is left, encourage the user to finish the lesson.`;

    const objectives = [
        "if the user starts by giving you an example of one of the vocabulary words in a sentence, respond by praising their effort and continue by moving on to the next word in the next vocabulary word they just learned. If they don't start with a vocab word, gently prompt them to try using one of the new words they learned from the story.",
        "Mention to the user the first word they saved, then tell the user what that word translates to in English with the english word wrapped in quotation marks, explain how to use it using english to explain, create a sentence in Spanish using that word, and ask them to do the same with that word. Then move on to the next word and do the same, until you have gone through all the words they saved.",
        vocabInstruction,
        "Keep your responses relatively brief (1-2 sentences) so the user doesn't get overwhelmed.",
        "If the user makes a major mistake, gently correct them in a friendly way, but focus mainly on keeping the conversation going, and only related to the story and vocabulary. Don't correct every single small mistake, just major ones that would impede understanding.",
        "At the end of the conversation, give the user positive feedback and encouragement based on how well they did using the vocabulary and sticking to the topic.",
        "ask the user to finish the lesson once they've gone through all the vocabulary, or if they indicate they want to finish, by saying something like 'Great job practicing! When you're ready, click the Finish Lesson button to complete.'"
    ];

    const systemInstruction = `${lessonInstructions}\n\nContext: ${context}\n\nObjectives:\n${objectives.map(o => "- " + o).join('\n')}`;

    try {
        const genAI = new GoogleGenerativeAI(geminiApiKey.value());
        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-latest',
            systemInstruction: systemInstruction
        });

        const result = await model.generateContent({
            contents: history.map(msg => ({
                role: msg.role === 'user' ? 'user' : 'model',
                parts: [{ text: msg.text }]
            }))
        });

        const aiResponseText = result.response.text() || "Lo siento, no pude generar una respuesta.";

        // Award XP for chatting and get streak info
        const xpResult = await addXp(db, uid, XP_FOR_CHAT).catch(err => {
            console.error("Non-fatal error awarding XP for chat:", err);
            return null;
        });

        return { text: aiResponseText, ...xpResult };
    } catch (error) {
        console.error("Gemini Lesson Error:", error);
        const message = error.message || "An unexpected error occurred during the lesson chat.";
        if (error.status === 429) throw new HttpsError('resource-exhausted', 'Gemini quota exceeded.');
        if (error.status === 400) throw new HttpsError('invalid-argument', `Gemini request error: ${message}`);
        throw new HttpsError('internal', `AI Error: ${message}`);
    }
});

exports.completeRolePlay = onCall(async (request) => {
    // 1. Auth check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Email Verification Check
    if (!request.auth.token.email_verified) {
        throw new HttpsError('failed-precondition', 'Email verification required.');
    }

    const uid = request.auth.uid;

    // Input validation
    const { scenarioId, rolePlayName } = request.data;
    if (!scenarioId || typeof scenarioId !== 'string' || scenarioId.trim() === '' || scenarioId.length > 100) {
        throw new HttpsError('invalid-argument', 'A valid scenario ID is required.');
    }
    if (!rolePlayName || typeof rolePlayName !== 'string' || rolePlayName.trim() === '' || rolePlayName.length > 100) {
        throw new HttpsError('invalid-argument', 'A valid roleplay name is required.');
    }

    const db = admin.firestore();
    const userRef = db.collection('users').doc(uid);
    const progressDocRef = userRef.collection('speakProgress').doc(scenarioId);

    try {
        // --- MODIFICATION: Use a transaction for atomicity ---
        // This ensures that both the progress is updated AND XP is awarded, or neither.
        const xpResult = await db.runTransaction(async (t) => {
            const [userDoc, progressDoc] = await t.getAll(userRef, progressDocRef);

            if (!userDoc.exists) {
                throw new HttpsError('not-found', 'User document not found. Cannot save progress.');
            }

            const completedRolePlays = progressDoc.exists ? progressDoc.data().completedRolePlays || [] : [];

            // 3. Idempotency check: if already completed, do nothing.
            if (completedRolePlays.includes(rolePlayName)) {
                return { streakUpdated: false, newStreak: 0, message: 'Already completed.' };
            }

            // 4. Update progress and award XP within the transaction
            t.set(progressDocRef, {
                completedRolePlays: admin.firestore.FieldValue.arrayUnion(rolePlayName)
            }, { merge: true });

            // Use the transactional version of addXp
            const transactionXpResult = await addXpInTransaction(t, userRef, userDoc, XP_FOR_SCENARIO);
            return transactionXpResult;
        });

        return { success: true, ...xpResult };

    } catch (error) {
        console.error("Error completing role play:", error);
        if (error.code) throw error; // Re-throw HttpsError to pass specific messages to client
        throw new HttpsError('internal', `Failed to save progress. Reason: ${error.message}`);
    }
});

// --- NEW: Secure endpoint for generating TTS Audio ---
exports.generateAudioTTS = onCall(async (request) => {
    // 1. Auth check
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    // Email Verification Check
    if (!request.auth.token.email_verified) {
        throw new HttpsError('failed-precondition', 'Email verification required.');
    }

    // 2. Strict Input Validation to prevent API abuse/bloating
    const { text } = request.data;
    if (!text || typeof text !== 'string' || text.trim() === '') {
        throw new HttpsError('invalid-argument', 'Text is required to generate audio.');
    }
    if (text.length > 1000) {
        throw new HttpsError('invalid-argument', 'Text exceeds the maximum allowed length of 1000 characters.');
    }

    // 3. Admin-controlled Voice Configuration
    // Use 'es-US-Journey-F' or 'es-US-Journey-D' for premium bilingual voices
    // Use 'es-US-Standard-A' for the cheaper standard voice
    const voiceName = 'es-US-Journey-F'; // Premium bilingual voice

    // Remove common markdown characters so the TTS engine doesn't read them aloud
    const cleanTextForAudio = text.replace(/[*_#~`]/g, '');

    const requestPayload = {
        input: { text: cleanTextForAudio },
        voice: { languageCode: 'es-US', name: voiceName },
        audioConfig: { audioEncoding: 'MP3' },
    };

    try {
        const [response] = await ttsClient.synthesizeSpeech(requestPayload);

        // Convert the binary audio content to a base64 string for the frontend
        const audioBase64 = response.audioContent.toString('base64');
        return { audioBase64 };
    } catch (error) {
        console.error("Google Cloud TTS Error:", error);
        throw new HttpsError('internal', 'Failed to generate audio from text.');
    }
});