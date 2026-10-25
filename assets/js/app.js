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
  stories: [],
  requests: [],
  connections: [],
  busy: false
};

const quotes = {
  male: [
    "A king builds his kingdom through courage, not a crown.",
    "Your story is your kingdom. Write it boldly.",
    "Stand tall. Your identity belongs to you."
  ],
  female: [
    "A queen knows her worth, with or without a crown.",
    "Your story is your power. Let your light shine.",
    "Rule your world with courage and kindness."
  ],
  other: [
    "You don't need a crown to create your own world.",
    "Your soul. Your story. Your identity.",
    "Be original. Your journey is yours to define."
  ]
};

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

function showAuthMessage(message, isError = true) {
  const target = $("#auth-message");
  if (!target) return;

  target.hidden = false;
  target.textContent = message;
  target.dataset.state = isError ? "error" : "success";
}

function setBusy(button, value, text = "Please wait...") {
  if (!button) return;

  if (value) {
    button.dataset.originalText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
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

/* AUTH MODE: FIXES THE HIDDEN ATTRIBUTE BUG */
function setAuthMode(mode = "login") {
  state.authMode = mode === "signup" ? "signup" : "login";
  const signup = state.authMode === "signup";

  const name = $("#auth-display-name");
  const nameLabel = $("#display-name-label");
  const gender = $("#auth-gender");
  const genderLabel = $("#gender-label");
  const password = $("#auth-password");
  const submit = $("#auth-submit");
  const toggle = $("#auth-mode-toggle");
  const title = $("#auth-title");
  const description = $("#auth-description");
  const message = $("#auth-message");

  if (name) {
    name.hidden = !signup;
    name.required = signup;
  }

  if (nameLabel) nameLabel.hidden = !signup;
  if (gender) gender.hidden = !signup;
  if (genderLabel) genderLabel.hidden = !signup;

  if (password) {
    password.autocomplete = signup ? "new-password" : "current-password";
    password.minLength = signup ? 6 : 1;
    password.placeholder = signup
      ? "At least 6 characters"
      : "Enter your password";
  }

  if (submit) {
    submit.textContent = signup ? "Create my world" : "Enter my world";
  }

  if (toggle) {
    toggle.textContent = signup
      ? "Already have an account? Log in"
      : "New here? Create your identity";
  }

  if (title) {
    title.textContent = signup ? "Create your identity" : "Enter your world";
  }

  if (description) {
    description.textContent = signup
      ? "Choose your name and create your own world."
      : "Sign in to your BE ONLY ONE account.";
  }

  if (message) {
    message.hidden = true;
    message.textContent = "";
  }
}

function openAuth(mode = "login") {
  setAuthMode(mode);
  openDialog("auth-dialog");
}

function getQuote(gender) {
  return (quotes[gender] || quotes.other)[
    Math.floor(Math.random() * (quotes[gender] || quotes.other).length)
  ];
}

function applyExperience() {
  const gender = state.profile?.gender || "other";

  document.documentElement.dataset.experience =
    gender === "male" ? "king" :
    gender === "female" ? "queen" : "legend";

  const heroTitle = $("#hero-title");
  const heroQuote = $("#hero-quote");

  if (state.user && heroTitle) {
    heroTitle.textContent = gender === "male"
      ? "Welcome, King"
      : gender === "female"
        ? "Welcome, Queen"
        : "Welcome to Your World";
  }

  if (state.user && heroQuote) {
    heroQuote.textContent = getQuote(gender);
  }
}

function updateNavigation() {
  if ($("#login-button")) $("#login-button").hidden = !!state.user;
  if ($("#signup-button")) $("#signup-button").hidden = !!state.user;
  if ($("#account-menu")) $("#account-menu").hidden = !state.user;

  const name = state.profile?.displayName ||
    state.user?.displayName || "My account";

  if ($("#account-name")) $("#account-name").textContent = name;
  if ($("#account-avatar")) {
    $("#account-avatar").textContent = name.charAt(0).toUpperCase();
  }
}

async function loadProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snapshot = await getDoc(ref);

  if (snapshot.exists()) {
    state.profile = snapshot.data();
  } else {
    const profile = {
      uid: user.uid,
      displayName: user.displayName || user.email?.split("@")[0] || "Member",
      gender: "other",
      bio: "",
      interests: [],
      photoURL: "",
      createdAt: serverTimestamp()
    };

    await setDoc(ref, profile);
    state.profile = profile;
  }

  updateNavigation();
  applyExperience();
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  if (state.busy) return;

  const button = $("#auth-submit");
  const email = $("#auth-email")?.value.trim();
  const password = $("#auth-password")?.value || "";
  const displayName = $("#auth-display-name")?.value.trim();
  const genderValue = $("#auth-gender")?.value || "other";
  const gender = ["male", "female", "other"].includes(genderValue)
    ? genderValue
    : "other";

  if (!email || !password) {
    showAuthMessage("Enter your email and password.");
    return;
  }

  if (state.authMode === "signup" && !displayName) {
    showAuthMessage("Please enter your display name.");
    return;
  }

  if (state.authMode === "signup" && password.length < 6) {
    showAuthMessage("Your password must contain at least 6 characters.");
    return;
  }

  state.busy = true;
  setBusy(button, true, "Creating your world...");

  try {
    if (state.authMode === "signup") {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      await updateProfile(credential.user, { displayName });

      const profile = {
        uid: credential.user.uid,
        displayName,
        gender,
        bio: "",
        interests: [],
        photoURL: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, "users", credential.user.uid), profile);
      state.user = credential.user;
      state.profile = profile;

      updateNavigation();
      applyExperience();
      closeDialog($("#auth-dialog"));

      showToast(
        `${gender === "male" ? "Welcome, King" :
          gender === "female" ? "Welcome, Queen" :
          "Welcome to your own world"}! ${getQuote(gender)}`,
        "success"
      );

      await renderStories();
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      closeDialog($("#auth-dialog"));
      showToast("Welcome back to your world.", "success");
    }
  } catch (error) {
    console.error("Authentication error:", error);

    const messages = {
      "auth/email-already-in-use": "This email already has an account. Please log in.",
      "auth/invalid-email": "Please enter a valid email address.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/user-not-found": "No account found for this email.",
      "auth/wrong-password": "Incorrect password.",
      "auth/weak-password": "Choose a stronger password.",
      "auth/operation-not-allowed": "Email/Password sign-in is not enabled in Firebase Authentication.",
      "auth/network-request-failed": "Network error. Check your internet connection.",
      "permission-denied": "Firestore denied access. Check your security rules."
    };

    showAuthMessage(messages[error.code] || error.message || "Could not create your account.");
  } finally {
    state.busy = false;
    setBusy(button, false);
  }
}

