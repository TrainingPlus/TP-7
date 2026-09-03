import { 
  auth, googleProvider, db, storage, 
  signInWithPopup, signOut, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, ref, uploadBytes, getDownloadURL 
} from './firebase-config.js';

// Global Application State Variables
let currentUser = null;
let selectedRole = 'employee';
let activeLanguage = 'en';

// ==========================================
// 1. GLOBAL WINDOW FUNCTIONS (HTML Handlers)
// ==========================================

window.selectRole = (role) => {
  selectedRole = role;
  document.querySelectorAll('.role-tab').forEach(tab => {
    if (tab.dataset.role === role) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  const heading = document.getElementById('selected-role-heading');
  if (heading) {
    const roleFormatted = role.charAt(0).toUpperCase() + role.slice(1);
    heading.innerText = `${roleFormatted} Sign In`;
  }
};

window.toggleLanguage = () => {
  activeLanguage = activeLanguage === 'en' ? 'ar' : 'en';
  const btn = document.getElementById('lang-toggle-btn');
  if (btn) btn.innerText = activeLanguage === 'en' ? 'AR / EN' : 'EN / AR';
  document.documentElement.dir = activeLanguage === 'ar' ? 'rtl' : 'ltr';
};

window.toggleChatWidget = () => {
  const chatWidget = document.getElementById('chat-widget');
  if (chatWidget) {
    chatWidget.classList.toggle('hidden');
  }
};

// ==========================================
// 2. INITIALIZATION & AUTHENTICATION
// ==========================================

function updateFooterClock() {
  const clockElem = document.getElementById('footer-datetime');
  if (clockElem) {
    const now = new Date();
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
    clockElem.innerText = now.toLocaleDateString(activeLanguage === 'ar' ? 'ar-BH' : 'en-US', options);
  }
}
setInterval(updateFooterClock, 1000);

document.getElementById('google-login-btn')?.addEventListener('click', async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      const initialStatus = selectedRole === 'manager' ? 'approved' : 'pending';

      const newUserPayload = {
        uid: user.uid,
        name: user.displayName || 'Unknown User',
        email: user.email,
        role: selectedRole,
        status: initialStatus,
        createdAt: new Date().toISOString()
      };

      await setDoc(userRef, newUserPayload);

      if (initialStatus === 'pending') {
        alert(`Account submitted as ${selectedRole}. Waiting for Manager approval.`);
        await signOut(auth);
      } else {
        currentUser = newUserPayload;
        initializeDashboard(newUserPayload);
      }
    } else {
      let userData = userSnap.data();

      if (selectedRole === 'manager') {
        await updateDoc(userRef, { role: 'manager', status: 'approved' });
        userData.role = 'manager';
        userData.status = 'approved';
      }

      if (userData.status !== "approved") {
        alert("Your account is pending manager approval.");
        await signOut(auth);
      } else {
        currentUser = userData;
        initializeDashboard(userData);
      }
    }
  } catch (error) {
    console.error("Authentication Error:", error);
    alert("Login failed: " + error.message);
  }
});

document.getElementById('logout-btn')?.addEventListener('click', async () => {
  try {
    await signOut(auth);
    window.location.reload();
  } catch (err) {
    console.error("Logout Error:", err);
  }
});

// ==========================================
// 3. DASHBOARD ROUTING & HEADER NAVIGATION
// ==========================================

function initializeDashboard(userData) {
  document.getElementById('auth-section')?.classList.add('hidden');
  document.getElementById('main-header')?.classList.remove('hidden');
  document.getElementById('toggle-chat-btn')?.classList.remove('hidden');

  document.querySelectorAll('.role-view').forEach(view => view.classList.add('hidden'));

  const navManager = document.getElementById('nav-manager-btn');
  const navCourses = document.getElementById('nav-courses-btn');
  const navDirectory = document.getElementById('nav-directory-btn');
  const navExcel = document.getElementById('download-excel-btn');

  [navManager, navCourses, navDirectory, navExcel].forEach(btn => btn?.classList.add('hidden'));

  if (userData.role === 'employee') {
    document.getElementById('employee-view')?.classList.remove('hidden');
    navDirectory?.classList.remove('hidden');
    navExcel?.classList.remove('hidden');
  } else if (userData.role === 'operator') {
    document.getElementById('operator-view')?.classList.remove('hidden');
    navCourses?.classList.remove('hidden');
  } else if (userData.role === 'manager') {
    document.getElementById('manager-view')?.classList.remove('hidden');
    navManager?.classList.remove('hidden');
    navCourses?.classList.remove('hidden');
    navExcel?.classList.remove('hidden');
    
    listenForPendingUsers();
    loadManagerData();
  }
}

