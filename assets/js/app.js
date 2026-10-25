
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
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const state = {
  user: null,
  profile: null,
  authMode: "login",
  storyFilter: "public",
  connectionTab: "discover",
  feature: "",
  stories: [],
  connections: [],
  connectionRequests: [],
  busy: false
};

const KING_QUOTES = [
  "A king is not defined by his crown, but by the world he builds.",
  "Your story is your kingdom. Write it with courage.",
  "Stand tall. Your identity belongs to you.",
  "A true king creates his own path."
];

const QUEEN_QUOTES = [
  "A queen knows her worth even without a crown.",
  "Your story is your power. Let the world see your light.",
  "Rule your world with courage, kindness and confidence.",
  "Your identity is your greatest treasure."
];

const LEGEND_QUOTES = [
  "You don't need a crown to create your own world.",
  "Your soul. Your story. Your identity.",
  "Be the original. The world has enough copies.",
  "Your journey is yours to define."
];

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function showToast(message, type = "info") {
  const region = $("#toast-region");
  if (!region) {
    console.log(message);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "status");
  toast.textContent = message;
  region.append(toast);

  window.setTimeout(() => toast.remove(), 4500);
}

function setBusy(button, busy, busyText = "Please wait...") {
  if (!button) return;

  if (busy) {
    button.dataset.originalText = button.textContent;
    button.textContent = busyText;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    button.removeAttribute("aria-busy");
  }
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  if (!dialog) return;

  if (typeof dialog.showModal === "function") {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute("open", "");
  }
}

function closeDialog(dialog) {
  if (!dialog) return;

  if (typeof dialog.close === "function" && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute("open");
  }
}

function showAuthMessage(message, isError = true) {
  const target = $("#auth-message");
  if (!target) return;

  target.textContent = message;
  target.dataset.state = isError ? "error" : "success";
}

function getExperience(profile = state.profile) {
  if (profile?.gender === "male") {
    return {
      title: "Welcome, King",
      quote: randomItem(KING_QUOTES),
      label: "KING"
    };
  }

  if (profile?.gender === "female") {
    return {
      title: "Welcome, Queen",
      quote: randomItem(QUEEN_QUOTES),
      label: "QUEEN"
    };
  }

  return {
    title: "Welcome to Your World",
    quote: randomItem(LEGEND_QUOTES),
    label: "YOUR OWN WORLD"
  };
}

function applyExperience() {
  const experience = getExperience();

  document.documentElement.dataset.experience =
    state.profile?.gender === "male" ? "king" :
    state.profile?.gender === "female" ? "queen" : "legend";

  const heroTitle = $("#hero-title");
  const heroQuote = $("#hero-quote");

  if (heroTitle && state.user) {
    heroTitle.textContent = experience.title;
  }

  if (heroQuote && state.user) {
    heroQuote.textContent = experience.quote;
  }
}

function setAuthMode(mode) {
  state.authMode = mode === "signup" ? "signup" : "login";

  const nameField = $("#auth-display-name");
  const genderField = $("#auth-gender");
  const submit = $("#auth-submit");
  const toggle = $("#auth-mode-toggle");

  const signup = state.authMode === "signup";

  if (nameField) {
    nameField.closest(".form-field")?.classList.toggle("is-hidden", !signup);
    nameField.required = signup;
  }

  if (genderField) {
    genderField.closest(".form-field")?.classList.toggle("is-hidden", !signup);
  }

  if (submit) {
    submit.textContent = signup ? "Create my world" : "Enter my world";
  }

  if (toggle) {
    toggle.textContent = signup
      ? "Already have an account? Log in"
      : "New here? Create your identity";
  }

  showAuthMessage("");
}

