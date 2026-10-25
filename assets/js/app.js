// assets/js/app.js
import {
  auth,
  db,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  getDocs,
  collection,
  query,
  where,
  limit,
  serverTimestamp,
  deleteDoc
} from "./firebase-config.js";

import { uploadMedia } from "./cloudinary-config.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) =>
  [...root.querySelectorAll(selector)];

const state = {
  user: null,
  profile: null,
  authMode: "login",
  storyFilter: "public",
  connectionTab: "discover",
  stories: [],
  busy: false
};

const fallbackProfile = (user) => ({
  uid: user.uid,
  displayName: user.displayName || "Member",
  gender: "other",
  bio: "",
  interests: [],
  photoURL: ""
});

function showToast(message, type = "info") {
  const region = $("#toast-region");
  if (!region) {
    console.log(message);
    return;
  }

  const item = document.createElement("div");
  item.className = `toast toast-${type}`;
  item.textContent = message;
  region.appendChild(item);

  window.setTimeout(() => item.remove(), 4500);
}

function setMessage(selector, message, type = "error") {
  const element = $(selector);
  if (!element) return;

  element.textContent = message;
  element.dataset.type = type;
  element.hidden = !message;
}

function explainError(error) {
  const code = error?.code || "";

  const messages = {
    "auth/email-already-in-use": "Ee email tho account already undhi. Login try cheyyi.",
    "auth/invalid-email": "Valid email address enter cheyyi.",
    "auth/weak-password": "Strong password enter cheyyi. At least 6 characters undali.",
    "auth/invalid-credential": "Email or password correct kaadu.",
    "auth/user-not-found": "Ee email tho account kanipinchaledhu.",
    "auth/wrong-password": "Password correct kaadu.",
    "auth/too-many-requests": "Chala attempts ayyayi. Konchem sepu tarvatha try cheyyi.",
    "auth/network-request-failed": "Internet connection check chesi malli try cheyyi.",
    "permission-denied": "Firestore permission denied. Published security rules-ni check cheyyali.",
    "firestore/permission-denied": "Firestore permission denied. Security rules-ni check cheyyali."
  };

  if (messages[code]) return messages[code];
  if (code.includes("permission-denied")) {
    return "Firestore access denied. Security rules or document fields match avvatledhu.";
  }

  return error?.message || "Unexpected error. Malli try cheyyi.";
}

function setBusy(busy) {
  state.busy = busy;

  const submit = $("#auth-submit");
  if (submit) {
    submit.disabled = busy;
    submit.textContent = busy
      ? "Please wait..."
      : state.authMode === "signup"
        ? "Create account"
        : "Login";
  }

  const publish = $("#publish-story-button");
  if (publish) publish.disabled = busy;
}

function openDialog(selector) {
  const dialog = $(selector);
  if (!dialog) return;

  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.hidden = false;
    dialog.setAttribute("open", "");
  }
}

function closeDialog(selector) {
  const dialog = $(selector);
  if (!dialog) return;

  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  } else {
    dialog.hidden = true;
    dialog.removeAttribute("open");
  }
}

function closeAllDialogs() {
  $$("dialog").forEach((dialog) => {
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.hidden = true;
      dialog.removeAttribute("open");
    }
  });
}

function setAuthMode(mode) {
  state.authMode = mode === "signup" ? "signup" : "login";

  const signup = state.authMode === "signup";
  const nameField = $("#auth-display-name");
  const genderField = $("#auth-gender");
  const submit = $("#auth-submit");
  const toggle = $("#auth-mode-toggle");

  if (nameField) nameField.closest(".form-field, label")?.classList.toggle("is-visible", signup);
  if (genderField) genderField.closest(".form-field, label")?.classList.toggle("is-visible", signup);

  if (nameField) {
    nameField.hidden = !signup;
    nameField.required = signup;
  }

  if (genderField) {
    genderField.hidden = !signup;
    genderField.required = signup;
  }

  if (submit) submit.textContent = signup ? "Create account" : "Login";
  if (toggle) {
    toggle.textContent = signup
      ? "Already have an account? Login"
      : "New here? Create an account";
  }

  setMessage("#auth-message", "");
}

