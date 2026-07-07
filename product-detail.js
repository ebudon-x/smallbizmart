// Product Detail Page with Real-time Firebase Chat
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getDatabase, 
    ref, 
    push, 
    onChildAdded,
    onValue,
    serverTimestamp,
    set,
    off
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";
import { 
    getFirestore, 
    doc, 
    getDoc,
    collection,
    addDoc,
    query,
    where,
    getDocs,
    updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { firebaseConfig } from './firebase-config.js';

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const firestore = getFirestore(app);
const auth = getAuth(app);

// Get product ID from URL
const urlParams = new URLSearchParams(window.location.search);
const productId = urlParams.get('id');

let currentUser = null;
let sellerId = null;
let chatRoomId = null;
let messagesRef = null;
let onlineRef = null;
let currentProduct = null;

// Auth state
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = {
            uid: user.uid,
            name: user.displayName || 'User',
            email: user.email
        };
    } else {
        currentUser = null;
    }
});

// Load product details from Firestore ONLY
async function loadProductDetails() {
    if (!productId) {
        showNotFound();
        return;
    }

    try {
        const productDoc = await getDoc(doc(firestore, 'products', productId));

        if (!productDoc.exists()) {
            showNotFound();
            return;
        }

        const product = { id: productDoc.id, ...productDoc.data() };
        currentProduct = product;
        sellerId = product.sellerId;

        // Update page
        document.title = product.name + ' - SmallBizMart';
        document.getElementById('breadcrumbProduct').textContent = product.name;

        // Handle image
        let imgSrc = product.image || 'image/placeholder.jpg';
        const displayImg = (typeof imgSrc === 'string' && imgSrc.startsWith('data:')) ? 'image/placeholder.jpg' : imgSrc;

        document.getElementById('mainImage').src = displayImg;
        document.getElementById('mainImage').alt = product.name;
        document.getElementById('productCategory').textContent = formatCategory(product.category);
        document.getElementById('productName').textContent = product.name;
        document.getElementById('productPrice').textContent = '₦' + (product.price || 0).toLocaleString();
        document.getElementById('productDescription').textContent = product.description || 'No description available.';
        document.getElementById('productStock').textContent = product.stock > 0 ? `In Stock (${product.stock} available)` : 'Out of Stock';
        document.getElementById('productCondition').textContent = product.condition ? product.condition.charAt(0).toUpperCase() + product.condition.slice(1) : 'Brand New';

        // Gallery thumbs
        const thumbsContainer = document.getElementById('galleryThumbs');
        thumbsContainer.innerHTML = '';

        const mainThumb = document.createElement('img');
        mainThumb.src = displayImg;
        mainThumb.alt = product.name;
        mainThumb.classList.add('active');
        mainThumb.addEventListener('click', function() {
            document.querySelectorAll('.gallery-thumbs img').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            document.getElementById('mainImage').src = this.src;
        });
        thumbsContainer.appendChild(mainThumb);

        if (product.images && Array.isArray(product.images)) {
            product.images.slice(0, 3).forEach((img, idx) => {
                if (idx === 0) return;
                const thumb = document.createElement('img');
                thumb.src = (typeof img === 'string' && img.startsWith('data:')) ? 'image/placeholder.jpg' : img;
                thumb.alt = product.name;
                thumb.addEventListener('click', function() {
                    document.querySelectorAll('.gallery-thumbs img').forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    document.getElementById('mainImage').src = this.src;
                });
                thumbsContainer.appendChild(thumb);
            });
        }

        await loadSellerInfo(product.sellerId, product.sellerName);
        loadReviews();

    } catch (error) {
        console.error('Error loading product:', error);
        showNotFound();
    }
}