function updateNavigation() {
  const loginButton = $("#login-button");
  const signupButton = $("#signup-button");
  const accountMenu = $("#account-menu");

  if (loginButton) loginButton.hidden = !!state.user;
  if (signupButton) signupButton.hidden = !!state.user;
  if (accountMenu) accountMenu.hidden = !state.user;

  const nameTarget = $("#account-name");
  if (nameTarget) {
    nameTarget.textContent =
      state.profile?.displayName || state.user?.displayName || "My account";
  }

  const avatar = $("#account-avatar");
  if (avatar) {
    avatar.textContent = (
      state.profile?.displayName ||
      state.user?.displayName ||
      "U"
    ).trim().charAt(0).toUpperCase();
  }
}

async function loadProfile(user) {
  const profileRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(profileRef);

  if (snapshot.exists()) {
    state.profile = snapshot.data();
  } else {
    state.profile = {
      uid: user.uid,
      displayName: user.displayName || user.email?.split("@")[0] || "New member",
      email: user.email || "",
      gender: "other",
      bio: "",
      interests: [],
      photoURL: user.photoURL || "",
      createdAt: serverTimestamp()
    };

    await setDoc(profileRef, state.profile);
  }

  updateNavigation();
  applyExperience();
}

async function ensureSignedIn() {
  if (state.user) return true;

  showToast("Create an account or log in to continue.");
  openAuth("login");
  return false;
}

function openAuth(mode = "login") {
  setAuthMode(mode);
  openDialog("auth-dialog");
}

async function handleAuthSubmit(event) {
  event.preventDefault();

  const form = $("#auth-form");
  const button = $("#auth-submit");
  if (!form || state.busy) return;

  const email = $("#auth-email")?.value.trim();
  const password = $("#auth-password")?.value;
  const displayName = $("#auth-display-name")?.value.trim();
  const gender = $("#auth-gender")?.value || "other";

  if (!email || !password) {
    showAuthMessage("Enter your email and password.");
    return;
  }

  if (state.authMode === "signup" && !displayName) {
    showAuthMessage("Choose the name you want people to see.");
    return;
  }

  state.busy = true;
  setBusy(button, true, "Opening your world...");

  try {
    if (state.authMode === "signup") {
      if (password.length < 8) {
        throw new Error("Use a password with at least 8 characters.");
      }

      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await updateProfile(credential.user, { displayName });

      const profile = {
        uid: credential.user.uid,
        displayName,
        email,
        gender,
        bio: "",
        interests: [],
        photoURL: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, "users", credential.user.uid), profile);
      state.profile = profile;

      closeDialog($("#auth-dialog"));
      updateNavigation();
      applyExperience();

      const experience = getExperience(profile);
      showToast(`${experience.title}! ${experience.quote}`, "success");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      closeDialog($("#auth-dialog"));
      showToast("Welcome back. Your world is waiting.", "success");
    }
  } catch (error) {
    const messages = {
      "auth/email-already-in-use": "This email already has an account. Try logging in.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/weak-password": "Choose a stronger password.",
      "auth/network-request-failed": "Network error. Check your internet connection.",
      "permission-denied": "Firebase denied this action. Check your Firestore security rules."
    };

    showAuthMessage(messages[error.code] || error.message || "Could not complete authentication.");
  } finally {
    state.busy = false;
    setBusy(button, false);
  }
}

