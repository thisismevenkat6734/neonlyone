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

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const state = {
  user: null,
  profile: null,
  authMode: "login",
  storyFilter: "public",
  connectionTab: "discover",
  stories: [],
  connections: [],
  requests: [],
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

const random = a => a[Math.floor(Math.random() * a.length)];

function esc(value = "") {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
    '"': "&quot;", "'": "&#39;"
  })[c]);
}

function toast(message, type = "info") {
  const region = $("#toast-region");
  if (!region) {
    console.log(message);
    return;
  }
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.setAttribute("role", "status");
  el.textContent = message;
  region.append(el);
  setTimeout(() => el.remove(), 4000);
}

function busy(button, value, text = "Please wait...") {
  if (!button) return;
  if (value) {
    button.dataset.oldText = button.textContent;
    button.textContent = text;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.oldText || button.textContent;
    button.disabled = false;
  }
}

function openDialog(id) {
  const d = document.getElementById(id);
  if (!d) return;
  if (d.showModal && !d.open) d.showModal();
  else d.setAttribute("open", "");
}

function closeDialog(d) {
  if (!d) return;
  if (d.close && d.open) d.close();
  else d.removeAttribute("open");
}

function openAuth(mode = "login") {
  state.authMode = mode;
  const signup = mode === "signup";
  const name = $("#auth-display-name");
  const gender = $("#auth-gender");

  name?.closest(".form-field")?.classList.toggle("is-hidden", !signup);
  if (name) name.required = signup;
  gender?.closest(".form-field")?.classList.toggle("is-hidden", !signup);

  const submit = $("#auth-submit");
  if (submit) submit.textContent = signup ? "Create my world" : "Enter my world";

  const toggle = $("#auth-mode-toggle");
  if (toggle) toggle.textContent = signup
    ? "Already have an account? Log in"
    : "New here? Create your identity";

  const message = $("#auth-message");
  if (message) message.textContent = "";
  openDialog("auth-dialog");
}

function setMessage(message, error = true) {
  const el = $("#auth-message");
  if (el) {
    el.textContent = message;
    el.dataset.state = error ? "error" : "success";
  }
}

function experience() {
  const gender = state.profile?.gender || "other";
  const title = gender === "male"
    ? "Welcome, King"
    : gender === "female"
      ? "Welcome, Queen"
      : "Welcome to Your World";

  document.documentElement.dataset.experience =
    gender === "male" ? "king" : gender === "female" ? "queen" : "legend";

  const heroTitle = $("#hero-title");
  const heroQuote = $("#hero-quote");

  if (state.user && heroTitle) heroTitle.textContent = title;
  if (state.user && heroQuote) {
    heroQuote.textContent = random(quotes[gender] || quotes.other);
  }
}

function navigation() {
  if ($("#login-button")) $("#login-button").hidden = !!state.user;
  if ($("#signup-button")) $("#signup-button").hidden = !!state.user;
  if ($("#account-menu")) $("#account-menu").hidden = !state.user;

  const name = state.profile?.displayName || state.user?.displayName || "My account";
  if ($("#account-name")) $("#account-name").textContent = name;
  if ($("#account-avatar")) $("#account-avatar").textContent = name.charAt(0).toUpperCase();
}

async function loadProfile(user) {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    state.profile = snap.data();
  } else {
    const profile = {
      uid: user.uid,
      displayName: user.displayName || "Member",
      gender: "other",
      bio: "",
      interests: [],
      photoURL: "",
      createdAt: serverTimestamp()
    };
    await setDoc(ref, profile);
    state.profile = profile;
  }

  navigation();
  experience();
}

async function requireLogin() {
  if (state.user) return true;
  toast("Please log in to continue.");
  openAuth("login");
  return false;
}