function openAuth(mode = "login") {
  setAuthMode(mode);
  openDialog("#auth-dialog");
}

async function loadProfile(user, createIfMissing = false) {
  const profileRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(profileRef);

  if (snapshot.exists()) {
    state.profile = {
      ...fallbackProfile(user),
      ...snapshot.data(),
      uid: user.uid
    };
    updateNavigation();
    applyExperience();
    return state.profile;
  }

  // Auth-state changes must not automatically write a missing profile.
  // This prevents the auth listener racing with the signup profile write.
  state.profile = fallbackProfile(user);

  if (createIfMissing) {
    const profile = {
      ...state.profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await setDoc(profileRef, profile);
    state.profile = { ...state.profile };
  }

  updateNavigation();
  applyExperience();
  return state.profile;
}

function updateNavigation() {
  const loggedIn = Boolean(state.user);

  const loginButton = $("#login-button");
  const signupButton = $("#signup-button");
  const accountMenu = $("#account-menu");

  if (loginButton) loginButton.hidden = loggedIn;
  if (signupButton) signupButton.hidden = loggedIn;
  if (accountMenu) accountMenu.hidden = !loggedIn;

  const accountName = $("#account-name");
  if (accountName) {
    accountName.textContent =
      state.profile?.displayName || state.user?.displayName || "My account";
  }

  const avatar = $("#account-avatar");
  if (avatar) {
    avatar.textContent = (state.profile?.displayName || "M").slice(0, 1).toUpperCase();
    if (state.profile?.photoURL) {
      avatar.style.backgroundImage = `url("${state.profile.photoURL}")`;
    } else {
      avatar.style.backgroundImage = "";
    }
  }
}

function applyExperience() {
  const title = $("#hero-title");
  const quote = $("#hero-quote");
  const gender = state.profile?.gender || "other";

  const messages = {
    male: {
      title: "Welcome, King.",
      quote: "Your story. Your strength. Your world."
    },
    female: {
      title: "Welcome, Queen.",
      quote: "Your story. Your strength. Your world."
    },
    other: {
      title: "Welcome to your world.",
      quote: "Your Soul. Your Story. Your Identity."
    }
  };

  const welcome = messages[gender] || messages.other;

  if (title) title.textContent = welcome.title;
  if (quote) quote.textContent = welcome.quote;
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function formatDate(value) {
  if (!value) return "";

  const date = typeof value.toDate === "function"
    ? value.toDate()
    : new Date(value);

  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  });
}

function mediaMarkup(story) {
  if (!story.mediaURL) return "";

  const url = escapeHTML(story.mediaURL);
  const type = story.mediaType || "";

  if (type === "video") {
    return `<video class="story-media" src="${url}" controls playsinline preload="metadata"></video>`;
  }

  if (type === "audio") {
    return `<audio class="story-audio" src="${url}" controls preload="metadata"></audio>`;
  }

  return `<img class="story-media" src="${url}" alt="Story media" loading="lazy">`;
}

