import { 
  auth, googleProvider, db, storage, 
  signInWithPopup, signOut, collection, doc, setDoc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, onSnapshot, orderBy, ref, uploadBytes, getDownloadURL 
} from './firebase-config.js';

let currentUser = null;
let selectedRole = 'employee';
let activeLanguage = 'en';

// --- Role Tab Selection Function ---
window.selectRole = (role) => {
  selectedRole = role;
  document.querySelectorAll('.role-tab').forEach(tab => {
    if (tab.dataset.role === role) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });
  
  const roleFormatted = role.charAt(0).toUpperCase() + role.slice(1);
  const heading = document.getElementById('selected-role-heading');
  if (heading) heading.innerText = `${roleFormatted} Sign In`;
};

// --- Language Toggle ---
window.toggleLanguage = () => {
  activeLanguage = activeLanguage === 'en' ? 'ar' : 'en';
  const btn = document.getElementById('lang-toggle-btn');
  if (btn) btn.innerText = activeLanguage === 'en' ? 'AR / EN' : 'EN / AR';
  document.documentElement.dir = activeLanguage === 'ar' ? 'rtl' : 'ltr';
};

// --- Chat Widget Toggle ---
window.toggleChatWidget = () => {
  const chatBox = document.getElementById('chat-widget');
  if (chatBox) chatBox.classList.toggle('hidden');
};

// --- Real-time Footer Clock ---
function updateFooterClock() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const clockElem = document.getElementById('footer-datetime');
  if (clockElem) {
    clockElem.innerText = now.toLocaleDateString(activeLanguage === 'ar' ? 'ar-BH' : 'en-US', options);
  }
}
setInterval(updateFooterClock, 1000);

// --- Google Authentication & Role Logic ---
document.getElementById('google-login-btn')?.addEventListener('click', async () => {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      // Auto-approve if the selected role is Manager, otherwise set to pending
      const initialStatus = selectedRole === 'manager' ? 'approved' : 'pending';

      await setDoc(userRef, {
        uid: user.uid,
        name: user.displayName,
        email: user.email,
        role: selectedRole,
        status: initialStatus,
        createdAt: new Date().toISOString()
      });

      if (initialStatus === 'pending') {
        alert(`Account submitted as ${selectedRole}. Manager approval required.`);
        await signOut(auth);
      } else {
        const newUserData = {
          uid: user.uid,
          name: user.displayName,
          email: user.email,
          role: selectedRole,
          status: 'approved'
        };
        currentUser = newUserData;
        initializeDashboard(newUserData);
      }
    } else {
      let userData = userSnap.data();

      // If logging in as manager, ensure status is approved and role is manager
      if (selectedRole === 'manager') {
        await updateDoc(userRef, {
          role: 'manager',
          status: 'approved'
        });
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
    console.error("Auth Error:", error);
    alert("Authentication failed: " + error.message);
  }
});

// --- Dashboard Router ---
function initializeDashboard(userData) {
  document.getElementById('auth-section')?.classList.add('hidden');
  document.getElementById('main-header')?.classList.remove('hidden');
  document.getElementById('toggle-chat-btn')?.classList.remove('hidden');

  document.querySelectorAll('.role-view').forEach(view => view.classList.add('hidden'));

  // Nav Links Control
  const navManager = document.getElementById('nav-manager-btn');
  const navCourses = document.getElementById('nav-courses-btn');
  const navDirectory = document.getElementById('nav-directory-btn');
  const navExcel = document.getElementById('download-excel-btn');

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
  }

  checkStudentMilestoneReminders();
}

// --- Logout ---
document.getElementById('logout-btn')?.addEventListener('click', async () => {
  await signOut(auth);
  window.location.reload();
});

// --- Student Check (Employee) ---
document.getElementById('student-check-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const cpr = document.getElementById('check-cpr').value.trim();
  const phone = document.getElementById('check-phone').value.trim();

  const querySnap = await getDocs(query(collection(db, "students"), where("cpr", "==", cpr)));
  const msgBox = document.getElementById('check-message');
  msgBox.classList.remove('hidden');

  if (!querySnap.empty) {
    const existing = querySnap.docs[0].data();
    msgBox.className = "pending-banner";
    msgBox.innerText = `Student already added by: ${existing.addedByUsername}`;
  } else {
    msgBox.className = "pending-banner";
    msgBox.innerText = "Student record available. Complete form below.";
    
    document.getElementById('student-entry-card')?.classList.remove('hidden');
    document.getElementById('student-cpr').value = cpr;
    document.getElementById('student-phone').value = phone;
  }
});

// --- Save Student (Employee) ---
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
    createdAt: new Date().toISOString()
  };

  await addDoc(collection(db, "students"), studentData);
  alert("Student record saved successfully!");
  document.getElementById('student-entry-card')?.classList.add('hidden');
});

// --- Excel Export (SheetJS) ---
document.getElementById('download-excel-btn')?.addEventListener('click', async () => {
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

// --- Email Reminder Check ---
async function checkStudentMilestoneReminders() {
  try {
    const querySnap = await getDocs(collection(db, "students"));
    const today = new Date();

    querySnap.forEach(async (docSnap) => {
      const student = docSnap.data();
      if (!student.reminderDate) return;

      const targetDate = new Date(student.reminderDate);
      const elevenMonths = new Date(targetDate);
      elevenMonths.setMonth(elevenMonths.getMonth() + 11);

      const threeDaysBeforeYear = new Date(targetDate);
      threeDaysBeforeYear.setFullYear(threeDaysBeforeYear.getFullYear() + 1);
      threeDaysBeforeYear.setDate(threeDaysBeforeYear.getDate() - 3);

      if (isSameDay(today, elevenMonths) || isSameDay(today, threeDaysBeforeYear)) {
        const userSnap = await getDoc(doc(db, "users", student.addedByUid));
        if (!userSnap.exists()) return;
        
        emailjs.send("YOUR_SERVICE_ID", "YOUR_TEMPLATE_ID", {
          to_email: userSnap.data().email,
          student_name: student.name,
          message: `Milestone notification for ${student.name}`
        });
      }
    });
  } catch (err) {
    console.error("Reminder check failed:", err);
  }
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
}