// Header Navigation Click Handlers
document.getElementById('nav-manager-btn')?.addEventListener('click', () => {
  document.querySelectorAll('.role-view').forEach(view => view.classList.add('hidden'));
  document.getElementById('manager-view')?.classList.remove('hidden');
});

document.getElementById('nav-courses-btn')?.addEventListener('click', () => {
  document.querySelectorAll('.role-view').forEach(view => view.classList.add('hidden'));
  document.getElementById('operator-view')?.classList.remove('hidden');
});

document.getElementById('nav-directory-btn')?.addEventListener('click', () => {
  document.querySelectorAll('.role-view').forEach(view => view.classList.add('hidden'));
  document.getElementById('employee-view')?.classList.remove('hidden');
});

// ==========================================
// 4. MANAGER WORKSPACE ACTIONS
// ==========================================

function listenForPendingUsers() {
  const pendingAlert = document.getElementById('manager-pending-alert');
  const pendingName = document.getElementById('pending-user-name');

  onSnapshot(query(collection(db, "users"), where("status", "==", "pending")), (snapshot) => {
    if (!snapshot.empty) {
      const docData = snapshot.docs[0].data();
      const docId = snapshot.docs[0].id;

      if (pendingName) pendingName.innerText = docData.name;
      pendingAlert?.classList.remove('hidden');

      const approveBtn = document.getElementById('approve-user-btn');
      if (approveBtn) {
        approveBtn.onclick = async () => {
          await updateDoc(doc(db, "users", docId), { status: "approved" });
          alert(`User ${docData.name} approved.`);
          pendingAlert?.classList.add('hidden');
        };
      }

      const rejectBtn = document.getElementById('reject-user-btn');
      if (rejectBtn) {
        rejectBtn.onclick = async () => {
          await deleteDoc(doc(db, "users", docId));
          alert(`User ${docData.name} rejected.`);
          pendingAlert?.classList.add('hidden');
        };
      }
    } else {
      pendingAlert?.classList.add('hidden');
    }
  });
}

async function loadManagerData() {
  const coursesList = document.getElementById('manager-courses-list');
  if (coursesList) {
    onSnapshot(collection(db, "courses"), (snapshot) => {
      coursesList.innerHTML = "";
      snapshot.forEach(docSnap => {
        const courseData = docSnap.data();

        const item = document.createElement('li');
        item.innerText = courseData.name;
        item.className = 'course-item-link';
        item.style.cursor = 'pointer';
        item.style.color = '#2563eb';
        item.style.fontWeight = '600';

        // Click event to navigate directly to the course/classes workspace
        item.addEventListener('click', () => {
          document.querySelectorAll('.role-view').forEach(view => view.classList.add('hidden'));
          document.getElementById('operator-view')?.classList.remove('hidden');

          const heading = document.getElementById('selected-course-title');
          if (heading) {
            heading.innerText = `Managing Classes for: ${courseData.name}`;
          }
        });

        coursesList.appendChild(item);
      });
    });
  }

  const staffList = document.getElementById('manager-staff-list');
  if (staffList) {
    onSnapshot(query(collection(db, "users"), where("status", "==", "approved")), (snapshot) => {
      staffList.innerHTML = "";
      snapshot.forEach(docSnap => {
        const u = docSnap.data();
        const item = document.createElement('li');
        item.innerText = `${u.name} (${u.role})`;
        staffList.appendChild(item);
      });
    });
  }
}

document.getElementById('manager-add-course-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('manager-course-name');
  if (!input.value.trim()) return;

  try {
    await addDoc(collection(db, "courses"), { name: input.value.trim(), createdAt: new Date().toISOString() });
    alert("Course added successfully.");
    input.value = "";
  } catch (err) {
    alert("Error adding course: " + err.message);
  }
});

document.getElementById('manager-add-employee-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('manager-employee-name').value;
  const email = document.getElementById('manager-employee-email').value;

  try {
    await addDoc(collection(db, "users"), {
      name: name,
      email: email,
      role: "employee",
      status: "approved",
      createdAt: new Date().toISOString()
    });
    alert("Employee record created.");
    e.target.reset();
  } catch (err) {
    alert("Error adding employee: " + err.message);
  }
});

