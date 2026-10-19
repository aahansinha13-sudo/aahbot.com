/**
 * Aahbot Local JSON Authentication System
 * Stores and manages user accounts and sessions locally using JSON.
 */

const DEFAULT_USERS_JSON = [
  {
    "username": "admin",
    "password": "password123",
    "premium": true,
    "createdAt": "2026-10-18T12:00:00.000Z"
  },
  {
    "username": "Aahan Sinha",
    "password": "Aaxan Sixha",
    "premium": true,
    "createdAt": "2026-10-18T12:00:00.000Z"
  },
  {
    "username": "Nishant Sinha",
    "password": "nishant.",
    "premium": false,
    "createdAt": "2026-10-18T12:00:00.000Z"
  },
  {
    "username": "user",
    "password": "123",
    "premium": false,
    "createdAt": "2026-10-18T12:00:00.000Z"
  }
];

const DEFAULT_PASSES_JSON = [
  { "code": "AAHBOT-PREMIUM-2026", "used": false, "usedBy": null },
  { "code": "VIP-ACCESS-001", "used": false, "usedBy": null },
  { "code": "PREMIUM-PASS-XYZ", "used": false, "usedBy": null },
  { "code": "GOLDEN-AAH-2026", "used": false, "usedBy": null }
];

const STORAGE_KEYS = {
  USERS: "aahbot_users_json",
  CURRENT_USER: "aahbot_current_user_json",
  PASSES: "aahbot_premium_passes_json"
};