async function authSubmit(event) {
  event.preventDefault();
  if (state.busy) return;

  const button = $("#auth-submit");
  const email = $("#auth-email")?.value.trim();
  const password = $("#auth-password")?.value || "";
  const displayName = $("#auth-display-name")?.value.trim();
  const gender = $("#auth-gender")?.value || "other";

  if (!email || !password) return setMessage("Enter your email and password.");
  if (state.authMode === "signup" && !displayName) {
    return setMessage("Enter your display name.");
  }
  if (state.authMode === "signup" && password.length < 8) {
    return setMessage("Use a password with at least 8 characters.");
  }

  state.busy = true;
  busy(button, true, "Opening your world...");

  try {
    if (state.authMode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName });

      const profile = {
        uid: credential.user.uid,
        displayName,
        gender: ["male", "female", "other"].includes(gender) ? gender : "other",
        bio: "",
        interests: [],
        photoURL: "",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      await setDoc(doc(db, "users", credential.user.uid), profile);
      state.profile = profile;
      closeDialog($("#auth-dialog"));
      navigation();
      experience();
      toast(`${gender === "male" ? "Welcome, King" : gender === "female" ? "Welcome, Queen" : "Welcome to your own world"}! ${random(quotes[gender] || quotes.other)}`, "success");
    } else {
      await signInWithEmailAndPassword(auth, email, password);
      closeDialog($("#auth-dialog"));
      toast("Welcome back to your world.", "success");
    }
  } catch (error) {
    const messages = {
      "auth/email-already-in-use": "This email already has an account. Log in instead.",
      "auth/invalid-email": "Enter a valid email address.",
      "auth/invalid-credential": "Email or password is incorrect.",
      "auth/weak-password": "Choose a stronger password."
    };
    setMessage(messages[error.code] || error.message || "Authentication failed.");
  } finally {
    state.busy = false;
    busy(button, false);
  }
}

async function resetPassword() {
  const email = $("#auth-email")?.value.trim();
  if (!email) return setMessage("Enter your email address first.");

  try {
    await sendPasswordResetEmail(auth, email);
    setMessage("If the account exists, a password reset email has been sent.", false);
  } catch (error) {
    setMessage(error.message || "Could not send reset email.");
  }
}

function openProfile() {
  if (!state.user) return openAuth("login");

  const target = $("#profile-content");
  if (!target) return;

  const p = state.profile || {};
  target.innerHTML = `
    <form id="profile-edit-form">
      <label class="form-field">Display name
        <input name="displayName" maxlength="60" required value="${esc(p.displayName || "")}">
      </label>
      <label class="form-field">About me
        <textarea name="bio" maxlength="500" rows="3">${esc(p.bio || "")}</textarea>
      </label>
      <label class="form-field">Interests (comma-separated)
        <input name="interests" maxlength="300" value="${esc((p.interests || []).join(", "))}">
      </label>
      <label class="form-field">Profile photo
        <input name="photo" type="file" accept="image/jpeg,image/png,image/webp">
      </label>
      <button class="button button-primary" type="submit">Save profile</button>
      <p id="profile-message" role="status"></p>
    </form>
  `;

  $("#profile-edit-form").addEventListener("submit", saveProfile);
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
    .split(",").map(x => x.trim()).filter(Boolean).slice(0, 20);

  if (!displayName) return toast("Display name is required.");

  busy(button, true, "Saving...");
  try {
    let photoURL = state.profile?.photoURL || "";
    const photo = data.get("photo");

    if (photo instanceof File && photo.size) {
      const result = await uploadMedia(photo);
      photoURL = result.url;
    }

    await updateProfile(state.user, { displayName, photoURL: photoURL || null });
    await updateDoc(doc(db, "users", state.user.uid), {
      displayName,
      bio,
      interests,
      photoURL,
      updatedAt: serverTimestamp()
    });

    state.profile = { ...state.profile, displayName, bio, interests, photoURL };
    navigation();
    experience();
    toast("Profile saved.", "success");
    openProfile();
  } catch (error) {
    toast(error.message || "Could not save profile.", "error");
  } finally {
    busy(button, false);
  }
}