async function resetPassword() {
  const email = $("#auth-email")?.value.trim();

  if (!email) {
    showAuthMessage("Enter your email address first.");
    return;
  }

  try {
    await sendPasswordResetEmail(auth, email);
    showAuthMessage(
      "If the account exists, a password reset email has been sent.",
      false
    );
  } catch (error) {
    showAuthMessage(error.message || "Could not send the reset email.");
  }
}

async function requireLogin() {
  if (state.user) return true;
  openAuth("login");
  showToast("Please log in to continue.");
  return false;
}

function openProfile() {
  if (!state.user) {
    openAuth("login");
    return;
  }

  const target = $("#profile-content");
  if (!target) return;

  const profile = state.profile || {};

  target.innerHTML = `
    <form id="profile-edit-form">
      <label class="form-field">
        Display name
        <input name="displayName" required maxlength="60"
          value="${escapeHTML(profile.displayName || "")}">
      </label>

      <label class="form-field">
        About me
        <textarea name="bio" rows="3" maxlength="500">${escapeHTML(profile.bio || "")}</textarea>
      </label>

      <label class="form-field">
        Interests (comma-separated)
        <input name="interests" maxlength="300"
          value="${escapeHTML((profile.interests || []).join(", "))}">
      </label>

      <label class="form-field">
        Profile photo
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp">
      </label>

      <button class="button button-gold button-full" type="submit">Save profile</button>
    </form>
  `;

  $("#profile-edit-form")?.addEventListener("submit", saveProfile);
  openDialog("profile-dialog");
}