const Auth = {
  /**
   * Initialize local JSON storage if not already present
   */
  init() {
    if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
      this.saveUsers(DEFAULT_USERS_JSON);
    } else {
      // Ensure default users from users.json exist in localStorage
      const localUsers = this.getUsers();
      let updated = false;
      DEFAULT_USERS_JSON.forEach(du => {
        const existingIdx = localUsers.findIndex(lu => lu.username.toLowerCase() === du.username.toLowerCase());
        if (existingIdx === -1) {
          localUsers.push(du);
          updated = true;
        } else if (localUsers[existingIdx].password !== du.password) {
          // Keep password synchronized with users.json
          localUsers[existingIdx].password = du.password;
          localUsers[existingIdx].premium = du.premium;
          updated = true;
        }
      });
      if (updated) {
        this.saveUsers(localUsers);
      }
    }
    if (!localStorage.getItem(STORAGE_KEYS.PASSES)) {
      this.savePasses(DEFAULT_PASSES_JSON);
    }

    // Attempt to load external users.json if running via http/https server
    if (window.location.protocol.startsWith("http")) {
      fetch("users.json")
        .then(res => res.json())
        .then(remoteUsers => {
          if (Array.isArray(remoteUsers) && remoteUsers.length > 0) {
            const localUsers = this.getUsers();
            // Merge remote users if not already present
            let updated = false;
            remoteUsers.forEach(ru => {
              if (!localUsers.some(lu => lu.username.toLowerCase() === ru.username.toLowerCase())) {
                localUsers.push(ru);
                updated = true;
              }
            });
            if (updated) {
              this.saveUsers(localUsers);
            }
          }
        })
        .catch(() => {
          // Ignore fetch error on local/offline environments
        });
    }
  },

  /**
   * Retrieve all users as an array of objects parsed from JSON
   */
  getUsers() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USERS);
      return data ? JSON.parse(data) : DEFAULT_USERS_JSON;
    } catch (e) {
      console.error("Failed to parse users JSON from localStorage:", e);
      return DEFAULT_USERS_JSON;
    }
  },

  /**
   * Save users array into localStorage serialized as a JSON string
   */
  saveUsers(usersArray) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(usersArray, null, 2));
  },

  /**
   * Retrieve passes array parsed from JSON
   */
  getPasses() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PASSES);
      return data ? JSON.parse(data) : DEFAULT_PASSES_JSON;
    } catch (e) {
      return DEFAULT_PASSES_JSON;
    }
  },

  /**
   * Save passes array into localStorage serialized as a JSON string
   */
  savePasses(passesArray) {
    localStorage.setItem(STORAGE_KEYS.PASSES, JSON.stringify(passesArray, null, 2));
  },

  /**
   * Register a new user and save to local JSON
   */
  register(username, password) {
    const trimmedUsername = (username || "").trim();
    const trimmedPassword = (password || "").trim();

    if (!trimmedUsername || !trimmedPassword) {
      return { success: false, message: "Username and password cannot be empty." };
    }

    if (trimmedUsername.length < 3) {
      return { success: false, message: "Username must be at least 3 characters long." };
    }

    if (trimmedPassword.length < 3) {
      return { success: false, message: "Password must be at least 3 characters long." };
    }

    const users = this.getUsers();
    const existing = users.find(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());

    if (existing) {
      return { success: false, message: "Username is already taken. Please choose another." };
    }

    const newUser = {
      username: trimmedUsername,
      password: trimmedPassword,
      premium: false,
      createdAt: new Date().toISOString()
    };

    users.push(newUser);
    this.saveUsers(users);

    // Automatically set current session
    this.setCurrentUser({
      username: newUser.username,
      premium: newUser.premium,
      isGuest: false,
      loggedInAt: new Date().toISOString()
    });

    return { success: true, message: "Account created successfully!", user: newUser };
  },

  /**
   * Authenticate a user against local JSON
   */
  login(username, password) {
    const trimmedUsername = (username || "").trim();
    const trimmedPassword = (password || "").trim();

    if (!trimmedUsername || !trimmedPassword) {
      return { success: false, message: "Please enter both username and password." };
    }

    const users = this.getUsers();
    const user = users.find(u => u.username.toLowerCase() === trimmedUsername.toLowerCase());

    if (!user) {
      return { success: false, message: "User not found. Check username or sign up." };
    }

    if (user.password !== trimmedPassword) {
      return { success: false, message: "Incorrect password. Please try again." };
    }

    // Login successful
    const sessionUser = {
      username: user.username,
      premium: !!user.premium,
      isGuest: false,
      loggedInAt: new Date().toISOString()
    };
    this.setCurrentUser(sessionUser);

    return { success: true, message: "Login successful!", user: sessionUser };
  },

  /**
   * Login as Guest
   */
  loginAsGuest() {
    const guestUser = {
      username: "Guest",
      premium: false,
      isGuest: true,
      loggedInAt: new Date().toISOString()
    };
    this.setCurrentUser(guestUser);
    return { success: true, message: "Guest session started.", user: guestUser };
  },

  /**
   * Save active user session into JSON
   */
  setCurrentUser(user) {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
    }
  },

  /**
   * Get current active user from JSON session
   */
  getCurrentUser() {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Logout current user
   */
  logout() {
    localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  },

  /**
   * Activate premium using a pass code
   */
  activatePremium(passCode) {
    const currentUser = this.getCurrentUser();
    if (!currentUser) {
      return { success: false, message: "You must be logged in to activate a premium pass." };
    }

    if (currentUser.isGuest) {
      return { success: false, message: "Guest users cannot activate premium. Please sign up or log in first." };
    }

    const trimmedCode = (passCode || "").trim().toUpperCase();
    if (!trimmedCode) {
      return { success: false, message: "Please enter a valid pass code." };
    }

    const passes = this.getPasses();
    const passIndex = passes.findIndex(p => p.code.toUpperCase() === trimmedCode);

    if (passIndex === -1) {
      return { success: false, message: "Invalid pass code." };
    }

    if (passes[passIndex].used) {
      return { success: false, message: `This code was already redeemed by "${passes[passIndex].usedBy}".` };
    }

    // Mark pass as redeemed
    passes[passIndex].used = true;
    passes[passIndex].usedBy = currentUser.username;
    passes[passIndex].usedAt = new Date().toISOString();
    this.savePasses(passes);

    // Update user in users JSON database
    const users = this.getUsers();
    const userIndex = users.findIndex(u => u.username.toLowerCase() === currentUser.username.toLowerCase());
    if (userIndex !== -1) {
      users[userIndex].premium = true;
      this.saveUsers(users);
    }

    // Update current session
    currentUser.premium = true;
    this.setCurrentUser(currentUser);

    return {
      success: true,
      message: `🎉 Premium unlocked successfully for ${currentUser.username}!`,
      code: trimmedCode
    };
  },

  /**
   * Export the entire users database formatted as JSON
   */
  exportUsersJson() {
    return JSON.stringify(this.getUsers(), null, 2);
  },

  /**
   * Download users.json file to local machine
   */
  downloadUsersJson() {
    const jsonStr = this.exportUsersJson();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "users.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
};

// Initialize immediately upon loading script
Auth.init();

// Expose globally
window.Auth = Auth;
