// BE ONLY ONE — app.js
// Expected local modules: firebase-config.js exports auth, db, functions.
// cloudinary-config.js exports uploadMediaFile(file, onProgress?) returning { url, ... }.
import { auth, db, functions } from "./firebase-config.js";
import { uploadMediaFile } from "./cloudinary-config.js";
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  sendPasswordResetEmail, signOut, onAuthStateChanged, updateProfile
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  doc, getDoc, setDoc, updateDoc, addDoc, getDocs, collection,
  query, where, limit, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-functions.js";

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const state = { user: null, profile: null, authMode: "login", storyFilter: "public", connectionTab: "discover", stories: [], busy: false };

function toast(text, type = "info") {
  const region = $("#toast-region"); if (!region) return;
  const node = document.createElement("p"); node.className = `toast toast-${type}`;
  node.textContent = String(text || ""); node.setAttribute("role", type === "error" ? "alert" : "status");
  region.appendChild(node); window.setTimeout(() => node.remove(), 4500);
}
function setMessage(selector, text = "", type = "error") {
  const el = $(selector); if (!el) return;
  el.textContent = text; el.dataset.type = type; el.hidden = !text;
}
function errorText(error) {
  const messages = {
    "auth/email-already-in-use": "This email already has an account. Please sign in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Use a stronger password with at least 6 characters.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Check your internet connection and try again.",
    "permission-denied": "Firestore access denied. Check your security rules and collection names."
  };
  return messages[error?.code] || error?.message || "Something went wrong. Please try again.";
}
function openDialog(selector) { const d = $(selector); if (d && !d.open) d.showModal(); }
function closeDialog(selector) { const d = $(selector); if (d?.open) d.close(); }
function closeAllDialogs() { $$('dialog[open]').forEach(d => d.close()); }
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[ch]);
}
function asDate(value) { if (value?.toDate) return value.toDate(); const d = value ? new Date(value) : null; return d && !Number.isNaN(d.getTime()) ? d : null; }
function fallbackProfile(user) { return { uid:user.uid, displayName:user.displayName || "Member", bio:"", gender:"", interests:"", languages:"", favourites:"" }; }

async function loadProfile(user, createIfMissing = false) {
  // This app consistently uses the `profiles/{uid}` collection.
  const ref = doc(db, "profiles", user.uid); const snap = await getDoc(ref);
  if (snap.exists()) state.profile = { ...fallbackProfile(user), ...snap.data(), uid:user.uid };
  else {
    state.profile = fallbackProfile(user);
    if (createIfMissing) await setDoc(ref, { ...state.profile, createdAt:serverTimestamp(), updatedAt:serverTimestamp() });
  }
  updateUI(); return state.profile;
}
function updateUI() {
  const logged = Boolean(state.user);
  $("#get-started").textContent = logged ? "My Account" : "Get Started";
  $("#open-profile").textContent = logged ? "My Identity" : "Sign In";
  const title = $("#hero-title"), quote = $("#hero-quote");
  if (title) title.innerHTML = "Your world.<br><span>Your identity.</span>";
  if (quote) quote.textContent = logged ? `Welcome, ${state.profile?.displayName || state.user?.displayName || "Member"}. Your Soul. Your Story. Your Identity.` : "Your Soul. Your Story. Your Identity.";
  renderStories();
}
function setAuthMode(mode) {
  state.authMode = mode === "signup" ? "signup" : "login";
  const signup = state.authMode === "signup";
  $("#name-field").hidden = !signup; $("#auth-name").required = signup;
  $("#auth-password").autocomplete = signup ? "new-password" : "current-password";
  $("#login-tab").classList.toggle("active", !signup); $("#signup-tab").classList.toggle("active", signup);
  $("#auth-title").textContent = signup ? "Create your identity." : "Your space starts here.";
  $("#auth-submit").textContent = signup ? "Create Account" : "Sign In";
  $("#forgot-password").hidden = signup; setMessage("#auth-error"); setMessage("#auth-success", "", "success");
}
function requireLogin() {
  if (state.user) return true;
  setAuthMode("login"); openDialog("#auth-dialog"); toast("Please sign in to continue."); return false;
}