async function saveProfile(event) {
  event.preventDefault();
  if (!state.user) return;

  const form = event.currentTarget;
  const button = $("button[type='submit']", form);
  const data = new FormData(form);
  const displayName = String(data.get("displayName") || "").trim();
  const bio = String(data.get("bio") || "").trim();
  const interests = String(data.get("interests") || "")
    .split(",").map(item => item.trim()).filter(Boolean).slice(0, 20);

  if (!displayName) return showToast("Display name is required.");

  setBusy(button, true, "Saving...");

  try {
    let photoURL = state.profile?.photoURL || "";
    const photo = data.get("photo");

    if (photo instanceof File && photo.size) {
      const result = await uploadMedia(photo);
      photoURL = result.url;
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

    state.profile = { ...state.profile, displayName, bio, interests, photoURL };
    updateNavigation();
    applyExperience();
    showToast("Your identity has been updated.", "success");
    openProfile();
  } catch (error) {
    showToast(error.message || "Could not save profile.", "error");
  } finally {
    setBusy(button, false);
  }
}

function openStory(kind = "memory") {
  if (!state.user) return openAuth("login");
  if ($("#story-kind")) $("#story-kind").value = kind;
  if ($("#story-message")) {
    $("#story-message").hidden = true;
    $("#story-message").textContent = "";
  }
  openDialog("story-dialog");
}

async function publishStory(event) {
  event.preventDefault();
  if (!state.user || state.busy) return;

  const button = $("#publish-story-button");
  const title = $("#story-title")?.value.trim() || "";
  const text = $("#story-text")?.value.trim() || "";
  const kind = $("#story-kind")?.value || "memory";
  const mood = $("#story-mood")?.value.trim() || "";
  const visibility = $("#story-visibility")?.value || "public";
  const file = $("#story-media")?.files?.[0] || null;

  if (!title && !text && !file) {
    showToast("Add a title, message or media file.");
    return;
  }

  state.busy = true;
  setBusy(button, true, "Publishing...");

  try {
    let media = null;
    if (file) media = await uploadMedia(file);

    await addDoc(collection(db, "stories"), {
      authorId: state.user.uid,
      authorName: state.profile?.displayName || state.user.displayName || "Member",
      title: title || "A moment from my world",
      text,
      kind,
      mood,
      visibility,
      mediaURL: media?.url || "",
      mediaPublicId: media?.publicId || "",
      mediaType: file?.type || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    $("#story-form")?.reset();
    closeDialog($("#story-dialog"));
    showToast("Your story has been published.", "success");
    await renderStories();
  } catch (error) {
    const message = $("#story-message");
    if (message) {
      message.hidden = false;
      message.textContent = error.message || "Could not publish story.";
    }
  } finally {
    state.busy = false;
    setBusy(button, false);
  }
}

function mediaHTML(story) {
  if (!story.mediaURL) return "";
  const url = escapeHTML(story.mediaURL);

  if (story.mediaType?.startsWith("image/")) {
    return `<img class="story-media" src="${url}" alt="Story image" loading="lazy">`;
  }

  if (story.mediaType?.startsWith("video/")) {
    return `<video class="story-media" src="${url}" controls playsinline preload="metadata"></video>`;
  }

  if (story.mediaType?.startsWith("audio/")) {
    return `<audio class="story-audio" src="${url}" controls preload="none"></audio>`;
  }

  return "";
}

function renderStory(story) {
  const author = escapeHTML(story.authorName || "Member");

  return `
    <article class="story-card">
      <header class="story-card-header">
        <div class="story-avatar">${escapeHTML(author.charAt(0).toUpperCase())}</div>
        <div><strong>${author}</strong></div>
        <span class="story-visibility">${escapeHTML(story.visibility || "public")}</span>
      </header>
      <h3>${escapeHTML(story.title || "A moment from my world")}</h3>
      ${story.mood ? `<p class="story-mood">${escapeHTML(story.mood)}</p>` : ""}
      ${story.text ? `<p class="story-text">${escapeHTML(story.text)}</p>` : ""}
      ${mediaHTML(story)}
      <footer class="story-card-footer">
        <span>${escapeHTML(story.kind || "memory")}</span>
        ${story.authorId === state.user?.uid
          ? `<button type="button" class="text-button" data-delete-story="${escapeHTML(story.id)}">Delete</button>`
          : `<button type="button" class="text-button" data-report-story="${escapeHTML(story.id)}" data-author-id="${escapeHTML(story.authorId || "")}">Report</button>`}
      </footer>
    </article>
  `;
}

async function fetchStories() {
  if (!state.user) return [];

  const own = await getDocs(query(
    collection(db, "stories"),
    where("authorId", "==", state.user.uid),
    limit(100)
  ));

  let docs = [...own.docs];

  if (state.storyFilter === "public") {
    const publicStories = await getDocs(query(
      collection(db, "stories"),
      where("visibility", "==", "public"),
      limit(100)
    ));
    docs.push(...publicStories.docs);
  }

  const unique = new Map();
  for (const item of docs) {
    const story = { id: item.id, ...item.data() };
    if (story.visibility === "private" && story.authorId !== state.user.uid) continue;
    unique.set(item.id, story);
  }

  let stories = [...unique.values()];

  if (state.storyFilter === "mine") {
    stories = stories.filter(item => item.authorId === state.user.uid);
  } else if (state.storyFilter === "connections") {
    stories = stories.filter(item => item.authorId === state.user.uid);
  } else {
    stories = stories.filter(item =>
      item.visibility === "public" || item.authorId === state.user.uid
    );
  }

  stories.sort((a, b) =>
    (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)
  );

  return stories;
}

async function renderStories() {
  const feed = $("#stories-feed");
  if (!feed) return;

  if (!state.user) {
    feed.innerHTML = `
      <div class="empty-state">
        <h3>Your story universe awaits.</h3>
        <p>Sign in to discover stories and create your own memories.</p>
        <button class="button button-gold" type="button" data-action="get-started">Join your world</button>
      </div>`;
    return;
  }

  feed.innerHTML = "<p>Loading stories...</p>";

  try {
    state.stories = await fetchStories();

    feed.innerHTML = state.stories.length
      ? state.stories.map(renderStory).join("")
      : `<div class="empty-state"><h3>Your story begins here</h3><p>No stories yet.</p><button class="button button-gold" type="button" data-action="create-memory">Create your first story</button></div>`;
  } catch (error) {
    console.error("Stories error:", error);
    feed.textContent = "Could not load stories. Check Firestore rules.";
  }
}

async function deleteStory(id) {
  const story = state.stories.find(item => item.id === id);
  if (!story || story.authorId !== state.user?.uid) {
    return showToast("You can only delete your own stories.");
  }

  if (!window.confirm("Delete this story?")) return;

  try {
    await deleteDoc(doc(db, "stories", id));
    showToast("Story deleted.");
    await renderStories();
  } catch (error) {
    showToast(error.message || "Could not delete story.", "error");
  }
}

async function reportStory(id, authorId) {
  if (!await requireLogin()) return;
  const reason = window.prompt("Why are you reporting this story?");
  if (!reason?.trim()) return;

  try {
    await addDoc(collection(db, "reports"), {
      reporterId: state.user.uid,
      storyId: id,
      reportedUserId: authorId || "",
      reason: reason.trim().slice(0, 500),
      status: "pending",
      createdAt: serverTimestamp()
    });
    showToast("Report submitted.", "success");
  } catch (error) {
    showToast(error.message || "Could not submit report.", "error");
  }
}

async function loadRequests() {
  const [sent, received] = await Promise.all([
    getDocs(query(collection(db, "connectionRequests"),
      where("from", "==", state.user.uid), limit(100))),
    getDocs(query(collection(db, "connectionRequests"),
      where("to", "==", state.user.uid), limit(100)))
  ]);

  state.requests = [
    ...sent.docs.map(item => ({ id: item.id, ...item.data() })),
    ...received.docs.map(item => ({ id: item.id, ...item.data() }))
  ];
}

async function renderConnections() {
  const target = $("#connections-content");
  if (!target) return;
  if (!state.user) {
    target.textContent = "Log in to manage connections.";
    return;
  }

  target.textContent = "Loading connections...";

  try {
    await loadRequests();

    if (state.connectionTab === "requests") {
      const incoming = state.requests.filter(item =>
        item.to === state.user.uid && item.status === "pending"
      );

      if (!incoming.length) {
        target.textContent = "No pending requests.";
        return;
      }

      target.innerHTML = incoming.map(item => `
        <article class="connection-card">
          <strong>Connection request</strong>
          <p>Someone wants to connect with you.</p>
          <button type="button" class="button button-gold" data-accept-request="${escapeHTML(item.id)}">Accept</button>
          <button type="button" class="button button-glass" data-reject-request="${escapeHTML(item.id)}">Decline</button>
        </article>`).join("");
      return;
    }

    const users = await getDocs(query(collection(db, "users"), limit(40)));
    const pending = new Set(state.requests
      .filter(item => item.from === state.user.uid && item.status === "pending")
      .map(item => item.to));

    const people = users.docs
      .map(item => ({ uid: item.id, ...item.data() }))
      .filter(person => person.uid !== state.user.uid && !pending.has(person.uid));

    target.innerHTML = people.length
      ? people.map(person => `
          <article class="connection-card">
            <strong>${escapeHTML(person.displayName || "Member")}</strong>
            <p>${escapeHTML(person.bio || "Discover their story.")}</p>
            <button type="button" class="button button-gold" data-send-request="${escapeHTML(person.uid)}">Connect</button>
          </article>`).join("")
      : "<p>No new profiles found.</p>";
  } catch (error) {
    console.error("Connections error:", error);
    target.textContent = "Could not load connections. Check Firestore rules.";
  }
}

async function sendRequest(uid) {
  if (!await requireLogin() || uid === state.user.uid) return;

  try {
    await loadRequests();

    const existing = state.requests.find(item =>
      (item.from === state.user.uid && item.to === uid && item.status === "pending") ||
      (item.from === uid && item.to === state.user.uid && item.status === "pending")
    );

    if (existing) return showToast("A pending request already exists.");

    await addDoc(collection(db, "connectionRequests"), {
      from: state.user.uid,
      to: uid,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showToast("Connection request sent.", "success");
    await renderConnections();
  } catch (error) {
    showToast(error.message || "Could not send request.", "error");
  }
}

async function respondToRequest(id, accepted) {
  await loadRequests();
  const item = state.requests.find(request => request.id === id);

  if (!item || item.to !== state.user?.uid || item.status !== "pending") {
    return showToast("This request is no longer available.");
  }

  try {
    await updateDoc(doc(db, "connectionRequests", id), {
      status: accepted ? "accepted" : "rejected",
      updatedAt: serverTimestamp()
    });

    showToast(accepted ? "Request accepted." : "Request declined.");
    await renderConnections();
  } catch (error) {
    showToast(error.message || "Could not update request.", "error");
  }
}

function openConnections() {
  if (!state.user) return openAuth("login");
  state.connectionTab = "discover";
  openDialog("connections-dialog");
  renderConnections();
}

function openFeature(feature) {
  const content = $("#feature-dialog-content");
  const title = $("#feature-dialog-title");
  const eyebrow = $("#feature-dialog-eyebrow");
  const description = $("#feature-dialog-description");

  const features = {
    feelings: ["FEEL", "Your feelings, your truth", "Write a feeling and choose who can see it.", "create-feeling"],
    music: ["CREATE", "Your soul's soundtrack", "Share a supported audio file with a story.", "create-music"],
    identity: ["EXPRESS", "Your identity. Your crown.", "Build your profile and express who you are.", "open-profile"],
    community: ["CONNECT", "Find your people", "Discover members and manage requests.", "view-connections"]
  };

  const item = features[feature] || features.feelings;
  if (eyebrow) eyebrow.textContent = item[0];
  if (title) title.textContent = item[1];
  if (description) description.textContent = item[2];

  if (content) {
    content.innerHTML = `<button class="button button-gold" type="button" data-action="${item[3]}">Continue</button>`;
  }

  openDialog("feature-dialog");
}

function openSettings() {
  if (!state.user) return openAuth("login");

  const target = $("#settings-content");
  if (target) {
    target.innerHTML = `
      <p>Account: ${escapeHTML(state.user.email || "")}</p>
      <p>Privacy: choose the audience for each story before publishing.</p>
      <button class="button button-glass" type="button" data-action="logout">Log out</button>
    `;
  }

  openDialog("settings-dialog");
}

function bindEvents() {
  $("#auth-form")?.addEventListener("submit", handleAuthSubmit);
  $("#story-form")?.addEventListener("submit", publishStory);

  $("#login-button")?.addEventListener("click", () => openAuth("login"));
  $("#signup-button")?.addEventListener("click", () => openAuth("signup"));

  $("#auth-mode-toggle")?.addEventListener("click", () => {
    setAuthMode(state.authMode === "login" ? "signup" : "login");
  });

  $$("[data-action='forgot-password']").forEach(button =>
    button.addEventListener("click", resetPassword)
  );

  $("#menu-toggle")?.addEventListener("click", () => {
    const menu = $("#account-menu");
    if (!menu) return;
    menu.hidden = !menu.hidden;
    $("#menu-toggle").setAttribute("aria-expanded", String(!menu.hidden));
  });

  $$("[data-story-filter]").forEach(button => {
    button.addEventListener("click", () => {
      state.storyFilter = button.dataset.storyFilter;
      $$("[data-story-filter]").forEach(tab => {
        tab.classList.toggle("is-active", tab === button);
        tab.setAttribute("aria-pressed", String(tab === button));
      });
      renderStories();
    });
  });

  $$("[data-connection-tab]").forEach(button => {
    button.addEventListener("click", () => {
      state.connectionTab = button.dataset.connectionTab;
      $$("[data-connection-tab]").forEach(tab =>
        tab.classList.toggle("is-active", tab === button)
      );
      renderConnections();
    });
  });

  document.addEventListener("click", async event => {
    const button = event.target.closest("button");
    if (!button) return;

    const action = button.dataset.action;

    try {
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
        case "view-connections":
        case "open-connections":
          closeDialog($("#feature-dialog"));
          openConnections();
          break;
        case "open-settings":
          openSettings();
          break;
        case "open-feature":
          openFeature(button.dataset.feature);
          break;
        case "load-more-stories":
        case "refresh-stories":
          await renderStories();
          break;
        case "logout":
          await signOut(auth);
          closeDialog($("#settings-dialog"));
          showToast("You have logged out.");
          break;
        case "close-dialog":
          closeDialog(button.closest("dialog"));
          break;
      }

      if (button.dataset.deleteStory) {
        await deleteStory(button.dataset.deleteStory);
      }

      if (button.dataset.reportStory) {
        await reportStory(button.dataset.reportStory, button.dataset.authorId);
      }

      if (button.dataset.sendRequest) {
        await sendRequest(button.dataset.sendRequest);
      }

      if (button.dataset.acceptRequest) {
        await respondToRequest(button.dataset.acceptRequest, true);
      }

      if (button.dataset.rejectRequest) {
        await respondToRequest(button.dataset.rejectRequest, false);
      }
    } catch (error) {
      console.error(error);
      showToast(error.message || "This action failed.", "error");
    }
  });

  if ($("#current-year")) {
    $("#current-year").textContent = String(new Date().getFullYear());
  }
}

function init() {
  bindEvents();
  setAuthMode("login");
  updateNavigation();

  onAuthStateChanged(auth, async user => {
    state.user = user;

    if (!user) {
      state.profile = null;
      state.stories = [];
      updateNavigation();
      applyExperience();
      await renderStories();
      return;
    }

    try {
      await loadProfile(user);
      await renderStories();
    } catch (error) {
      console.error("Account initialization error:", error);
      showToast(
        "Your account signed in, but profile loading failed. Check Firestore rules.",
        "error"
      );
    }

    updateNavigation();
  });
}

init();