function storyMarkup(story) {
  const owner = state.user?.uid === story.authorId;
  const displayName = escapeHTML(story.authorName || "BE ONLY ONE member");
  const title = escapeHTML(story.title || "Untitled story");
  const text = escapeHTML(story.text || "");
  const mood = story.mood ? `<span class="story-mood">${escapeHTML(story.mood)}</span>` : "";
  const kind = escapeHTML(story.kind || "feeling");

  return `
    <article class="story-card" data-story-id="${escapeHTML(story.id)}">
      <header class="story-card-header">
        <div class="story-author-avatar" aria-hidden="true">${displayName.slice(0, 1).toUpperCase()}</div>
        <div class="story-author-details">
          <strong>${displayName}</strong>
          <span>${formatDate(story.createdAt)}</span>
        </div>
        ${owner ? `<button type="button" class="story-delete" data-action="delete-story" data-id="${escapeHTML(story.id)}" aria-label="Delete story">Delete</button>` : ""}
      </header>
      <div class="story-card-content">
        <span class="story-kind">${kind}</span>
        <h3>${title}</h3>
        ${mood}
        ${text ? `<p>${text.replace(/\n/g, "<br>")}</p>` : ""}
        ${mediaMarkup(story)}
      </div>
      <footer class="story-card-footer">
        <span>${escapeHTML(story.visibility || "public")}</span>
        ${!owner && state.user ? `<button type="button" data-action="report-story" data-id="${escapeHTML(story.id)}" data-author="${escapeHTML(story.authorId)}">Report</button>` : ""}
      </footer>
    </article>
  `;
}

function renderStories() {
  const feed = $("#stories-feed");
  if (!feed) return;

  let stories = [...state.stories];

  if (state.storyFilter === "mine") {
    stories = stories.filter((story) => story.authorId === state.user?.uid);
  } else if (state.storyFilter === "connections") {
    // Only stories returned by Firestore are eligible to be displayed.
    stories = stories.filter((story) =>
      story.authorId === state.user?.uid ||
      story.visibility === "connections"
    );
  } else {
    stories = stories.filter((story) =>
      story.authorId === state.user?.uid ||
      story.visibility === "public"
    );
  }

  stories.sort((a, b) => {
    const dateA = a.createdAt?.toMillis?.() || 0;
    const dateB = b.createdAt?.toMillis?.() || 0;
    return dateB - dateA;
  });

  feed.innerHTML = stories.length
    ? stories.map(storyMarkup).join("")
    : `<div class="empty-state"><h3>No stories to show yet</h3><p>Share a feeling or memory to start your world.</p></div>`;
}