async function handleAuthSubmit(event) {
  event.preventDefault(); if (state.busy) return;
  const email = $("#auth-email").value.trim(), password = $("#auth-password").value;
  const displayName = $("#auth-name").value.trim();
  if (state.authMode === "signup" && !displayName) { setMessage("#auth-error", "Please enter a display name."); return; }
  state.busy = true; $("#auth-submit").disabled = true; setMessage("#auth-error");
  try {
    if (state.authMode === "signup") {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const user = credential.user, cleanName = displayName.slice(0, 60);
      await updateProfile(user, { displayName:cleanName });
      const profile = { ...fallbackProfile(user), displayName:cleanName, createdAt:serverTimestamp(), updatedAt:serverTimestamp() };
      await setDoc(doc(db, "profiles", user.uid), profile);
      state.user = user; state.profile = { ...profile, createdAt:undefined, updatedAt:undefined };
      closeDialog("#auth-dialog"); toast("Your account has been created.", "success");
    } else {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      state.user = credential.user; await loadProfile(credential.user, true);
      closeDialog("#auth-dialog"); toast("Welcome back.", "success");
    }
    updateUI(); await fetchStories();
  } catch (error) { setMessage("#auth-error", errorText(error)); }
  finally { state.busy = false; $("#auth-submit").disabled = false; $("#auth-submit").textContent = state.authMode === "signup" ? "Create Account" : "Sign In"; }
}
async function handleForgotPassword() {
  const email = $("#auth-email").value.trim();
  if (!email) { setMessage("#auth-error", "Enter your email address first."); return; }
  try { await sendPasswordResetEmail(auth, email); setMessage("#auth-success", "If this email is registered, a password reset message has been sent.", "success"); }
  catch (error) { setMessage("#auth-error", errorText(error)); }
}
async function logout() { try { await signOut(auth); closeAllDialogs(); toast("Signed out.", "success"); } catch (e) { toast(errorText(e), "error"); } }

function openProfile() {
  if (!requireLogin()) return;
  const p = state.profile || fallbackProfile(state.user);
  $("#profile-summary").innerHTML = `<h3>${escapeHTML(p.displayName || "Member")}</h3><p>${escapeHTML(p.bio || "Add a bio to tell your story.")}</p><p><strong>Email:</strong> ${escapeHTML(state.user.email || "")}</p><p><strong>Interests:</strong> ${escapeHTML(p.interests || "Not added yet")}</p>`;
  $("#profile-name").value = p.displayName || ""; $("#profile-bio").value = p.bio || "";
  $("#profile-gender").value = p.gender || ""; $("#profile-interests").value = Array.isArray(p.interests) ? p.interests.join(", ") : (p.interests || "");
  $("#profile-languages").value = Array.isArray(p.languages) ? p.languages.join(", ") : (p.languages || "");
  $("#profile-favourites").value = p.favourites || ""; setMessage("#profile-error"); openDialog("#profile-dialog");
}
async function saveProfile(event) {
  event.preventDefault(); if (!requireLogin()) return;
  const name = $("#profile-name").value.trim(); if (!name) { setMessage("#profile-error", "Display name is required."); return; }
  const data = {
    uid:state.user.uid, displayName:name.slice(0,60), bio:$("#profile-bio").value.trim().slice(0,300),
    gender:$("#profile-gender").value, interests:$("#profile-interests").value.trim().slice(0,300),
    languages:$("#profile-languages").value.trim().slice(0,150), favourites:$("#profile-favourites").value.trim().slice(0,500), updatedAt:serverTimestamp()
  };
  try {
    await updateProfile(state.user, { displayName:data.displayName });
    await setDoc(doc(db, "profiles", state.user.uid), data, { merge:true });
    state.profile = { ...state.profile, ...data }; updateUI(); openProfile(); toast("Identity updated.", "success");
  } catch (e) { setMessage("#profile-error", errorText(e)); }
}

