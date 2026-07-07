// Firebase Auth - Real Implementation
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    signInWithPopup, 
    GoogleAuthProvider, 
    onAuthStateChanged, 
    signOut,
    sendPasswordResetEmail,
    updateProfile,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc,
    updateDoc,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { firebaseConfig } from './firebase-config.js';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Make auth available globally for nav.js
window.firebaseAuth = auth;

// Tab switching
document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', function() {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        this.classList.add('active');
        document.getElementById(this.dataset.tab + 'Form').classList.add('active');
    });
});

// Role selector
document.querySelectorAll('.role-option').forEach(option => {
    option.addEventListener('click', function() {
        document.querySelectorAll('.role-option').forEach(o => o.classList.remove('selected'));
        this.classList.add('selected');
    });
});

// Login form
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const btn = this.querySelector('button[type="submit"]');
    btn.textContent = 'Signing in...';
    btn.disabled = true;

    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Get user data from Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        const userData = userDoc.data() || {};

        // FIXED: Better name fallback
        const displayName = user.displayName || userData?.name || email.split('@')[0];

        // Save to localStorage for nav - PRESERVE saved items and cart
        const existing = JSON.parse(localStorage.getItem('sbm_user') || '{}');
        localStorage.setItem('sbm_user', JSON.stringify({
            ...existing,
            uid: user.uid,
            name: displayName,
            email: user.email,
            role: userData?.role || 'buyer',
            photoURL: user.photoURL
        }));

        showNotification('Welcome back, ' + displayName + '!', 'success');

        // Redirect based on role
        setTimeout(() => {
            if (userData?.role === 'seller') {
                window.location.href = 'seller-dashboard.html';
            } else {
                window.location.href = 'index.html';
            }
        }, 1500);
    } catch (error) {
        let msg = 'Login failed: ';
        switch(error.code) {
            case 'auth/user-not-found': msg += 'No account found with this email.'; break;
            case 'auth/wrong-password': msg += 'Incorrect password.'; break;
            case 'auth/invalid-email': msg += 'Invalid email address.'; break;
            case 'auth/invalid-credential': msg += 'Invalid email or password.'; break;
            case 'auth/too-many-requests': msg += 'Too many attempts. Please try again later.'; break;
            default: msg += error.message;
        }
        showNotification(msg, 'error');
    } finally {
        btn.textContent = 'Sign In';
        btn.disabled = false;
    }
});

// Register form
document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    const name = document.getElementById('regName').value;
    const email = document.getElementById('regEmail').value;
    const phone = document.getElementById('regPhone').value;
    const password = document.getElementById('regPassword').value;
    const confirm = document.getElementById('regConfirm').value;
    const role = document.querySelector('.role-option.selected').dataset.role;
    const btn = this.querySelector('button[type="submit"]');

    if (password !== confirm) {
        showNotification('Passwords do not match!', 'error');
        return;
    }
    if (password.length < 6) {
        showNotification('Password must be at least 6 characters.', 'error');
        return;
    }

    btn.textContent = 'Creating account...';
    btn.disabled = true;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Update profile with name
        await updateProfile(user, { displayName: name });

        // Save user data to Firestore
        await setDoc(doc(db, 'users', user.uid), {
            uid: user.uid,
            name: name,
            email: email,
            phone: phone,
            role: role,
            createdAt: serverTimestamp(),
            isOnline: true,
            lastSeen: serverTimestamp()
        });

        // Save to localStorage - PRESERVE existing data
        const existing = JSON.parse(localStorage.getItem('sbm_user') || '{}');
        localStorage.setItem('sbm_user', JSON.stringify({
            ...existing,
            uid: user.uid,
            name: name,
            email: email,
            role: role
        }));

        showNotification('Account created successfully! Welcome to SmallBizMart.', 'success');

        setTimeout(() => {
            if (role === 'seller') {
                window.location.href = 'seller-dashboard.html';
            } else {
                window.location.href = 'index.html';
            }
        }, 1500);
    } catch (error) {
        let msg = 'Registration failed: ';
        switch(error.code) {
            case 'auth/email-already-in-use': msg += 'This email is already registered.'; break;
            case 'auth/invalid-email': msg += 'Invalid email address.'; break;
            case 'auth/weak-password': msg += 'Password is too weak.'; break;
            default: msg += error.message;
        }
        showNotification(msg, 'error');
    } finally {
        btn.textContent = 'Create Account';
        btn.disabled = false;
    }
});

