const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

/**
 * Securely creates or updates a deck.
 * Only accessible by admins.
 */
exports.saveDeck = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const db = admin.firestore();
    const uid = request.auth.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    
    // Verify admin status via custom claim OR Firestore user document
    const isAdmin = request.auth.token.admin === true || (userDoc.exists && userDoc.data().isAdmin === true);

    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Only admins can save decks.');
    }

    const { deckData, deckId } = request.data;

    if (deckId !== undefined && (typeof deckId !== 'string' || deckId.trim() === '' || deckId.length > 100)) {
        throw new HttpsError('invalid-argument', 'If provided, a valid deck ID (1-100 characters) is required.');
    }

    if (!deckData || typeof deckData !== 'object') {
        throw new HttpsError('invalid-argument', 'Deck data object is required.');
    }

    const { title, topic, level, isFree, cards, order } = deckData;

    if (typeof title !== 'string' || title.trim() === '' || title.length > 100) {
        throw new HttpsError('invalid-argument', 'A valid title (1-100 characters) is required.');
    }
    
    if (typeof topic !== 'string' || topic.trim() === '' || topic.length > 50) {
        throw new HttpsError('invalid-argument', 'A valid topic (1-50 characters) is required.');
    }

    if (typeof level !== 'string' && typeof level !== 'number') {
        throw new HttpsError('invalid-argument', 'A valid level is required.');
    }

    if (typeof isFree !== 'boolean') {
        throw new HttpsError('invalid-argument', 'isFree must be a boolean value.');
    }

    if (!Array.isArray(cards) || cards.length === 0) {
        throw new HttpsError('invalid-argument', 'Deck must contain at least one card.');
    }

    const hasInvalidCards = cards.some(card => 
        !card || 
        typeof card.spanish !== 'string' || card.spanish.trim() === '' || card.spanish.length > 200 ||
        typeof card.english !== 'string' || card.english.trim() === '' || card.english.length > 200
    );

    if (hasInvalidCards) {
        throw new HttpsError('invalid-argument', 'One or more cards have missing or invalid spanish/english fields.');
    }
    
    // Reconstruct the object explicitly to drop any unvalidated or hidden properties
    const sanitizedDeckData = { 
        title, 
        topic, 
        level: Number(level) || 1, 
        isFree, 
        cards,
        ...(order !== undefined && { order: Number(order) || 0 })
    };

    try {
        if (deckId) {
            await db.collection('decks').doc(deckId).set(sanitizedDeckData, { merge: true });
        } else {
            await db.collection('decks').add(sanitizedDeckData);
        }
        return { success: true };
    } catch (error) {
        console.error("Error saving deck:", error);
        throw new HttpsError('internal', 'Failed to save the deck.');
    }
});

/**
 * Securely creates or updates an article.
 * Only accessible by admins.
 */
exports.saveArticle = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const db = admin.firestore();
    const uid = request.auth.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    
    // Verify admin status via custom claim OR Firestore user document
    const isAdmin = request.auth.token.admin === true || (userDoc.exists && userDoc.data().isAdmin === true);

    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Only admins can save articles.');
    }

    const { articleData, articleId } = request.data;

    if (articleId !== undefined && (typeof articleId !== 'string' || articleId.trim() === '' || articleId.length > 100)) {
        throw new HttpsError('invalid-argument', 'If provided, a valid article ID (1-100 characters) is required.');
    }

    if (!articleData || typeof articleData !== 'object' || !articleData.title || typeof articleData.title !== 'string' || articleData.title.length > 200 || !articleData.content || typeof articleData.content !== 'string' || articleData.content.length > 10000) {
        throw new HttpsError('invalid-argument', 'Valid article data is required.');
    }
    
    // Reconstruct the object with only the expected properties
    // Note: Add any other properties your frontend sends here if they are missing
    const sanitizedArticleData = {
        title: articleData.title,
        content: articleData.content,
        ...(articleData.topic !== undefined && { topic: articleData.topic }),
        ...(articleData.level !== undefined && { level: articleData.level }),
        ...(articleData.premium !== undefined && { premium: articleData.premium }),
        ...(articleData.sentences !== undefined && { sentences: articleData.sentences })
    };

    try {
        if (articleId) {
            await db.collection('articles').doc(articleId).set(sanitizedArticleData, { merge: true });
        } else {
            await db.collection('articles').add(sanitizedArticleData);
        }
        return { success: true };
    } catch (error) {
        console.error("Error saving article:", error);
        throw new HttpsError('internal', 'Failed to save the article.');
    }
});

/**
 * Securely fetches aggregated user statistics.
 * Only accessible by admins.
 */
exports.getUserStats = onCall(async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'The function must be called while authenticated.');
    }

    const db = admin.firestore();
    const uid = request.auth.uid;
    const userDoc = await db.collection('users').doc(uid).get();
    
    // Verify admin status via custom claim OR Firestore user document
    const isAdmin = request.auth.token.admin === true || (userDoc.exists && userDoc.data().isAdmin === true);

    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Only admins can view user statistics.');
    }

    try {
        // Use highly-efficient count() aggregations instead of downloading all documents
        const totalUsersSnap = await db.collection('users').count().get();
        const premiumUsersSnap = await db.collection('users').where('hasActiveSubscription', '==', true).count().get();
        
        return { 
            totalUsers: totalUsersSnap.data().count, 
            premiumUsers: premiumUsersSnap.data().count 
        };
    } catch (error) {
        console.error("Error fetching user stats:", error);
        throw new HttpsError('internal', 'Failed to fetch user statistics.');
    }
});