// ==========================================
// 5. OPERATOR WORKSPACE ACTIONS
// ==========================================

document.getElementById('operator-add-course-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const courseInput = document.getElementById('course-name-input');
  if (!courseInput.value.trim()) return;

  try {
    await addDoc(collection(db, "courses"), {
      name: courseInput.value.trim(),
      createdBy: currentUser ? currentUser.name : "Operator",
      createdAt: new Date().toISOString()
    });
    alert("Course added successfully!");
    courseInput.value = "";
  } catch (err) {
    alert("Error adding course: " + err.message);
  }
});

// ==========================================
// 6. EMPLOYEE WORKSPACE ACTIONS & DYNAMIC CHECK
// ==========================================

// Switch input type dynamically based on CPR or Phone selection
document.getElementById('check-type')?.addEventListener('change', (e) => {
  const checkInput = document.getElementById('check-value');
  if (e.target.value === 'cpr') {
    checkInput.placeholder = "Enter 9-Digit CPR";
    checkInput.pattern = "[0-8][0-9]{8}";
  } else {
    checkInput.placeholder = "Enter Phone Number";
    checkInput.removeAttribute('pattern');
  }
});

// Verify Student Search (CPR or Phone)
document.getElementById('student-check-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const searchType = document.getElementById('check-type').value;
  const searchValue = document.getElementById('check-value').value.trim();
  const msgBox = document.getElementById('check-message');

  try {
    const qSnap = await getDocs(query(collection(db, "students"), where(searchType, "==", searchValue)));
    msgBox.classList.remove('hidden');

    if (!qSnap.empty) {
      const existing = qSnap.docs[0].data();
      msgBox.className = "pending-banner";
      msgBox.innerText = `Student record already exists! Added by: ${existing.addedByUsername}`;
    } else {
      msgBox.className = "pending-banner";
      msgBox.innerText = "No existing record found. Proceeding with new entry...";
      
      document.getElementById('student-entry-card')?.classList.remove('hidden');
      
      if (searchType === 'cpr') {
        document.getElementById('student-cpr').value = searchValue;
        document.getElementById('student-phone').value = "";
      } else {
        document.getElementById('student-phone').value = searchValue;
        document.getElementById('student-cpr').value = "";
      }
    }
  } catch (err) {
    alert("Verification error: " + err.message);
  }
});

// Save Student Record
document.getElementById('save-student-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  try {
    const cvFile = document.getElementById('student-cv').files[0];
    let cvUrl = "";

    if (cvFile) {
      const storageRef = ref(storage, `cvs/${Date.now()}_${cvFile.name}`);
      const uploadResult = await uploadBytes(storageRef, cvFile);
      cvUrl = await getDownloadURL(uploadResult.ref);
    }

    const studentPayload = {
      name: document.getElementById('student-name').value,
      cpr: document.getElementById('student-cpr').value,
      phone: document.getElementById('student-phone').value,
      degree: document.getElementById('student-degree').value,
      tamkeenStatus: document.getElementById('student-tamkeen').value,
      comment: document.getElementById('student-comment').value,
      cvUrl: cvUrl,
      reminderDate: document.getElementById('student-date').value,
      addedByUid: currentUser ? currentUser.uid : "unknown",
      addedByUsername: currentUser ? currentUser.name : "Employee",
      createdAt: new Date().toISOString()
    };

    await addDoc(collection(db, "students"), studentPayload);
    alert("Student record saved successfully!");
    document.getElementById('student-entry-card')?.classList.add('hidden');
    e.target.reset();
  } catch (err) {
    alert("Error saving record: " + err.message);
  }
});

// ==========================================
// 7. EXCEL DIRECTORY EXPORT (SheetJS)
// ==========================================

document.getElementById('download-excel-btn')?.addEventListener('click', async () => {
  try {
    const querySnap = await getDocs(collection(db, "students"));
    const exportData = [];

    querySnap.forEach(docSnap => {
      const s = docSnap.data();
      exportData.push({
        "Full Name": s.name || "",
        "CPR": s.cpr || "",
        "Phone": s.phone || "",
        "Degree": s.degree || "",
        "Tamkeen Status": s.tamkeenStatus || "",
        "Added By": s.addedByUsername || "",
        "Comments": s.comment || ""
      });
    });

    if (exportData.length === 0) {
      alert("No student records available to export.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Students");
    XLSX.writeFile(workbook, "Student_Directory.xlsx");
  } catch (err) {
    alert("Export failed: " + err.message);
  }
});