async function handlePasswordReset() {
  const email = $("#auth-email")?.value.trim();

  if (!email) {
    showAuthMessage("Enter your email first, then choose password reset.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showAuthMessage("If the account exists, a password reset email has been sent.", false);
  } catch (error) {
    showAuthMessage(error.message || "Could not send the reset email.");
  }
}

function renderProfile() {
  const target = $("#profile-content");
  if (!target || !state.user) return;

  const profile = state.profile || {};
  const name = profile.displayName || state.user.displayName || "";
  const interests = Array.isArray(profile.interests)
    ? profile.interests.join(", ")
    : "";

  target.innerHTML = `
    <form id="edit-profile-form" class="profile-edit-form">
      <label class="form-field">
        <span>Display name</span>
        <input name="displayName" maxlength="60" required value="${escapeHTML(name)}">
      </label>

      <label class="form-field">
        <span>About me</span>
        <textarea name="bio" rows="3" maxlength="500">${escapeHTML(profile.bio || "")}</textarea>
      </label>

      <label class="form-field">
        <span>Interests (separate with commas)</span>
        <input name="interests" maxlength="300" value="${escapeHTML(interests)}">
      </label>

      <label class="form-field">
        <span>Profile photo</span>
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp">
      </label>

      <p class="muted">Your selected King, Queen or neutral experience only changes the visual theme and welcome quotes.</p>

      <button class="button button-primary" type="submit">Save profile</button>
      <p id="profile-message" role="status"></p>
    </form>
  `;

  $("#edit-profile-form")?.addEventListener("submit", saveProfile);
}

async function saveProfile(event) {
  event.preventDefault();

  if (!await ensureSignedIn()) return;

  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  const data = new FormData(form);
  const displayName = String(data.get("displayName") || "").trim();
  const bio = String(data.get("bio") || "").trim();
  const interests = String(data.get("interests") || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 20);

  if (!displayName) {
    showToast("Display name is required.");
    return;
  }

  setBusy(button, true, "Saving...");

  try {
    let photoURL = state.profile?.photoURL || "";

    const photo = data.get("photo");
    if (photo instanceof File && photo.size > 0) {
      const uploaded = await uploadMedia(photo);
      photoURL = uploaded.url;
    }

    await updateProfile(state.user, {
      displayName,
      photoURL: photoURL || null
    });

    await updateDoc(doc(db, "users", state.user.uid), {
      displayName,
      bio,
      interests,
      photoURL,
      updatedAt: serverTimestamp()
    });

    state.profile = {
      ...state.profile,
      displayName,
      bio,
      interests,
      photoURL
    };

    updateNavigation();
    applyExperience();
    showToast("Your identity has been updated.", "success");
    renderProfile();
  } catch (error) {
    showToast(error.message || "Could not save your profile.", "error");
  } finally {
    setBusy(button, false);
  }
}

function openProfile() {
  if (!state.user) {
    openAuth("login");
    return;
  }

  renderProfile();
  openDialog("profile-dialog");
}

function mediaMarkup(story) {
  if (!story.mediaURL) return "";

  const url = escapeHTML(story.mediaURL);
  const type = story.mediaType || "";

  if (type.startsWith("image/")) {
    return `<img class="story-media" src="${url}" alt="Story image" loading="lazy">`;
  }

  if (type.startsWith("video/")) {
    return `<video class="story-media" src="${url}" controls playsinline preload="metadata"></video>`;
  }

  if (type.startsWith("audio/")) {
    return `<audio class="story-audio" src="${url}" controls preload="none"></audio>`;
  }

  return "";
}

function formatDate(timestamp) {
  if (!timestamp) return "Just now";

  const date = typeof timestamp.toDate === "function"
    ? timestamp.toDate()
    : new Date(timestamp);

  if (Number.isNaN(date.getTime())) return "Recently";

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function storyCard(story) {
  const author = escapeHTML(story.authorName || "A member");
  const title = escapeHTML(story.title || "A moment from my world");
  const text = escapeHTML(story.text || "");
  const mood = escapeHTML(story.mood || "");
  const visibility = escapeHTML(story.visibility || "public");

  return `
    <article class="story-card" data-story-id="${escapeHTML(story.id)}">
      <header class="story-card-header">
        <div class="story-avatar">${escapeHTML(author.charAt(0).toUpperCase())}</div>
        <div>
          <strong>${author}</strong>
          <p class="muted">${escapeHTML(formatDate(story.createdAt))}</p>
        </div>
        <span class="story-visibility">${visibility}</span>
      </header>

      <h3>${title}</h3>
      ${mood ? `<p class="story-mood">${mood}</p>` : ""}
      ${text ? `<p class="story-text">${text}</p>` : ""}
      ${mediaMarkup(story)}

      <footer class="story-card-footer">
        <span>${escapeHTML(story.kind || "memory")}</span>
        ${story.authorId === state.user?.uid
          ? `<button class="text-button" type="button" data-delete-story="${escapeHTML(story.id)}">Delete</button>`
          : `<button class="text-button" type="button" data-report-story="${escapeHTML(story.id)}" data-author-id="${escapeHTML(story.authorId || "")}">Report</button>`
        }
      </footer>
    </article>
  `;
}

async function getAcceptedConnectionIds() {
  if (!state.user) return [];

  const [sent, received] = await Promise.all([
    getDocs(query(
      collection(db, "connectionRequests"),
      where("from", "==", state.user.uid),
      where("status", "==", "accepted"),
      limit(100)
    )),
    getDocs(query(
      collection(db, "connectionRequests"),
      where("to", "==", state.user.uid),
      where("status", "==", "accepted"),
      limit(100)
    ))
  ]);

  return [...new Set([
    ...sent.docs.map(item => item.data().to),
    ...received.docs.map(item => item.data().from)
  ].filter(Boolean))];
}

async function fetchStories() {
  if (!state.user) return [];

  const ownQuery = query(
    collection(db, "stories"),
    where("authorId", "==", state.user.uid),
    limit(100)
  );

  const publicQuery = query(
    collection(db, "stories"),
    where("visibility", "==", "public"),
    limit(100)
  );

  const [ownSnapshot, publicSnapshot] = await Promise.all([
    getDocs(ownQuery),
    getDocs(publicQuery)
  ]);

  const storyMap = new Map();

  for (const item of [...ownSnapshot.docs, ...publicSnapshot.docs]) {
    storyMap.set(item.id, { id: item.id, ...item.data() });
  }

  if (state.storyFilter === "connections") {
    const connectionIds = await getAcceptedConnectionIds();

    for (let index = 0; index < connectionIds.length; index += 10) {
      const batch = connectionIds.slice(index, index + 10);

      if (!batch.length) continue;

      const connectionStories = await getDocs(query(
        collection(db, "stories"),
        where("authorId", "in", batch),
        where("visibility", "==", "connections"),
        limit(100)
      ));

      for (const item of connectionStories.docs) {
        storyMap.set(item.id, { id: item.id, ...item.data() });
      }
    }
  }

  let stories = [...storyMap.values()];

  if (state.storyFilter === "mine") {
    stories = stories.filter(item => item.authorId === state.user.uid);
  } else if (state.storyFilter === "connections") {
    const allowed = new Set([state.user.uid, ...await getAcceptedConnectionIds()]);
    stories = stories.filter(item =>
      item.authorId === state.user.uid ||
      (allowed.has(item.authorId) &&
       (item.visibility === "connections" || item.visibility === "public"))
    );
  } else {
    stories = stories.filter(item =>
      item.visibility === "public" || item.authorId === state.user.uid
    );
  }

  stories.sort((a, b) => {
    const dateA = a.createdAt?.toMillis?.() || 0;
    const dateB = b.createdAt?.toMillis?.() || 0;
    return dateB - dateA;
  });

  return stories;
}

async function renderStories() {
  const feed = $("#stories-feed");
  if (!feed) return;

  if (!state.user) {
    feed.innerHTML = `
      <div class="empty-state">
        <p>Log in to explore stories and create your own memories.</p>
        <button class="button button-primary" data-action="get-started" type="button">Enter your world</button>
      </div>
    `;
    return;
  }

  feed.innerHTML = `<p class="muted">Loading stories...</p>`;

  try {
    state.stories = await fetchStories();

    if (!state.stories.length) {
      feed.innerHTML = `
        <div class="empty-state">
          <h3>Your story begins here</h3>
          <p>No stories to show yet. Create a feeling, memory or music post.</p>
          <button class="button button-primary" data-action="create-memory" type="button">Create your first story</button>
        </div>
      `;
      return;
    }

    feed.innerHTML = state.stories.map(storyCard).join("");
  } catch (error) {
    console.error("Story loading error:", error);
    feed.innerHTML = `
      <div class="empty-state">
        <p>Stories could not be loaded. Check your Firestore rules and connection.</p>
        <button class="button button-secondary" data-action="refresh-stories" type="button">Try again</button>
      </div>
    `;
  }
}

function openStory(kind = "memory") {
  if (!state.user) {
    openAuth("login");
    return;
  }

  const kindSelect = $("#story-kind");
  if (kindSelect) kindSelect.value = kind;

  const message = $("#story-message");
  if (message) message.textContent = "";

  openDialog("story-dialog");
}

async function handleStorySubmit(event) {
  event.preventDefault();

  if (!await ensureSignedIn()) return;

  const form = $("#story-form");
  const button = $("#publish-story-button");
  if (!form || state.busy) return;

  const title = $("#story-title")?.value.trim() || "";
  const text = $("#story-text")?.value.trim() || "";
  const kind = $("#story-kind")?.value || "memory";
  const mood = $("#story-mood")?.value || "";
  const visibility = $("#story-visibility")?.value || "public";
  const file = $("#story-media")?.files?.[0] || null;

  if (!title && !text && !file) {
    showToast("Add a title, a message or a media file.");
    return;
  }

  state.busy = true;
  setBusy(button, true, "Publishing...");

  try {
    let media = null;

    if (file) {
      media = await uploadMedia(file);
    }

    await addDoc(collection(db, "stories"), {
      authorId: state.user.uid,
      authorName: state.profile?.displayName || state.user.displayName || "Member",
      title: title || (kind === "feeling" ? "A feeling from today" : "A moment from my world"),
      text,
      kind,
      mood,
      visibility,
      mediaURL: media?.url || "",
      mediaPublicId: media?.publicId || "",
      mediaType: file?.type || "",
      mediaResourceType: media?.resourceType || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    form.reset();
    closeDialog($("#story-dialog"));
    showToast("Your story has been published.", "success");
    await renderStories();
  } catch (error) {
    console.error("Story publishing error:", error);
    const message = $("#story-message");
    if (message) {
      message.textContent = error.message || "Could not publish your story.";
    }
  } finally {
    state.busy = false;
    setBusy(button, false);
  }
}

async function deleteStory(storyId) {
  const story = state.stories.find(item => item.id === storyId);
  if (!story || story.authorId !== state.user?.uid) {
    showToast("You can only delete your own stories.");
    return;
  }

  if (!window.confirm("Delete this story permanently?")) return;

  try {
    await deleteDoc(doc(db, "stories", storyId));
    showToast("Story deleted.");
    await renderStories();
  } catch (error) {
    showToast(error.message || "Could not delete this story.", "error");
  }
}

async function reportStory(storyId, authorId) {
  if (!await ensureSignedIn()) return;

  const reason = window.prompt(
    "Why are you reporting this story? (spam, harassment, unsafe content, other)"
  );

  if (!reason?.trim()) return;

  try {
    await addDoc(collection(db, "reports"), {
      reporterId: state.user.uid,
      storyId,
      reportedUserId: authorId,
      reason: reason.trim().slice(0, 500),
      status: "pending",
      createdAt: serverTimestamp()
    });

    showToast("Report submitted for review.", "success");
  } catch (error) {
    showToast(error.message || "Could not submit report.", "error");
  }
}

async function loadConnections() {
  if (!state.user) return;

  const [sent, received] = await Promise.all([
    getDocs(query(
      collection(db, "connectionRequests"),
      where("from", "==", state.user.uid),
      limit(100)
    )),
    getDocs(query(
      collection(db, "connectionRequests"),
      where("to", "==", state.user.uid),
      limit(100)
    ))
  ]);

  state.connectionRequests = [
    ...sent.docs.map(item => ({ id: item.id, ...item.data() })),
    ...received.docs.map(item => ({ id: item.id, ...item.data() }))
  ];

  const ids = await getAcceptedConnectionIds();
  const profiles = await Promise.all(ids.map(async uid => {
    const snapshot = await getDoc(doc(db, "users", uid));
    return snapshot.exists() ? { uid, ...snapshot.data() } : null;
  }));

  state.connections = profiles.filter(Boolean);
}

function renderConnectionTabs() {
  $$("[data-connection-tab]").forEach(button => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.connectionTab === state.connectionTab)
    );
  });
}

async function renderConnections() {
  const target = $("#connections-content");
  if (!target) return;

  if (!state.user) {
    target.innerHTML = `<p>Log in to manage your connections.</p>`;
    return;
  }

  target.innerHTML = `<p class="muted">Loading community...</p>`;

  try {
    await loadConnections();

    if (state.connectionTab === "connections") {
      target.innerHTML = state.connections.length
        ? state.connections.map(person => `
            <article class="connection-card">
              <strong>${escapeHTML(person.displayName || "Member")}</strong>
              <p>${escapeHTML(person.bio || "Building their own world.")}</p>
              <button type="button" class="button button-secondary" data-open-member="${escapeHTML(person.uid)}">View profile</button>
            </article>
          `).join("")
        : `<p>No connections yet. Discover people to get started.</p>`;
      return;
    }

    if (state.connectionTab === "requests") {
      const incoming = state.connectionRequests.filter(item =>
        item.to === state.user.uid && item.status === "pending"
      );

      if (!incoming.length) {
        target.innerHTML = `<p>No pending connection requests.</p>`;
        return;
      }

      const requestProfiles = await Promise.all(incoming.map(async request => {
        const profile = await getDoc(doc(db, "users", request.from));
        return { request, profile: profile.exists() ? profile.data() : {} };
      }));

      target.innerHTML = requestProfiles.map(({ request, profile }) => `
        <article class="connection-card">
          <strong>${escapeHTML(profile.displayName || "Member")}</strong>
          <p>${escapeHTML(profile.bio || "Would like to connect with you.")}</p>
          <button class="button button-primary" type="button" data-accept-request="${escapeHTML(request.id)}">Accept</button>
          <button class="button button-secondary" type="button" data-reject-request="${escapeHTML(request.id)}">Decline</button>
        </article>
      `).join("");
      return;
    }

    const usersSnapshot = await getDocs(query(collection(db, "users"), limit(40)));
    const sentPending = state.connectionRequests
      .filter(item => item.from === state.user.uid && item.status === "pending")
      .map(item => item.to);

    const alreadyConnected = new Set(state.connections.map(person => person.uid));

    const candidates = usersSnapshot.docs
      .map(item => ({ uid: item.id, ...item.data() }))
      .filter(person =>
        person.uid !== state.user.uid &&
        !alreadyConnected.has(person.uid) &&
        !sentPending.includes(person.uid)
      );

    target.innerHTML = candidates.length
      ? candidates.map(person => `
          <article class="connection-card">
            <strong>${escapeHTML(person.displayName || "Member")}</strong>
            <p>${escapeHTML(person.bio || "Discover their story.")}</p>
            <button class="button button-primary" type="button" data-send-request="${escapeHTML(person.uid)}">Connect</button>
          </article>
        `).join("")
      : `<p>No new profiles found right now.</p>`;
  } catch (error) {
    console.error("Connections loading error:", error);
    target.innerHTML = `<p>Could not load connections. Check Firestore rules.</p>`;
  }

  renderConnectionTabs();
}

async function sendConnectionRequest(targetUid) {
  if (!await ensureSignedIn()) return;
  if (targetUid === state.user.uid) return;

  const existing = state.connectionRequests.find(item =>
    (item.from === state.user.uid && item.to === targetUid) ||
    (item.from === targetUid && item.to === state.user.uid)
  );

  if (existing) {
    showToast("A request already exists between these accounts.");
    return;
  }

  try {
    await addDoc(collection(db, "connectionRequests"), {
      from: state.user.uid,
      to: targetUid,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showToast("Connection request sent.", "success");
    await renderConnections();
  } catch (error) {
    showToast(error.message || "Could not send the request.", "error");
  }
}

async function respondToRequest(requestId, accepted) {
  const request = state.connectionRequests.find(item => item.id === requestId);

  if (!request || request.to !== state.user?.uid || request.status !== "pending") {
    showToast("This request is no longer available.");
    return;
  }

  try {
    await updateDoc(doc(db, "connectionRequests", requestId), {
      status: accepted ? "accepted" : "rejected",
      updatedAt: serverTimestamp()
    });

    showToast(accepted ? "You are now connected." : "Request declined.");
    await renderConnections();
  } catch (error) {
    showToast(error.message || "Could not update this request.", "error");
  }
}

async function openMemberProfile(uid) {
  const person = state.connections.find(item => item.uid === uid);
  if (!person) return;

  const target = $("#feature-dialog-content");
  if (target) {
    target.innerHTML = `
      <article class="member-profile">
        <h3>${escapeHTML(person.displayName || "Member")}</h3>
        <p>${escapeHTML(person.bio || "This member hasn't added a bio yet.")}</p>
        <p><strong>Interests:</strong> ${escapeHTML(
          Array.isArray(person.interests) ? person.interests.join(", ") : ""
        )}</p>
      </article>
    `;
  }

  $("#feature-dialog-eyebrow").textContent = "COMMUNITY";
  $("#feature-dialog-title").textContent = "A member of your world";
  $("#feature-dialog-description").textContent = "Get to know your connection.";
  openDialog("feature-dialog");
}

function openFeature(feature) {
  state.feature = feature;

  const content = $("#feature-dialog-content");
  const eyebrow = $("#feature-dialog-eyebrow");
  const title = $("#feature-dialog-title");
  const description = $("#feature-dialog-description");

  const copy = {
    feelings: {
      eyebrow: "FEEL",
      title: "Your feelings deserve a voice",
      description: "Share a feeling, choose who can see it, and express yourself in your own words.",
      action: "create-feeling"
    },
    music: {
      eyebrow: "CREATE",
      title: "Soundtrack your story",
      description: "Share an audio file with your story. Supported audio uploads depend on your Cloudinary preset.",
      action: "create-music"
    },
    identity: {
      eyebrow: "EXPRESS",
      title: "Build your identity",
      description: "Update your name, bio, interests and profile photo.",
      action: "open-profile"
    },
    community: {
      eyebrow: "CONNECT",
      title: "Find your people",
      description: "Send connection requests, respond to invitations and build your community.",
      action: "open-connections"
    }
  };

  const item = copy[feature] || copy.feelings;

  if (eyebrow) eyebrow.textContent = item.eyebrow;
  if (title) title.textContent = item.title;
  if (description) description.textContent = item.description;

  if (content) {
    content.innerHTML = `
      <button class="button button-primary" type="button" data-action="${item.action}">
        ${feature === "identity" ? "Edit my profile" :
          feature === "community" ? "Explore connections" :
          feature === "music" ? "Share music" : "Share a feeling"}
      </button>
    `;
  }

  openDialog("feature-dialog");
}

function openConnections() {
  if (!state.user) {
    openAuth("login");
    return;
  }

  state.connectionTab = "discover";
  renderConnectionTabs();
  renderConnections();
  openDialog("connections-dialog");
}

function setStoryFilter(filter) {
  state.storyFilter = ["public", "connections", "mine"].includes(filter)
    ? filter
    : "public";

  $$("[data-story-filter]").forEach(button => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.storyFilter === state.storyFilter)
    );
  });

  renderStories();
}