// Google Sign In
document.getElementById('googleSignIn').addEventListener('click', async function() {
    const provider = new GoogleAuthProvider();
    const btn = this;
    btn.innerHTML = 'Loading...';
    btn.disabled = true;

    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Check if user exists in Firestore
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (!userDoc.exists()) {
            // New user - save to Firestore as buyer by default
            await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                name: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                role: 'buyer',
                createdAt: serverTimestamp(),
                isOnline: true,
                lastSeen: serverTimestamp()
            });
        } else {
            // Update online status
            await updateDoc(doc(db, 'users', user.uid), {
                isOnline: true,
                lastSeen: serverTimestamp()
            });
        }

        const userData = userDoc.exists() ? userDoc.data() : { role: 'buyer' };

        // PRESERVE existing localStorage data
        const existing = JSON.parse(localStorage.getItem('sbm_user') || '{}');
        localStorage.setItem('sbm_user', JSON.stringify({
            ...existing,
            uid: user.uid,
            name: user.displayName,
            email: user.email,
            role: userData.role,
            photoURL: user.photoURL
        }));

        showNotification('Welcome, ' + user.displayName + '!', 'success');
        setTimeout(() => window.location.href = 'index.html', 1500);
    } catch (error) {
        showNotification('Google sign-in failed: ' + error.message, 'error');
    } finally {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Continue with Google';
        btn.disabled = false;
    }
});

// Google Sign Up
document.getElementById('googleSignUp').addEventListener('click', async function() {
    const provider = new GoogleAuthProvider();
    const role = document.querySelector('.role-option.selected').dataset.role;
    const btn = this;
    btn.innerHTML = 'Loading...';
    btn.disabled = true;

    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;

        // Check if user exists
        const userDoc = await getDoc(doc(db, 'users', user.uid));

        if (!userDoc.exists()) {
            await setDoc(doc(db, 'users', user.uid), {
                uid: user.uid,
                name: user.displayName,
                email: user.email,
                photoURL: user.photoURL,
                role: role,
                createdAt: serverTimestamp(),
                isOnline: true,
                lastSeen: serverTimestamp()
            });
        }

        // PRESERVE existing localStorage data
        const existing = JSON.parse(localStorage.getItem('sbm_user') || '{}');
        localStorage.setItem('sbm_user', JSON.stringify({
            ...existing,
            uid: user.uid,
            name: user.displayName,
            email: user.email,
            role: role,
            photoURL: user.photoURL
        }));

        showNotification('Account created successfully!', 'success');
        setTimeout(() => {
            if (role === 'seller') {
                window.location.href = 'seller-dashboard.html';
            } else {
                window.location.href = 'index.html';
            }
        }, 1500);
    } catch (error) {
        showNotification('Google sign-up failed: ' + error.message, 'error');
    } finally {
        btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg> Sign up with Google';
        btn.disabled = false;
    }
});

// Forgot password
document.getElementById('forgotPassword').addEventListener('click', async function(e) {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    if (!email) {
        showNotification('Please enter your email address first.', 'warning');
        return;
    }
    try {
        await sendPasswordResetEmail(auth, email);
        showNotification('Password reset link sent to your email!', 'success');
    } catch (error) {
        showNotification('Failed to send reset email: ' + error.message, 'error');
    }
});

// FIXED: Auth state listener - refresh user data but PRESERVE local data
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            const userData = userDoc.data() || {};

            // PRESERVE existing localStorage (cart, saved items, etc.)
            const existing = JSON.parse(localStorage.getItem('sbm_user') || '{}');
            localStorage.setItem('sbm_user', JSON.stringify({
                ...existing,
                uid: user.uid,
                name: user.displayName || userData.name || existing.name || user.email.split('@')[0],
                email: user.email,
                role: userData.role || existing.role || 'buyer',
                photoURL: user.photoURL
            }));

            await updateDoc(doc(db, 'users', user.uid), {
                isOnline: true,
                lastSeen: serverTimestamp()
            });
        } catch (err) {
            console.error('Auth state error:', err);
        }
    }
});

// Handle page unload - set offline
window.addEventListener('beforeunload', async () => {
    const user = auth.currentUser;
    if (user) {
        await updateDoc(doc(db, 'users', user.uid), {
            isOnline: false,
            lastSeen: serverTimestamp()
        });
    }
});
