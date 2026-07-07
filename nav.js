// Shared Navigation User Menu functionality + Unread Message Badge

(function() {
    const userMenuToggle = document.getElementById('userMenuToggle');
    const userDropdown = document.getElementById('userDropdown');
    const navSellLink = document.getElementById('navSellLink');
    const dropdownSellLink = document.getElementById('dropdownSellLink');
    const dropdownLoginLink = document.getElementById('dropdownLoginLink');
    const dropdownLogoutLink = document.getElementById('dropdownLogoutLink');
    const dropdownName = document.getElementById('dropdownName');
    const dropdownEmail = document.getElementById('dropdownEmail');
    const userMenuText = document.getElementById('userMenuText');

    if (!userMenuToggle || !userDropdown) return;

    let isLoggedIn = false;
    let unreadListener = null;

    // Toggle dropdown on click
    userMenuToggle.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();

        if (!isLoggedIn) {
            window.location.href = 'login.html';
            return;
        }

        userDropdown.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
        if (!userMenuToggle.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.remove('show');
        }
    });

    // Prevent dropdown from closing when clicking inside it
    userDropdown.addEventListener('click', function(e) {
        const isLink = e.target.tagName === 'A' || e.target.closest('a');
        if (!isLink) {
            e.stopPropagation();
        }
    });

    // ===== FIXED: Real-time unread message listener =====
    async function setupUnreadListener(uid) {
        // Clean up previous listener
        if (unreadListener) {
            try {
                const { off, ref } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
                const { getDatabase } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
                const rtdb = getDatabase();
                off(ref(rtdb, 'chats'));
            } catch (e) {}
        }

        try {
            const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js");
            const { getDatabase, ref, onValue } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
            const { firebaseConfig } = await import('./firebase-config.js');

            const app = initializeApp(firebaseConfig);
            const rtdb = getDatabase(app);
            const chatsRef = ref(rtdb, 'chats');

            unreadListener = onValue(chatsRef, (snapshot) => {
                let unreadCount = 0;

                if (snapshot.exists()) {
                    snapshot.forEach((child) => {
                        const chatData = child.val();
                        if (child.key.includes(uid)) {
                            const lastMsg = chatData.lastMessage;
                            // Count if unread AND from someone else
                            if (lastMsg && !lastMsg.read && lastMsg.senderId !== uid) {
                                unreadCount++;
                            }
                        }
                    });
                }

                updateMessageBadge(unreadCount);
            });
        } catch (err) {
            console.log('Unread listener setup error:', err);
        }
    }

    function updateMessageBadge(count) {
        // Find or create badge in nav
        let badge = document.getElementById('navMsgBadge');

        // Check if we're on a page with messages link in dropdown
        const messagesLink = Array.from(userDropdown.querySelectorAll('a')).find(a => a.href && a.href.includes('messages.html'));

        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.id = 'navMsgBadge';
                badge.style.cssText = 'background:var(--accent-color);color:white;border-radius:50%;width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;font-size:0.7rem;margin-left:0.3rem;vertical-align:middle;';

                // Add to Messages link in dropdown if exists
                if (messagesLink) {
                    messagesLink.appendChild(badge);
                }
            }
            badge.textContent = count > 9 ? '9+' : count;
            badge.style.display = 'inline-flex';
        } else if (badge) {
            badge.style.display = 'none';
        }
    }

    // Check login status
    async function checkUserStatus() {
        let firebaseUser = null;
        try {
            if (window.firebaseAuth) {
                firebaseUser = window.firebaseAuth.currentUser;
            }
        } catch (err) {}

        const localUser = JSON.parse(localStorage.getItem('sbm_user') || '{}');
        const user = (firebaseUser && firebaseUser.uid) ? { ...localUser, uid: firebaseUser.uid } : localUser;

        if (user && user.uid) {
            isLoggedIn = true;

            const avatar = user.photoURL 
                ? `<img src="${user.photoURL}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;">`
                : `<span class="user-avatar">${(user.name || 'U').charAt(0).toUpperCase()}</span>`;
            userMenuText.innerHTML = avatar;

            dropdownName.textContent = user.name || 'User';
            dropdownEmail.textContent = user.email || '';
            dropdownLoginLink.style.display = 'none';
            dropdownLogoutLink.style.display = 'block';

            if (user.role === 'seller') {
                if (navSellLink) navSellLink.classList.add('visible');
                if (dropdownSellLink) dropdownSellLink.style.display = 'block';
            } else {
                if (navSellLink) navSellLink.classList.remove('visible');
                if (dropdownSellLink) dropdownSellLink.style.display = 'none';
            }

            // ===== FIXED: Setup real-time unread message listener =====
            setupUnreadListener(user.uid);

        } else {
            isLoggedIn = false;

            userMenuText.textContent = 'Account';

            dropdownName.textContent = 'Guest';
            dropdownEmail.textContent = 'Sign in to your account';
            dropdownLoginLink.style.display = 'block';
            dropdownLogoutLink.style.display = 'none';
            if (navSellLink) navSellLink.classList.remove('visible');
            if (dropdownSellLink) dropdownSellLink.style.display = 'none';

            // Remove message badge when logged out
            updateMessageBadge(0);
        }
    }

    // Logout handler
    if (dropdownLogoutLink) {
        dropdownLogoutLink.addEventListener('click', async function(e) {
            e.preventDefault();
            e.stopPropagation();

            try {
                const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
                if (window.firebaseAuth) {
                    await signOut(window.firebaseAuth);
                }
            } catch (err) {
                console.log('Firebase signout:', err);
            }

            localStorage.removeItem('sbm_user');
            localStorage.removeItem('smallBizCart');
            localStorage.removeItem('sbm_saved');
            localStorage.removeItem('sbm_orders');
            sessionStorage.clear();

            userDropdown.classList.remove('show');

            if (typeof showNotification === 'function') {
                showNotification('Logged out successfully', 'success');
            }

            setTimeout(() => window.location.href = 'index.html', 1000);
        });
    }

    checkUserStatus();

    // Re-check on auth state changes
    window.addEventListener('storage', checkUserStatus);
})();
