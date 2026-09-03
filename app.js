import { 
  auth, googleProvider, db, storage, 
  signInWithPopup, signOut, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy, ref, uploadBytes, getDownloadURL 
} from './firebase-config.js';

let currentUser = null;
let currentRole = null;
let activeLanguage = 'en';

// --- Localization Translations ---
const translations = {
  en: {
    title: "Corporate Management System",
    addStudent: "Add Student Check",
    studentDetails: "Student Information Entry"
  },
  ar: {
    title: "نظام إدارة الشركة",
    addStudent: "التحقق من إضافة طالب",
    studentDetails: "إدخال بيانات الطالب"
  }
};

window.toggleLanguage = () => {
  activeLanguage = activeLanguage === 'en' ? 'ar' : 'en';
  document.getElementById('lang-toggle-btn').innerText = activeLanguage === 'en' ? 'العربية' : 'English';
  document.documentElement.dir = activeLanguage === 'ar' ? 'rtl' : 'ltr';
  
  // Update UI Elements
  document.getElementById('app-title').innerText = translations[activeLanguage].title;
};

// --- Real-time Footer Clock ---
function updateFooterClock() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  document.getElementById('footer-datetime').innerText = now.toLocaleDateString(activeLanguage === 'ar' ? 'ar-BH' : 'en-US', options);
}
setInterval(updateFooterClock, 1000);

// --- Google Authentication & Approval System ---
document.getElementById('google-login-btn')?.addEventListener('click', async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user exists in database
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // New User Default Registration (Pending Approval)
      await setDoc(userRef, {
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        role: "employee", // Default assigned role
        status: "pending",
        createdAt: new Date().toISOString()
      });
      alert("Account submitted for approval. The Manager will verify your registration.");
      await signOut(auth);
    } else {
      const userData = userSnap.data();
      if (userData.status !== "approved") {
        alert("Your account status is pending manager approval.");
        await signOut(auth);
      } else {
        currentUser = userData;
        initializeUserDashboard(userData);
      }
    }
  } catch (error) {
    console.error("Auth Error:", error);
    alert("Authentication failed: " + error.message);
  }
});

// --- Dashboard View Router ---
function initializeUserDashboard(userData) {
  document.getElementById('auth-section').classList.add('hidden');
  document.getElementById('dashboard-section').classList.remove('hidden');
  
  document.getElementById('user-display-name').innerText = userData.name;
  document.getElementById('user-display-email').innerText = userData.email;
  document.getElementById('user-display-role').innerText = userData.role.toUpperCase();

  // Reset Role Views
  document.querySelectorAll('.role-view').forEach(view => view.classList.add('hidden'));

  if (userData.role === 'employee') {
    document.getElementById('employee-view').classList.remove('hidden');
    document.getElementById('nav-directory-btn').classList.remove('hidden');
    document.getElementById('download-directory-excel-btn').classList.remove('hidden');
    loadStudentDirectory();
  } else if (userData.role === 'operator') {
    document.getElementById('operator-view').classList.remove('hidden');
    document.getElementById('nav-courses-btn').classList.remove('hidden');
    loadOperatorCourses();
  } else if (userData.role === 'manager') {
    document.getElementById('manager-view').classList.remove('hidden');
    document.getElementById('nav-employees-btn').classList.remove('hidden');
    document.getElementById('nav-courses-btn').classList.remove('hidden');
    loadManagerUserList();
  }

  setupChatSystem();
}

// --- Employee Module: Student Check & Save ---
document.getElementById('student-check-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const cpr = document.getElementById('check-cpr').value.trim();
  const phone = document.getElementById('check-phone').value.trim();

  const studentsRef = collection(db, "students");
  const q = query(studentsRef, where("cpr", "==", cpr));
  const querySnap = await getDocs(q);

  const msgBox = document.getElementById('check-message');
  msgBox.classList.remove('hidden');

  if (!querySnap.empty) {
    const existingData = querySnap.docs[0].data();
    msgBox.className = "message-banner error";
    msgBox.innerText = `Student already added by username: ${existingData.addedByUsername}`;
  } else {
    msgBox.className = "message-banner success";
    msgBox.innerText = "Student record available. Redirecting to entry form...";
    
    // Unlock and Pre-fill Student Entry Card
    document.getElementById('student-entry-card').classList.remove('hidden');
    document.getElementById('student-cpr').value = cpr;
    document.getElementById('student-phone').value = phone;
  }
});

// Save Student with File Upload
document.getElementById('save-student-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const cvFile = document.getElementById('student-cv').files[0];
  let cvUrl = "";

  if (cvFile) {
    const storageRef = ref(storage, `cvs/${Date.now()}_${cvFile.name}`);
    const uploadResult = await uploadBytes(storageRef, cvFile);
    cvUrl = await getDownloadURL(uploadResult.ref);
  }

  const studentData = {
    name: document.getElementById('student-name').value,
    cpr: document.getElementById('student-cpr').value,
    phone: document.getElementById('student-phone').value,
    degree: document.getElementById('student-degree').value,
    tamkeenStatus: document.getElementById('student-tamkeen').value,
    comment: document.getElementById('student-comment').value,
    cvUrl: cvUrl,
    reminderDate: document.getElementById('student-date').value,
    addedByUid: currentUser.uid,
    addedByUsername: currentUser.name,
    assignedClassId: null,
    createdAt: new Date().toISOString()
  };

  await addDoc(collection(db, "students"), studentData);
  alert("Student records saved successfully!");
  document.getElementById('student-entry-card').classList.add('hidden');
  loadStudentDirectory();
});

// --- Excel Export Engine (SheetJS Integration) ---
document.getElementById('download-directory-excel-btn')?.addEventListener('click', async () => {
  const querySnap = await getDocs(collection(db, "students"));
  const data = [];

  querySnap.forEach(docSnap => {
    const s = docSnap.data();
    data.push({
      "Full Name": s.name,
      "CPR": s.cpr,
      "Phone": s.phone,
      "Degree": s.degree,
      "Tamkeen Status": s.tamkeenStatus,
      "Added By": s.addedByUsername,
      "Comments": s.comment
    });
  });

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Student Directory");
  XLSX.writeFile(workbook, "Student_Directory.xlsx");
});

// --- Global Search Execution ---
document.getElementById('global-search')?.addEventListener('input', async (e) => {
  const term = e.target.value.toLowerCase().trim();
  const resultsContainer = document.getElementById('search-results');
  
  if (term.length < 2) {
    resultsContainer.classList.add('hidden');
    return;
  }

  const querySnap = await getDocs(collection(db, "students"));
  resultsContainer.innerHTML = '';
  resultsContainer.classList.remove('hidden');

  querySnap.forEach(docSnap => {
    const s = docSnap.data();
    if (s.name.toLowerCase().includes(term) || s.cpr.includes(term) || s.phone.includes(term)) {
      const item = document.createElement('div');
      item.className = 'search-item';
      item.innerText = `${s.name} - CPR: ${s.cpr} - Phone: ${s.phone}`;
      resultsContainer.appendChild(item);
    }
  });
});