function openStory(kind = "feeling") {
  if (!requireLogin()) return;
  $("#story-form").reset(); $("#story-kind").value = ["feeling","memory","music"].includes(kind) ? kind : "feeling";
  setMessage("#story-error"); $("#upload-progress").hidden = true; $("#upload-progress-bar").value = 0; openDialog("#story-dialog");
}
async function uploadSelectedFile(file) {
  // Supports either progress-aware or one-argument uploadMediaFile helpers.
  const result = await uploadMediaFile(file, percent => {
    $("#upload-progress").hidden = false; $("#upload-progress-bar").value = Number(percent) || 0;
    $("#upload-progress-text").textContent = `Uploading ${Math.round(Number(percent) || 0)}%`;
  });
  const url = typeof result === "string" ? result : result?.url;
  if (!url) throw new Error("Cloudinary upload did not return a media URL. Check cloudinary-config.js.");
  return { url, publicId:result?.publicId || result?.public_id || "", format:result?.format || "", bytes:Number(result?.bytes) || file.size, duration:result?.duration ?? null };
}
async function submitStory(event) {
  event.preventDefault(); if (!requireLogin() || state.busy) return;
  const title = $("#story-title-input").value.trim(), text = $("#story-text").value.trim();
  const kind = $("#story-kind").value, mood = $("#story-mood").value, visibility = $("#story-visibility").value, file = $("#story-media").files?.[0] || null;
  if (!title && !text && !file) { setMessage("#story-error", "Add a title, story text, or media first."); return; }
  if (!(["feeling","memory","music"].includes(kind)) || !(["public","connections","private"].includes(visibility))) { setMessage("#story-error", "Please choose valid story and privacy options."); return; }
  state.busy = true; $("#publish-story").disabled = true; setMessage("#story-error");
  try {
    let media = { url:"", publicId:"", format:"", bytes:0, duration:null }, mediaType = "";
    if (file) {
      const type = file.type || "";
      const allowed = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm)|audio\/(mpeg|mp4|ogg|wav|webm))$/.test(type);
      const max = type.startsWith("image/") ? 10*1024*1024 : type.startsWith("video/") ? 50*1024*1024 : 20*1024*1024;
      if (!allowed) throw new Error("Unsupported media format.");
      if (file.size > max) throw new Error("File is too large for the selected media type.");
      media = await uploadSelectedFile(file); mediaType = type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : "image";
    }
    const story = {
      authorId:state.user.uid, authorName:(state.profile?.displayName || state.user.displayName || "Member").slice(0,60),
      title:title.slice(0,100), text:text.slice(0,5000), kind, type:kind, mood:mood.slice(0,100), visibility,
      mediaURL:media.url, mediaUrl:media.url, mediaPublicId:media.publicId, mediaType, mediaFormat:media.format, mediaBytes:media.bytes, mediaDuration:media.duration,
      createdAt:serverTimestamp(), updatedAt:serverTimestamp()
    };
    await addDoc(collection(db, "stories"), story); closeDialog("#story-dialog"); toast("Story published.", "success"); await fetchStories();
  } catch (e) { setMessage("#story-error", errorText(e)); }
  finally { state.busy = false; $("#publish-story").disabled = false; $("#upload-progress").hidden = true; }
}
function mediaMarkup(story) {
  const url = story.mediaURL || story.mediaUrl || ""; if (!url) return "";
  const safe = escapeHTML(url);
  if (story.mediaType === "audio" || story.kind === "music") return `<audio class="story-audio" src="${safe}" controls preload="metadata"></audio>`;
  if (story.mediaType === "video" || safe.includes("/video/upload/")) return `<video class="story-media" src="${safe}" controls playsinline preload="metadata"></video>`;
  return `<img class="story-media" src="${safe}" alt="Story media" loading="lazy">`;
}
function storyMarkup(story) {
  const own = story.authorId === state.user?.uid, date = asDate(story.createdAt);
  return `<article class="story-card"><header class="story-card-header"><strong>${escapeHTML(story.authorName || "BE ONLY ONE member")}</strong><span>${date ? escapeHTML(date.toLocaleDateString()) : ""}</span>${own ? `<button type="button" data-action="delete-story" data-id="${escapeHTML(story.id)}">Delete</button>` : ""}</header><div class="story-card-content"><span class="story-kind">${escapeHTML(story.kind || story.type || "feeling")}</span><h3>${escapeHTML(story.title || "Untitled moment")}</h3>${story.mood ? `<p>${escapeHTML(story.mood)}</p>` : ""}${story.text ? `<p>${escapeHTML(story.text).replace(/\n/g,"<br>")}</p>` : ""}${mediaMarkup(story)}</div><footer class="story-card-footer"><span>${escapeHTML(story.visibility || "public")}</span>${!own && state.user ? `<button type="button" data-action="report-story" data-id="${escapeHTML(story.id)}" data-author="${escapeHTML(story.authorId || "")}">Report</button>` : ""}</footer></article>`;
}
function renderStories() {
  const feed = $("#stories-feed"); if (!feed) return;
  let list = [...state.stories];
  if (state.storyFilter === "mine") list = list.filter(s => s.authorId === state.user?.uid);
  else if (state.storyFilter === "connections") list = list.filter(s => s.authorId === state.user?.uid || s.visibility === "connections");
  else list = list.filter(s => s.visibility === "public" || s.authorId === state.user?.uid);
  list.sort((a,b) => (asDate(b.createdAt)?.getTime() || 0) - (asDate(a.createdAt)?.getTime() || 0));
  feed.innerHTML = list.length ? list.map(storyMarkup).join("") : `<div class="empty-state"><p>No stories to show yet.</p><p>Share a feeling or memory to start your world.</p></div>`;
}
async function fetchStories() {
  try {
    const found = new Map();
    if (state.user) {
      const own = await getDocs(query(collection(db,"stories"), where("authorId","==",state.user.uid), limit(50)));
      own.forEach(d => found.set(d.id,{id:d.id,...d.data()}));
    }
    const publicSnap = await getDocs(query(collection(db,"stories"), where("visibility","==","public"), limit(50)));
    publicSnap.forEach(d => found.set(d.id,{id:d.id,...d.data()})); state.stories = [...found.values()]; renderStories();
  } catch (e) { toast(errorText(e), "error"); }
}
async function deleteStory(id) {
  if (!requireLogin() || !id || !confirm("Delete this story?")) return;
  try { const ref = doc(db,"stories",id), snap = await getDoc(ref); if (!snap.exists() || snap.data().authorId !== state.user.uid) throw new Error("You can delete only your own stories."); await deleteDoc(ref); toast("Story deleted.","success"); await fetchStories(); }
  catch (e) { toast(errorText(e),"error"); }
}
async function reportStory(id, authorId) {
  if (!requireLogin()) return; const reason = prompt("Why are you reporting this story?"); if (reason === null) return;
  if (!reason.trim() || reason.trim().length > 500) { toast("Please enter a reason between 1 and 500 characters.","error"); return; }
  try { await addDoc(collection(db,"reports"),{reporterId:state.user.uid,storyId:id,reportedUserId:authorId || "",reason:reason.trim(),status:"pending",createdAt:serverTimestamp()}); toast("Report submitted.","success"); }
  catch (e) { toast(errorText(e),"error"); }
}