function showNotFound() {
    document.querySelector('.product-detail-layout').innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:3rem;">
            <h2>Product Not Found</h2>
            <p>The product you are looking for does not exist or has been removed.</p>
            <a href="products.html" class="btn" style="margin-top:1rem;">Browse Products</a>
        </div>
    `;
}

async function loadSellerInfo(sellerUid, fallbackName) {
    try {
        const sellerDoc = await getDoc(doc(firestore, 'users', sellerUid));
        let sellerData = sellerDoc.data();

        if (!sellerData) {
            sellerData = {
                name: fallbackName || 'Seller',
                rating: 4.5,
                sales: 0
            };
        }

        document.getElementById('sellerAvatar').textContent = (sellerData.name || 'S').charAt(0);
        document.getElementById('sellerName').textContent = sellerData.name || 'Seller';
        document.getElementById('sellerRating').textContent = (sellerData.rating || 4.5).toFixed(1);
        document.getElementById('sellerSales').textContent = sellerData.sales || 0;
        document.getElementById('chatSellerName').textContent = sellerData.name || 'Seller';

        updateOnlineStatus(sellerData.isOnline);
        listenToSellerStatus(sellerUid);

    } catch (error) {
        console.error('Error loading seller:', error);
    }
}

function formatCategory(cat) {
    const names = {
        'fashion': 'Fashion & Clothing',
        'home': 'Home & Decor',
        'food': 'Food & Beverages',
        'beauty': 'Beauty & Care',
        'arts': 'Arts & Crafts',
        'accessories': 'Accessories',
        'health': 'Health & Wellness'
    };
    return names[cat] || (cat ? cat.charAt(0).toUpperCase() + cat.slice(1) : 'General');
}

function updateOnlineStatus(isOnline) {
    const dot = document.querySelector('.online-dot');
    if (isOnline) {
        dot.style.background = '#2ecc71';
        dot.style.boxShadow = '0 0 8px #2ecc71';
    } else {
        dot.style.background = '#95a5a6';
        dot.style.boxShadow = 'none';
    }
}

function listenToSellerStatus(sellerUid) {
    onlineRef = ref(db, 'users/' + sellerUid + '/isOnline');
    onValue(onlineRef, (snapshot) => {
        updateOnlineStatus(snapshot.val());
    });
}

async function loadReviews() {
    try {
        const reviewsQuery = query(
            collection(firestore, 'reviews'),
            where('productId', '==', productId)
        );
        const reviewsSnap = await getDocs(reviewsQuery);
        const reviewsList = document.getElementById('reviewsList');

        if (!reviewsSnap.empty) {
            reviewsList.innerHTML = '';
            reviewsSnap.forEach(doc => {
                const review = doc.data();
                addReviewCard(review);
            });
        }
    } catch (error) {
        console.log('No reviews yet or error:', error);
    }
}

function addReviewCard(review) {
    const reviewsList = document.getElementById('reviewsList');
    const stars = '★'.repeat(review.rating) + '☆'.repeat(5 - review.rating);
    const initial = review.userName ? review.userName.charAt(0).toUpperCase() : 'U';

    const card = document.createElement('div');
    card.className = 'review-card';
    card.innerHTML = `
        <div class="review-header">
            <div class="reviewer">
                <div class="reviewer-avatar">${initial}</div>
                <div class="reviewer-info">
                    <h5>${review.userName || 'Anonymous'}</h5>
                    <span>${review.date ? new Date(review.date.toDate()).toLocaleDateString() : 'Recently'}</span>
                </div>
            </div>
            <span class="stars">${stars}</span>
        </div>
        <div class="review-body">
            <p>${review.text}</p>
        </div>
    `;
    reviewsList.appendChild(card);
}

// Quantity controls
const qtyInput = document.getElementById('qtyInput');
document.getElementById('qtyMinus').addEventListener('click', () => {
    if (qtyInput.value > 1) qtyInput.value--;
});
document.getElementById('qtyPlus').addEventListener('click', () => {
    if (qtyInput.value < 99) qtyInput.value++;
});

// Add to cart
document.getElementById('addToCartBtn').addEventListener('click', function() {
    if (!currentProduct) return;
    const qty = parseInt(qtyInput.value);

    let cart = JSON.parse(localStorage.getItem('smallBizCart') || '[]');
    // FIXED: Use String comparison for Firestore IDs
    const existing = cart.find(item => String(item.id) === String(currentProduct.id));

    if (existing) {
        existing.quantity += qty;
    } else {
        cart.push({
            id: String(currentProduct.id),
            name: currentProduct.name,
            price: currentProduct.price,
            image: currentProduct.image || 'image/placeholder.jpg',
            quantity: qty,
            sellerId: currentProduct.sellerId
        });
    }

    localStorage.setItem('smallBizCart', JSON.stringify(cart));
    updateCartCount();
    showNotification(qty + ' item(s) added to cart!', 'success');
});

// ===== REAL-TIME LIVE CHAT =====
const chatToggle = document.getElementById('chatToggle');
const chatBox = document.getElementById('chatBox');
const chatClose = document.getElementById('chatClose');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const chatSend = document.getElementById('chatSend');
const typingIndicator = document.getElementById('typingIndicator');

let chatOpen = false;

// ===== FIXED: Auth guard - block guests from chatting =====
function requireAuthForChat(action) {
    if (!currentUser) {
        showNotification('Please sign in to chat with the seller', 'warning');
        setTimeout(() => window.location.href = 'login.html', 1500);
        return false;
    }
    return true;
}

chatToggle.addEventListener('click', () => {
    if (!requireAuthForChat()) return;
    chatOpen = !chatOpen;
    chatBox.classList.toggle('open', chatOpen);
    if (chatOpen) {
        chatInput.focus();
        initChat();
    }
});

chatClose.addEventListener('click', () => {
    chatOpen = false;
    chatBox.classList.remove('open');
    if (messagesRef) off(messagesRef);
});

document.getElementById('chatSellerBtn').addEventListener('click', () => {
    if (!requireAuthForChat()) return;
    chatOpen = true;
    chatBox.classList.add('open');
    chatInput.focus();
    initChat();
});

function initChat() {
    if (!currentUser || !sellerId || !productId) return;

    const ids = [currentUser.uid, sellerId].sort();
    chatRoomId = 'chat_' + ids.join('_') + '_product_' + productId;

    chatMessages.innerHTML = `
        <div class="chat-message received">
            <div class="msg-bubble">Hello! How can I help you with this product today?</div>
            <div class="msg-time">${formatTime(new Date())}</div>
        </div>
    `;

    messagesRef = ref(db, 'chats/' + chatRoomId + '/messages');
    onChildAdded(messagesRef, (snapshot) => {
        const msg = snapshot.val();
        if (msg.senderId !== currentUser.uid) {
            addMessageToUI(msg.text, 'received', msg.timestamp);
        }
    });
}

function addMessageToUI(text, sender, timestamp, scroll = true) {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'chat-message ' + sender;
    const time = timestamp ? formatTime(new Date(timestamp)) : formatTime(new Date());
    msgDiv.innerHTML = `
        <div class="msg-bubble">${escapeHtml(text)}</div>
        <div class="msg-time">${time}</div>
    `;
    chatMessages.appendChild(msgDiv);
    if (scroll) chatMessages.scrollTop = chatMessages.scrollHeight;
}

function formatTime(date) {
    return date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !currentUser || !chatRoomId) return;

    addMessageToUI(text, 'sent');
    chatInput.value = '';

    try {
        const messagesRef = ref(db, 'chats/' + chatRoomId + '/messages');
        await push(messagesRef, {
            text: text,
            senderId: currentUser.uid,
            senderName: currentUser.name,
            senderRole: 'buyer',
            timestamp: Date.now(),
            read: false
        });

        await set(ref(db, 'chats/' + chatRoomId + '/lastMessage'), {
            text: text,
            senderId: currentUser.uid,
            senderName: currentUser.name,
            senderRole: 'buyer',
            timestamp: Date.now(),
            read: false
        });
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Failed to send message', 'error');
    }
}

chatSend.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Initialize
document.addEventListener('DOMContentLoaded', loadProductDetails);