function closeMenus() {
  const menu = $("#account-menu");
  if (menu) menu.hidden = true;
}

function bindEvents() {
  $("#auth-form")?.addEventListener("submit", handleAuthSubmit);
  $("#story-form")?.addEventListener("submit", handleStorySubmit);

  $("#auth-mode-toggle")?.addEventListener("click", () => {
    setAuthMode(state.authMode === "login" ? "signup" : "login");
  });

  $$("[data-action='forgot-password']").forEach(button => {
    button.addEventListener("click", handlePasswordReset);
  });

  $("#login-button")?.addEventListener("click", () => openAuth("login"));
  $("#signup-button")?.addEventListener("click", () => openAuth("signup"));

  $("#menu-toggle")?.addEventListener("click", () => {
    const menu = $("#account-menu");
    if (menu) menu.hidden = !menu.hidden;
  });

  $$("[data-story-filter]").forEach(button => {
    button.addEventListener("click", () => setStoryFilter(button.dataset.storyFilter));
  });

  $$("[data-connection-tab]").forEach(button => {
    button.addEventListener("click", () => {
      state.connectionTab = button.dataset.connectionTab;
      renderConnectionTabs();
      renderConnections();
    });
  });

  document.addEventListener("click", async event => {
    const target = event.target.closest("[data-action], [data-delete-story], [data-report-story], [data-send-request], [data-accept-request], [data-reject-request], [data-open-member]");

    if (!target) {
      if (!event.target.closest("#account-menu, #menu-toggle")) closeMenus();
      return;
    }

    if (target.dataset.action) {
      const action = target.dataset.action;

      switch (action) {
        case "get-started":
          openAuth("signup");
          break;
        case "create-feeling":
          closeDialog($("#feature-dialog"));
          openStory("feeling");
          break;
        case "create-memory":
          closeDialog($("#feature-dialog"));
          openStory("memory");
          break;
        case "create-music":
          closeDialog($("#feature-dialog"));
          openStory("music");
          break;
        case "open-profile":
          closeDialog($("#feature-dialog"));
          openProfile();
          break;
        case "open-connections":
          closeDialog($("#feature-dialog"));
          openConnections();
          break;
        case "open-feature":
          openFeature(target.dataset.feature);
          break;
        case "load-more-stories":
        case "refresh-stories":
          await renderStories();
          break;
        case "logout":
          await signOut(auth);
          closeMenus();
          showToast("You have safely logged out.");
          break;
        case "close-dialog":
          closeDialog(target.closest("dialog"));
          break;
      }
    }

    if (target.dataset.deleteStory) {
      await deleteStory(target.dataset.deleteStory);
    }

    if (target.dataset.reportStory) {
      await reportStory(target.dataset.reportStory, target.dataset.authorId);
    }

    if (target.dataset.sendRequest) {
      await sendConnectionRequest(target.dataset.sendRequest);
    }

    if (target.dataset.acceptRequest) {
      await respondToRequest(target.dataset.acceptRequest, true);
    }

    if (target.dataset.rejectRequest) {
      await respondToRequest(target.dataset.rejectRequest, false);
    }

    if (target.dataset.openMember) {
      await openMemberProfile(target.dataset.openMember);
    }
  });

  $("#current-year") && ($("#current-year").textContent = String(new Date().getFullYear()));

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMenus();
  });
}

async function handleSignedIn(user) {
  state.user = user;

  try {
    await loadProfile(user);
    await renderStories();
  } catch (error) {
    console.error("Account initialization error:", error);
    showToast("Your account loaded, but some data could not be read. Check Firestore rules.", "error");
  }

  updateNavigation();
}

function handleSignedOut() {
  state.user = null;
  state.profile = null;
  state.stories = [];
  state.connections = [];
  state.connectionRequests = [];

  updateNavigation();
  applyExperience();
  renderStories();
}

function init() {
  bindEvents();
  setAuthMode("login");
  updateNavigation();

  onAuthStateChanged(auth, user => {
    if (user) {
      handleSignedIn(user);
    } else {
      handleSignedOut();
    }
  });
}

init();