function openConnections(tab="discover") { if (!requireLogin()) return; setConnectionTab(tab); openDialog("#connections-dialog"); }
function setConnectionTab(tab) { state.connectionTab = ["discover","requests","connections"].includes(tab) ? tab : "discover"; $$("[data-connection-tab]").forEach(b=>b.classList.toggle("active",b.dataset.connectionTab===state.connectionTab)); void loadConnections(); }
async function loadConnections() {
  const box = $("#connections-content"); if (!box) return; if (!state.user) { box.textContent="Sign in to manage connections."; return; } box.textContent="Loading…";
  try {
    if (state.connectionTab === "discover") {
      const snap = await getDocs(query(collection(db,"profiles"),limit(50)));
      const people = snap.docs.map(d=>({uid:d.id,...d.data()})).filter(p=>p.uid!==state.user.uid);
      const sentSnap = await getDocs(query(collection(db,"connectionRequests"),where("senderId","==",state.user.uid),limit(100)));
      const sent = new Set(sentSnap.docs.map(d=>d.data().receiverId));
      box.innerHTML = people.length ? people.map(p=>`<article class="connection-row"><div><strong>${escapeHTML(p.displayName||"Member")}</strong><p>${escapeHTML(p.bio||"A BE ONLY ONE member")}</p></div>${sent.has(p.uid)?"<span>Request sent</span>":`<button type="button" data-action="send-request" data-id="${escapeHTML(p.uid)}">Connect</button>`}</article>`).join("") : "<p>No other profiles found yet.</p>";
    } else if (state.connectionTab === "requests") {
      const snap = await getDocs(query(collection(db,"connectionRequests"),where("receiverId","==",state.user.uid),limit(100)));
      const requests = snap.docs.map(d=>({id:d.id,...d.data()})).filter(r=>!r.status||r.status==="pending");
      box.innerHTML = requests.length ? requests.map(r=>`<article class="connection-row"><p>Request from <strong>${escapeHTML(r.senderId||"Member")}</strong></p><button type="button" data-action="accept-request" data-id="${escapeHTML(r.id)}" data-sender="${escapeHTML(r.senderId||"")}">Accept</button><button type="button" data-action="reject-request" data-id="${escapeHTML(r.id)}">Decline</button></article>`).join("") : "<p>No incoming requests.</p>";
    } else {
      const [a,b] = await Promise.all([getDocs(query(collection(db,"connections"),where("userA","==",state.user.uid),limit(100))),getDocs(query(collection(db,"connections"),where("userB","==",state.user.uid),limit(100)))]);
      const people = [...a.docs.map(d=>({id:d.id,uid:d.data().userB})),...b.docs.map(d=>({id:d.id,uid:d.data().userA}))];
      box.innerHTML = people.length ? people.map(p=>`<article class="connection-row"><strong>${escapeHTML(p.uid||"Member")}</strong><button type="button" data-action="disconnect" data-id="${escapeHTML(p.uid||"")}">Disconnect</button></article>`).join("") : "<p>No connections yet.</p>";
    }
  } catch (e) { box.textContent = errorText(e); }
}
async function sendRequest(targetUserId) {
  if (!requireLogin() || !targetUserId || targetUserId===state.user.uid) return;
  try {
    const existing = await getDocs(query(collection(db,"connectionRequests"),where("senderId","==",state.user.uid),where("receiverId","==",targetUserId),limit(1)));
    if (!existing.empty) { toast("You already sent a request."); return; }
    await addDoc(collection(db,"connectionRequests"),{senderId:state.user.uid,receiverId:targetUserId,status:"pending",createdAt:serverTimestamp()}); toast("Connection request sent.","success"); await loadConnections();
  } catch (e) { toast(errorText(e),"error"); }
}
async function callManageConnection(action,targetUserId) {
  if (!targetUserId) throw new Error("Connection member ID is missing.");
  const callable = httpsCallable(functions,"manageConnection"); await callable({action,targetUserId});
}
async function connectionAction(button) {
  const {action,id} = {action:button.dataset.action,id:button.dataset.id};
  try {
    if (action === "send-request") await sendRequest(id);
    else if (action === "accept-request") { await callManageConnection("accept",button.dataset.sender); toast("Connection accepted.","success"); await loadConnections(); }
    else if (action === "reject-request") { const ref=doc(db,"connectionRequests",id),snap=await getDoc(ref); if(!snap.exists()||snap.data().receiverId!==state.user.uid) throw new Error("You cannot decline this request."); await deleteDoc(ref); toast("Request declined.","success"); await loadConnections(); }
    else if (action === "disconnect") { await callManageConnection("disconnect",id); toast("Disconnected.","success"); await loadConnections(); }
  } catch (e) { toast(errorText(e),"error"); }
}