async function fetchStories() {
  if (!state.user) {
    state.stories = [];
    renderStories();
    return;
  }

  try {
    const collected = new Map();

    const ownQuery = query(
      collection(db, "stories"),
      where("authorId", "==", state.user.uid),
      limit(50)
    );
    const publicQuery = query(
      collection(db, "stories"),
      where("visibility", "==", "public"),
      limit(50)
    );

    const [ownSnapshot, publicSnapshot] = await Promise.all([
      getDocs(ownQuery),
      getDocs(publicQuery)
    ]);

    ownSnapshot.forEach((item) => collected.set(item.id, { id: item.id, ...item.data() }));
    publicSnapshot.forEach((item) => collected.set(item.id, { id: item.id, ...item.data() }));

    // Connection-only stories can be queried only after the app has a
    // connection-aware query and rules that permit it.
    state.stories = [...collected.values()];
    renderStories();
  } catch (error) {
    console.error("Story loading failed:", error);
    showToast(explainError(error), "error");
  }
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (state.busy) return;

  const email = $("#auth-email")?.value.trim();
  const password = $("#auth-password")?.value || "";
  const displayName = $("#auth-display-name")?.value.trim();
  const gender = $("#auth-gender")?.value || "other";

  if (!email || !password) {
    setMessage("#auth-message", "Email and password enter cheyyi.");
    return;
  }

  setBusy(true);
  setMessage("#auth-message", "");

  try {
    if (state.authMode === "signup") {
      if (!displayName) {
        setMessage("#auth-message", "Display name enter cheyyi.");
        return;
      }

      // Create the Authentication account first.
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = credential.user;
      await updateProfile(user, { displayName });

      const profile = {
        uid: user.uid,
        displayName,
        gender: ["male", "female", "other"].includes(gender) ? gender : "other",
        bio: "",
        interests: [],
        photoURL: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Only the signup handler writes the new profile.
      // The auth-state listener never creates a missing profile.
      await setDoc(doc(db, "users", user.uid), profile);

      state.user = user;
      state.profile = {
        uid: user.uid,
        displayName,
        gender: profile.gender,
        bio: "",
        interests: [],
        photoURL: ""
      };

      updateNavigation();
      applyExperience();
      closeDialog("#auth-dialog");
      showToast("Account created successfully!", "success");
      await fetchStories();
    } else {
      const credential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      state.user = credential.user;

      // Repairs a missing profile only during an explicit login flow.
      await loadProfile(credential.user, true);

      updateNavigation();
      closeDialog("#auth-dialog");
      showToast("Welcome back!", "success");
      await fetchStories();
    }
  } catch (error) {
    console.error("Authentication error:", error);
    setMessage("#auth-message", explainError(error));
  } finally {
    setBusy(false);
  }
}

async function handleForgotPassword() {
  const email = $("#auth-email")?.value.trim();

  if (!email) {
    setMessage("#auth-message", "Password reset kosam mundu email enter cheyyi.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    setMessage("#auth-message", "Password reset link email ki pampincham.", "success");
  } catch (error) {
    setMessage("#auth-message", explainError(error));
  }
}

function openStoryDialog() {
  if (!state.user) {
    openAuth("login");
    showToast("Story share cheyyadaniki login avvali.");
    return;
  }

  setMessage("#story-message", "");
  $("#story-form")?.reset();
  openDialog("#story-dialog");
}

async function handleStorySubmit(event) {
  event.preventDefault();
  if (!state.user || state.busy) return;

  const title = $("#story-title")?.value.trim() || "";
  const text = $("#story-text")?.value.trim() || "";
  const kind = $("#story-kind")?.value || "feeling";
  const mood = $("#story-mood")?.value || "";
  const visibility = $("#story-visibility")?.value || "public";
  const file = $("#story-media")?.files?.[0] || null;

  if (!title && !text && !file) {
    setMessage("#story-message", "Title, story text, or media lo edhaina add cheyyi.");
    return;
  }

  if (!["feeling", "memory", "music"].includes(kind)) {
    setMessage("#story-message", "Story type valid kaadu.");
    return;
  }

  if (!["public", "connections", "private"].includes(visibility)) {
    setMessage("#story-message", "Privacy setting valid kaadu.");
    return;
  }

  setBusy(true);
  setMessage("#story-message", "");

  try {
    let media = {
      url: "",
      publicId: "",
      resourceType: "",
      format: ""
    };

    if (file) {
      media = await uploadMedia(file);
    }

    const mediaType = media.resourceType === "video"
      ? "video"
      : media.resourceType === "audio"
        ? "audio"
        : media.url
          ? "image"
          : "";

    const story = {
      authorId: state.user.uid,
      authorName: state.profile?.displayName || state.user.displayName || "Member",
      title: title.slice(0, 200),
      text: text.slice(0, 5000),
      kind,
      mood: mood.slice(0, 100),
      visibility,
      mediaURL: media.url || "",
      mediaPublicId: media.publicId || "",
      mediaType,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    await addDoc(collection(db, "stories"), story);

    closeDialog("#story-dialog");
    showToast("Your story has been published!", "success");
    await fetchStories();
  } catch (error) {
    console.error("Story publish failed:", error);
    setMessage("#story-message", explainError(error));
  } finally {
    setBusy(false);
  }
}

async function deleteStory(storyId) {
  if (!state.user || !storyId) return;
  if (!window.confirm("Ee story delete cheyyala?")) return;

  try {
    const storyRef = doc(db, "stories", storyId);
    const snapshot = await getDoc(storyRef);

    if (!snapshot.exists()) {
      showToast("Story already deleted.");
      await fetchStories();
      return;
    }

    if (snapshot.data().authorId !== state.user.uid) {
      showToast("Nee own story matrame delete cheyyagalavu.", "error");
      return;
    }

    await deleteDoc(storyRef);
    showToast("Story deleted.", "success");
    await fetchStories();
  } catch (error) {
    console.error("Delete story failed:", error);
    showToast(explainError(error), "error");
  }
}

async function reportStory(storyId, authorId) {
  if (!state.user) {
    openAuth("login");
    return;
  }

  const reason = window.prompt("Report reason enter cheyyi (1–500 characters):");
  if (reason === null) return;

  const cleanedReason = reason.trim();
  if (!cleanedReason || cleanedReason.length > 500) {
    showToast("Reason 1–500 characters undali.", "error");
    return;
  }

  try {
    await addDoc(collection(db, "reports"), {
      reporterId: state.user.uid,
      storyId,
      reportedUserId: authorId || "",
      reason: cleanedReason,
      status: "pending",
      createdAt: serverTimestamp()
    });

    showToast("Report submitted. Thank you.", "success");
  } catch (error) {
    console.error("Report failed:", error);
    showToast(explainError(error), "error");
  }
}

async function loadRequests() {
  if (!state.user) return { incoming: [], outgoing: [] };

  const requests = collection(db, "connectionRequests");

  const [incomingSnapshot, outgoingSnapshot] = await Promise.all([
    getDocs(query(requests, where("to", "==", state.user.uid), limit(100))),
    getDocs(query(requests, where("from", "==", state.user.uid), limit(100)))
  ]);

  return {
    incoming: incomingSnapshot.docs.map((item) => ({ id: item.id, ...item.data() })),
    outgoing: outgoingSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
  };
}

async function loadConnectionsContent() {
  const container = $("#connections-content");
  if (!container) return;

  if (!state.user) {
    container.innerHTML = `<p>Please login to view connections.</p>`;
    return;
  }

  container.innerHTML = `<p>Loading...</p>`;

  try {
    const { incoming, outgoing } = await loadRequests();

    if (state.connectionTab === "requests") {
      const pending = incoming.filter((request) => request.status === "pending");

      container.innerHTML = pending.length
        ? pending.map((request) => `
          <article class="connection-row">
            <p>Connection request from <strong>${escapeHTML(request.from)}</strong></p>
            <button type="button" data-action="respond-request" data-id="${escapeHTML(request.id)}" data-status="accepted">Accept</button>
            <button type="button" data-action="respond-request" data-id="${escapeHTML(request.id)}" data-status="rejected">Decline</button>
          </article>
        `).join("")
        : `<div class="empty-state"><p>No pending requests.</p></div>`;
      return;
    }

    if (state.connectionTab === "connections") {
      container.innerHTML = `
        <div class="empty-state">
          <p>Accepted connections will appear here once connection-pair creation is implemented securely.</p>
        </div>`;
      return;
    }

    const usersSnapshot = await getDocs(query(collection(db, "users"), limit(50)));
    const outgoingPending = new Set(
      outgoing.filter((request) => request.status === "pending").map((request) => request.to)
    );

    const users = usersSnapshot.docs
      .map((item) => ({ uid: item.id, ...item.data() }))
      .filter((person) => person.uid !== state.user.uid);

    container.innerHTML = users.length
      ? users.map((person) => `
        <article class="connection-row">
          <div>
            <strong>${escapeHTML(person.displayName || "Member")}</strong>
            <p>${escapeHTML(person.bio || "A member of BE ONLY ONE")}</p>
          </div>
          ${
            outgoingPending.has(person.uid)
              ? `<span>Request pending</span>`
              : `<button type="button" data-action="send-request" data-id="${escapeHTML(person.uid)}">Connect</button>`
          }
        </article>
      `).join("")
      : `<div class="empty-state"><p>No members to discover yet.</p></div>`;
  } catch (error) {
    console.error("Connections loading failed:", error);
    container.innerHTML = `<p>${escapeHTML(explainError(error))}</p>`;
  }
}

async function sendConnectionRequest(toUid) {
  if (!state.user) {
    openAuth("login");
    return;
  }

  if (!toUid || toUid === state.user.uid) return;

  try {
    const existing = await getDocs(query(
      collection(db, "connectionRequests"),
      where("from", "==", state.user.uid),
      where("to", "==", toUid),
      limit(1)
    ));

    if (!existing.empty) {
      showToast("You already sent a request.");
      return;
    }

    await addDoc(collection(db, "connectionRequests"), {
      from: state.user.uid,
      to: toUid,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showToast("Connection request sent!", "success");
    await loadConnectionsContent();
  } catch (error) {
    console.error("Send request failed:", error);
    showToast(explainError(error), "error");
  }
}

async function respondToRequest(requestId, status) {
  if (!state.user || !requestId || !["accepted", "rejected"].includes(status)) return;

  try {
    const requestRef = doc(db, "connectionRequests", requestId);
    const snapshot = await getDoc(requestRef);

    if (!snapshot.exists()) {
      showToast("Request not found.", "error");
      return;
    }

    const requestData = snapshot.data();
    if (requestData.to !== state.user.uid || requestData.status !== "pending") {
      showToast("You cannot update this request.", "error");
      return;
    }

    await updateDoc(requestRef, {
      status,
      updatedAt: serverTimestamp()
    });

    if (status === "accepted") {
      showToast(
        "Request accepted. Secure connection-pair creation still needs a trusted backend.",
        "info"
      );
    } else {
      showToast("Request declined.", "success");
    }

    await loadConnectionsContent();
  } catch (error) {
    console.error("Respond to request failed:", error);
    showToast(explainError(error), "error");
  }
}

async function openProfile() {
  const content = $("#profile-content");
  if (!content) return;

  if (!state.user) {
    openAuth("login");
    return;
  }

  const profile = state.profile || fallbackProfile(state.user);

  content.innerHTML = `
    <div class="profile-view">
      <h3>${escapeHTML(profile.displayName || "Member")}</h3>
      <p>${escapeHTML(profile.bio || "Add a bio to tell your story.")}</p>
      <p><strong>Gender:</strong> ${escapeHTML(profile.gender || "other")}</p>
      <p><strong>Email:</strong> ${escapeHTML(state.user.email || "")}</p>
      <button type="button" data-action="edit-profile">Edit profile</button>
    </div>
  `;

  openDialog("#profile-dialog");
}

async function editProfile() {
  if (!state.user) return;

  const currentName = state.profile?.displayName || state.user.displayName || "";
  const currentBio = state.profile?.bio || "";

  const displayName = window.prompt("Display name:", currentName);
  if (displayName === null) return;

  const bio = window.prompt("Bio:", currentBio);
  if (bio === null) return;

  const cleanedName = displayName.trim();
  const cleanedBio = bio.trim();

  if (!cleanedName) {
    showToast("Display name cannot be empty.", "error");
    return;
  }

  try {
    await updateProfile(state.user, { displayName: cleanedName });

    await updateDoc(doc(db, "users", state.user.uid), {
      displayName: cleanedName,
      bio: cleanedBio,
      updatedAt: serverTimestamp()
    });

    state.profile = {
      ...state.profile,
      displayName: cleanedName,
      bio: cleanedBio
    };

    updateNavigation();
    applyExperience();
    await openProfile();
    showToast("Profile updated.", "success");
  } catch (error) {
    console.error("Profile update failed:", error);
    showToast(explainError(error), "error");
  }
}

async function openSettings() {
  const content = $("#settings-content");
  if (!content) return;

  if (!state.user) {
    openAuth("login");
    return;
  }

  content.innerHTML = `
    <section class="settings-section">
      <h3>Account</h3>
      <p>${escapeHTML(state.user.email || "")}</p>
      <p>Your stories can be public, connections-only, or private.</p>
      <button type="button" data-action="logout">Log out</button>
    </section>
  `;

  openDialog("#settings-dialog");
}

function setConnectionTab(tab) {
  state.connectionTab = ["connections", "requests", "discover"].includes(tab)
    ? tab
    : "discover";

  $$("[data-connection-tab]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.connectionTab === state.connectionTab
    );
  });

  loadConnectionsContent();
}

function openConnections(tab = "discover") {
  if (!state.user) {
    openAuth("login");
    return;
  }

  setConnectionTab(tab);
  openDialog("#connections-dialog");
}

function openFeature(title, description) {
  const titleNode = $("#feature-dialog-title");
  const descriptionNode = $("#feature-dialog-description");

  if (titleNode) titleNode.textContent = title || "Coming soon";
  if (descriptionNode) {
    descriptionNode.textContent = description ||
      "This feature will be available in a future release.";
  }

  openDialog("#feature-dialog");
}

async function logout() {
  try {
    await signOut(auth);
    closeAllDialogs();
    showToast("Logged out.", "success");
  } catch (error) {
    console.error("Logout failed:", error);
    showToast(explainError(error), "error");
  }
}

function bindEvents() {
  $("#auth-form")?.addEventListener("submit", handleAuthSubmit);
  $("#story-form")?.addEventListener("submit", handleStorySubmit);

  $("#auth-mode-toggle")?.addEventListener("click", () => {
    setAuthMode(state.authMode === "signup" ? "login" : "signup");
  });

  $$('[data-action="forgot-password"]').forEach((button) => {
    button.addEventListener("click", handleForgotPassword);
  });

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const action = button.dataset.action;
    const id = button.dataset.id;

    try {
      switch (action) {
        case "get-started":
          openStoryDialog();
          break;
        case "open-auth":
          openAuth(button.dataset.mode || "login");
          break;
        case "open-profile":
          await openProfile();
          break;
        case "edit-profile":
          await editProfile();
          break;
        case "view-connections":
          openConnections("discover");
          break;
        case "open-settings":
          await openSettings();
          break;
        case "logout":
          await logout();
          break;
        case "close-dialog":
          closeDialog(button.dataset.dialog || `#${button.closest("dialog")?.id}`);
          break;
        case "new-story":
          openStoryDialog();
          break;
        case "delete-story":
          await deleteStory(id);
          break;
        case "report-story":
          await reportStory(id, button.dataset.author);
          break;
        case "send-request":
          await sendConnectionRequest(id);
          break;
        case "respond-request":
          await respondToRequest(id, button.dataset.status);
          break;
        case "feature":
          openFeature(button.dataset.title, button.dataset.description);
          break;
        default:
          break;
      }
    } catch (error) {
      console.error(`Action "${action}" failed:`, error);
      showToast(explainError(error), "error");
    }
  });

  $$("[data-story-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.storyFilter = button.dataset.storyFilter || "public";

      $$("[data-story-filter]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });

      renderStories();
    });
  });

  $$("[data-connection-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      setConnectionTab(button.dataset.connectionTab);
    });
  });

  $("#menu-toggle")?.addEventListener("click", () => {
    $("#account-menu")?.classList.toggle("menu-open");
  });

  const year = $("#current-year");
  if (year) year.textContent = String(new Date().getFullYear());
}

function init() {
  bindEvents();
  setAuthMode("login");
  updateNavigation();

  onAuthStateChanged(auth, async (user) => {
    state.user = user;

    if (!user) {
      state.profile = null;
      state.stories = [];
      updateNavigation();
      renderStories();
      return;
    }

    try {
      // IMPORTANT: no profile creation here. Signup/login handlers own writes.
      await loadProfile(user, false);
      await fetchStories();
    } catch (error) {
      console.error("Loading signed-in profile failed:", error);
      showToast(explainError(error), "error");
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init, { once: true });
} else {
  init();
    }