function openStory(kind = "memory") {
  if (!state.user) return openAuth("login");

  if ($("#story-kind")) $("#story-kind").value = kind;
  if ($("#story-message")) $("#story-message").textContent = "";
  openDialog("story-dialog");
}

async function publishStory(event) {
  event.preventDefault();
  if (!state.user || state.busy) return;

  const button = $("#publish-story-button");
  const title = $("#story-title")?.value.trim() || "";
  const text = $("#story-text")?.value.trim() || "";
  const kind = $("#story-kind")?.value || "memory";
  const mood = $("#story-mood")?.value || "";
  const visibility = $("#story-visibility")?.value || "public";
  const file = $("#story-media")?.files?.[0] || null;

  if (!title && !text && !file) return toast("Add text, a title or media.");

  state.busy = true;
  busy(button, true, "Publishing...");

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
      visibility: ["public", "connections", "private"].includes(visibility) ? visibility : "public",
      mediaURL: media?.url || "",
      mediaPublicId: media?.publicId || "",
      mediaType: file?.type || "",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    $("#story-form")?.reset();
    closeDialog($("#story-dialog"));
    toast("Your story has been published.", "success");
    await renderStories();
  } catch (error) {
    const message = $("#story-message");
    if (message) message.textContent = error.message || "Could not publish story.";
    else toast(error.message || "Could not publish story.", "error");
  } finally {
    state.busy = false;
    busy(button, false);
  }
}