function bindEvents() {
  $("#login-tab").addEventListener("click",()=>setAuthMode("login")); $("#signup-tab").addEventListener("click",()=>setAuthMode("signup"));
  $("#auth-form").addEventListener("submit",handleAuthSubmit); $("#forgot-password").addEventListener("click",handleForgotPassword);
  $("#profile-form").addEventListener("submit",saveProfile); $("#story-form").addEventListener("submit",submitStory);
  $("#get-started").addEventListener("click",()=>state.user?openProfile():(setAuthMode("login"),openDialog("#auth-dialog")));
  $("#open-profile").addEventListener("click",openProfile); $("#feature-identity").addEventListener("click",openProfile);
  $("#view-connections").addEventListener("click",()=>openConnections("discover")); $("#community-connections").addEventListener("click",()=>openConnections("discover")); $("#feature-connections").addEventListener("click",()=>openConnections("discover"));
  $("#create-feeling").addEventListener("click",()=>openStory("feeling")); $("#create-story").addEventListener("click",()=>openStory("feeling"));
  $("#feature-feeling").addEventListener("click",()=>{state.storyFilter="public";renderStories();$("#stories").scrollIntoView({behavior:"smooth"});});
  $("#feature-music").addEventListener("click",()=>{state.storyFilter="public";renderStories();$("#stories").scrollIntoView({behavior:"smooth"});});
  $("#open-feature").addEventListener("click",()=>$("#features").scrollIntoView({behavior:"smooth"})); $("#load-more-stories").addEventListener("click",fetchStories);
  $("#open-settings").addEventListener("click",()=>{if(requireLogin())openDialog("#settings-dialog");}); $("#settings-profile").addEventListener("click",()=>{closeDialog("#settings-dialog");openProfile();});
  $("#settings-signout").addEventListener("click",logout); $("#sign-out").addEventListener("click",logout);
  $("#profile-my-stories").addEventListener("click",()=>{closeDialog("#profile-dialog");state.storyFilter="mine";$$("[data-story-filter]").forEach(b=>b.classList.toggle("active",b.dataset.storyFilter==="mine"));renderStories();$("#stories").scrollIntoView({behavior:"smooth"});});
  $$('[data-story-filter]').forEach(b=>b.addEventListener("click",()=>{state.storyFilter=b.dataset.storyFilter;$$('[data-story-filter]').forEach(x=>x.classList.toggle("active",x===b));renderStories();}));
  $$("[data-connection-tab]").forEach(b=>b.addEventListener("click",()=>setConnectionTab(b.dataset.connectionTab)));
  document.addEventListener("click",event=>{const button=event.target instanceof Element?event.target.closest("[data-action]"):null;if(!button)return;const action=button.dataset.action;if(["send-request","accept-request","reject-request","disconnect"].includes(action))void connectionAction(button);if(action==="delete-story")void deleteStory(button.dataset.id);if(action==="report-story")void reportStory(button.dataset.id,button.dataset.author);});
  $$('[data-close-dialog]').forEach(b=>b.addEventListener("click",()=>b.closest("dialog")?.close()));
  $$('dialog').forEach(d=>d.addEventListener("click",e=>{if(e.target===d)d.close();}));
  $("#menu-toggle").addEventListener("click",()=>{const nav=$("#primary-navigation"),isOpen=nav.classList.toggle("menu-open");$("#menu-toggle").setAttribute("aria-expanded",String(isOpen));});
  $("#primary-navigation").querySelectorAll("a,button").forEach(el=>el.addEventListener("click",()=>{$("#primary-navigation").classList.remove("menu-open");$("#menu-toggle").setAttribute("aria-expanded","false");}));
  $("#current-year").textContent=String(new Date().getFullYear());
}
function init() {
  bindEvents(); setAuthMode("login");
  onAuthStateChanged(auth,async user=>{
    state.user=user;
    if(!user){state.profile=null;state.stories=[];updateUI();return;}
    try{await loadProfile(user,true);updateUI();await fetchStories();}catch(e){toast(errorText(e),"error");}
  });
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true});else init();