function storyMedia(story) {
  if (!story.mediaURL) return "";
  const url = esc(story.mediaURL);
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

function storyCard(story) {
  const author = esc(story.authorName || "Member");
  return `
    <article class="story-card">
      <header class="story-card-header">
        <div class="story-avatar">${esc(author.charAt(0).toUpperCase())}</div>
        <div><strong>${author}</strong></div>
        <span class="story-visibility">${esc(story.visibility)}</span>
      </header>
      <h3>${esc(story.title || "A moment from my world")}</h3>
      ${story.mood ? `<p class="story-mood">${esc(story.mood)}</p>` : ""}
      ${story.text ? `<p class="story-text">${esc(story.text)}</p>` : ""}
      ${storyMedia(story)}
      <footer class="story-card-footer">
        <span>${esc(story.kind || "memory")}</span>
        ${story.authorId === state.user?.uid
          ? `<button type="button" class="text-button" data-delete-story="${esc(story.id)}">Delete</button>`
          : `<button type="button" class="text-button" data-report-story="${esc(story.id)}" data-author-id="${esc(story.authorId)}">Report</button>`}
      </footer>
    </article>`;
}

async function acceptedConnectionIds() {
  if (!state.user) return [];

  const [sent, received] = await Promise.all([
    getDocs(query(collection(db, "connectionRequests"),
      where("from", "==", state.user.uid),
      where("status", "==", "accepted"), limit(100))),
    getDocs(query(collection(db, "connectionRequests"),
      where("to", "==", state.user.uid),
      where("status", "==", "accepted"), limit(100)))
  ]);

  return [...new Set([
    ...sent.docs.map(d => d.data().to),
    ...received.docs.map(d => d.data().from)
  ].filter(Boolean))];
}

async function fetchStories() {
  if (!state.user) return [];

  const own = await getDocs(query(collection(db, "stories"),
    where("authorId", "==", state.user.uid), limit(100)));

  let docs = [...own.docs];

  if (state.storyFilter === "public") {
    const publicStories = await getDocs(query(collection(db, "stories"),
      where("visibility", "==", "public"), limit(100)));
    docs.push(...publicStories.docs);
  } else if (state.storyFilter === "connections") {
    const ids = await acceptedConnectionIds();
    for (let i = 0; i < ids.length; i += 10) {
      const batch = ids.slice(i, i + 10);
      if (!batch.length) continue;

      const result = await getDocs(query(collection(db, "stories"),
        where("authorId", "in", batch),
        where("visibility", "==", "connections"), limit(100)));
      docs.push(...result.docs);
    }
    const publicStories = await getDocs(query(collection(db, "stories"),
      where("visibility", "==", "public"), limit(100)));
    docs.push(...publicStories.docs);
  }

  const unique = new Map();
  for (const item of docs) {
    const story = { id: item.id, ...item.data() };
    if (story.visibility === "private" && story.authorId !== state.user.uid) continue;
    unique.set(item.id, story);
  }

  let result = [...unique.values()];
  if (state.storyFilter === "mine") {
    result = result.filter(s => s.authorId === state.user.uid);
  } else if (state.storyFilter === "connections") {
    const allowed = new Set([state.user.uid, ...await acceptedConnectionIds()]);
    result = result.filter(s => s.visibility === "public" ||
      (allowed.has(s.authorId) && s.visibility === "connections") ||
      s.authorId === state.user.uid);
  } else {
    result = result.filter(s => s.visibility === "public" || s.authorId === state.user.uid);
  }

  result.sort((a, b) =>
    (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  return result;
}

async function renderStories() {
  const feed = $("#stories-feed");
  if (!feed) return;

  if (!state.user) {
    feed.innerHTML = `<p>Log in to explore stories and create your own memories.</p>`;
    return;
  }

  feed.innerHTML = `<p class="muted">Loading stories...</p>`;
  try {
    state.stories = await fetchStories();

    if (!state.stories.length) {
      feed.innerHTML = `<div class="empty-state"><h3>Your story begins here</h3><p>No stories yet. Create your first memory.</p><button class="button button-primary" type="button" data-action="create-memory">Create a story</button></div>`;
      return;
    }

    feed.innerHTML = state.stories.map(storyCard).join("");
  } catch (error) {
    console.error(error);
    feed.innerHTML = `<p>Stories could not be loaded. Check Firestore rules and console errors.</p>`;
  }
}

async function deleteStory(id) {
  const story = state.stories.find(s => s.id === id);
  if (!story || story.authorId !== state.user?.uid) return toast("You can only delete your own story.");
  if (!confirm("Delete this story?")) return;

  try {
    await deleteDoc(doc(db, "stories", id));
    toast("Story deleted.");
    await renderStories();
  } catch (error) {
    toast(error.message || "Could not delete story.", "error");
  }
}

async function reportStory(id, authorId) {
  if (!await requireLogin()) return;
  const reason = prompt("Why are you reporting this story?");
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
    toast("Report submitted.", "success");
  } catch (error) {
    toast(error.message || "Could not submit report.", "error");
  }
}

async function loadConnectionRequests() {
  const [sent, received] = await Promise.all([
    getDocs(query(collection(db, "connectionRequests"),
      where("from", "==", state.user.uid), limit(100))),
    getDocs(query(collection(db, "connectionRequests"),
      where("to", "==", state.user.uid), limit(100)))
  ]);

  state.requests = [
    ...sent.docs.map(d => ({ id: d.id, ...d.data() })),
    ...received.docs.map(d => ({ id: d.id, ...d.data() }))
  ];
}

async function renderConnections() {
  const target = $("#connections-content");
  if (!target) return;
  if (!state.user) {
    target.textContent = "Log in to manage connections.";
    return;
  }

  target.textContent = "Loading community...";

  try {
    await loadConnectionRequests();
    const ids = await acceptedConnectionIds();

    state.connections = (await Promise.all(ids.map(async uid => {
      const snap = await getDoc(doc(db, "users", uid));
      return snap.exists() ? { uid, ...snap.data() } : null;
    }))).filter(Boolean);

    if (state.connectionTab === "connections") {
      target.innerHTML = state.connections.length
        ? state.connections.map(p => `<article class="connection-card"><strong>${esc(p.displayName || "Member")}</strong><p>${esc(p.bio || "")}</p></article>`).join("")
        : "<p>No connections yet.</p>";
      return;
    }

    if (state.connectionTab === "requests") {
      const incoming = state.requests.filter(r => r.to === state.user.uid && r.status === "pending");
      if (!incoming.length) {
        target.innerHTML = "<p>No pending requests.</p>";
        return;
      }

      target.innerHTML = (await Promise.all(incoming.map(async r => {
        const snap = await getDoc(doc(db, "users", r.from));
        const p = snap.exists() ? snap.data() : {};
        return `<article class="connection-card"><strong>${esc(p.displayName || "Member")}</strong><button class="button button-primary" data-accept-request="${esc(r.id)}" type="button">Accept</button><button class="button button-secondary" data-reject-request="${esc(r.id)}" type="button">Decline</button></article>`;
      }))).join("");
      return;
    }

    const snapshot = await getDocs(query(collection(db, "users"), limit(40)));
    const pendingTargets = new Set(state.requests
      .filter(r => r.from === state.user.uid && r.status === "pending")
      .map(r => r.to));
    const connected = new Set(ids);

    const people = snapshot.docs.map(d => ({ uid: d.id, ...d.data() }))
      .filter(p => p.uid !== state.user.uid && !connected.has(p.uid) && !pendingTargets.has(p.uid));

    target.innerHTML = people.length
      ? people.map(p => `<article class="connection-card"><strong>${esc(p.displayName || "Member")}</strong><p>${esc(p.bio || "Discover their story.")}</p><button class="button button-primary" type="button" data-send-request="${esc(p.uid)}">Connect</button></article>`).join("")
      : "<p>No new profiles found.</p>";
  } catch (error) {
    console.error(error);
    target.textContent = "Could not load connections. Check Firestore rules.";
  }

  $$("[data-connection-tab]").forEach(button =>
    button.setAttribute("aria-pressed", String(button.dataset.connectionTab === state.connectionTab)));
}

async function sendRequest(uid) {
  if (!await requireLogin() || uid === state.user.uid) return;

  try {
    await loadConnectionRequests();
    const existing = state.requests.find(r =>
      (r.from === state.user.uid && r.to === uid) ||
      (r.from === uid && r.to === state.user.uid && r.status === "pending"));

    if (existing) return toast("A request already exists.");

    await addDoc(collection(db, "connectionRequests"), {
      from: state.user.uid,
      to: uid,
      status: "pending",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    toast("Connection request sent.", "success");
    await renderConnections();
  } catch (error) {
    toast(error.message || "Could not send request.", "error");
  }
}

async function respondRequest(id, accepted) {
  const request = state.requests.find(r => r.id === id);
  if (!request || request.to !== state.user?.uid || request.status !== "pending") {
    return toast("Request is no longer available.");
  }

  try {
    await updateDoc(doc(db, "connectionRequests", id), {
      status: accepted ? "accepted" : "rejected",
      updatedAt: serverTimestamp()
    });
    toast(accepted ? "Connection accepted." : "Request declined.");
    await renderConnections();
  } catch (error) {
    toast(error.message || "Could not update request.", "error");
  }
}

function openConnections() {
  if (!state.user) return openAuth("login");
  state.connectionTab = "discover";
  renderConnections();
  openDialog("connections-dialog");
}

function openFeature(feature) {
  const content = $("#feature-dialog-content");
  const title = $("#feature-dialog-title");
  const eyebrow = $("#feature-dialog-eyebrow");
  const description = $("#feature-dialog-description");

  const options = {
    feelings: ["FEEL", "Your feelings deserve a voice", "Share a feeling with the audience you choose.", "create-feeling"],
    music: ["CREATE", "Soundtrack your story", "Upload and share supported audio files.", "create-music"],
    identity: ["EXPRESS", "Build your identity", "Update your profile and express who you are.", "open-profile"],
    community: ["CONNECT", "Find your people", "Discover people and manage connection requests.", "open-connections"]
  };

  const item = options[feature] || options.feelings;
  if (eyebrow) eyebrow.textContent = item[0];
  if (title) title.textContent = item[1];
  if (description) description.textContent = item[2];
  if (content) content.innerHTML = `<button class="button button-primary" type="button" data-action="${item[3]}">Continue</button>`;
  openDialog("feature-dialog");
}

function setStoryFilter(filter) {
  state.storyFilter = ["public", "connections", "mine"].includes(filter) ? filter : "public";
  $$("[data-story-filter]").forEach(button =>
    button.setAttribute("aria-pressed", String(button.dataset.storyFilter === state.storyFilter)));
  renderStories();
}

function bindEvents() {
  $("#auth-form")?.addEventListener("submit", authSubmit);
  $("#story-form")?.addEventListener("submit", publishStory);
  $("#login-button")?.addEventListener("click", () => openAuth("login"));
  $("#signup-button")?.addEventListener("click", () => openAuth("signup"));

  $("#auth-mode-toggle")?.addEventListener("click", () =>
    openAuth(state.authMode === "login" ? "signup" : "login"));

  $$("[data-action='forgot-password']").forEach(button =>
    button.addEventListener("click", resetPassword));

  $$("[data-story-filter]").forEach(button =>
    button.addEventListener("click", () => setStoryFilter(button.dataset.storyFilter)));

  $$("[data-connection-tab]").forEach(button =>
    button.addEventListener("click", () => {
      state.connectionTab = button.dataset.connectionTab;
      renderConnections();
    }));

  $("#menu-toggle")?.addEventListener("click", () => {
    const menu = $("#account-menu");
    if (menu) menu.hidden = !menu.hidden;
  });

  document.addEventListener("click", async event => {
    const button = event.target.closest("button, [data-action]");
    if (!button) return;

    const action = button.dataset.action;

    try {
      if (action === "get-started") openAuth("signup");
      else if (action === "create-feeling") openStory("feeling");
      else if (action === "create-memory") openStory("memory");
      else if (action === "create-music") openStory("music");
      else if (action === "open-profile") openProfile();
      else if (action === "open-connections") openConnections();
      else if (action === "open-feature") openFeature(button.dataset.feature);
      else if (action === "load-more-stories" || action === "refresh-stories") await renderStories();
      else if (action === "logout") await signOut(auth);
      else if (action === "close-dialog") closeDialog(button.closest("dialog"));

      if (button.dataset.deleteStory) await deleteStory(button.dataset.deleteStory);
      if (button.dataset.reportStory) await reportStory(button.dataset.reportStory, button.dataset.authorId);
      if (button.dataset.sendRequest) await sendRequest(button.dataset.sendRequest);
      if (button.dataset.acceptRequest) await respondRequest(button.dataset.acceptRequest, true);
      if (button.dataset.rejectRequest) await respondRequest(button.dataset.rejectRequest, false);
    } catch (error) {
      console.error(error);
      toast("Action failed. Check your connection and Firebase rules.", "error");
    }
  });

  if ($("#current-year")) $("#current-year").textContent = String(new Date().getFullYear());
}

function init() {
  bindEvents();
  navigation();

  onAuthStateChanged(auth, async user => {
    state.user = user;

    if (!user) {
      state.profile = null;
      state.stories = [];
      state.connections = [];
      state.requests = [];
      navigation();
      experience();
      await renderStories();
      return;
    }

    try {
      await loadProfile(user);
      await renderStories();
      toast("Your world is ready.", "success");
    } catch (error) {
      console.error("Account initialization failed:", error);
      toast("Account loaded, but some data could not be read. Check Firestore rules.", "error");
    }

    navigation();
  });
}

init();
