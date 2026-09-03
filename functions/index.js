const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

// Store credentials in Firebase config: firebase functions:config:set gmail.email="x" gmail.pass="y"
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER || "YOUR_AUTOMATED_GMAIL@gmail.com",
    pass: process.env.GMAIL_PASS || "YOUR_GMAIL_APP_PASSWORD",
  },
});

function isSameDay(d1, d2) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

exports.scheduledStudentReminderCheck = onSchedule("0 8 * * *", async (event) => {
  const db = admin.firestore();
  const now = new Date();

  const snapshot = await db.collection("students").get();

  // Process all student records asynchronously using Promise.all
  const tasks = snapshot.docs.map(async (docSnap) => {
    const student = docSnap.data();
    if (!student.reminderDate || !student.addedByUid) return;

    const targetDate = new Date(student.reminderDate);

    // 11-month milestone
    const elevenMonthsAfter = new Date(targetDate);
    elevenMonthsAfter.setMonth(elevenMonthsAfter.getMonth() + 11);

    // 3 days prior to 1-year milestone
    const yearMinusThreeDays = new Date(targetDate);
    yearMinusThreeDays.setFullYear(yearMinusThreeDays.getFullYear() + 1);
    yearMinusThreeDays.setDate(yearMinusThreeDays.getDate() - 3);

    const is11Month = isSameDay(now, elevenMonthsAfter);
    const is3Day = isSameDay(now, yearMinusThreeDays);

    if (!is11Month && !is3Day) return;

    // Retrieve corresponding employee details
    const userSnap = await db.collection("users").doc(student.addedByUid).get();
    if (!userSnap.exists) return;

    const employeeEmail = userSnap.data().email;
    if (!employeeEmail) return;

    if (is11Month) {
      await transporter.sendMail({
        from: '"System Notification" <noreply@system.com>',
        to: employeeEmail,
        subject: "Student Milestone Notification - 1 Month Remaining",
        text: `Hello ${student.addedByUsername || "Employee"}, the student ${student.name} has 1 month remaining before completing a year.`,
      });
    }

    if (is3Day) {
      await transporter.sendMail({
        from: '"System Notification" <noreply@system.com>',
        to: employeeEmail,
        subject: "Urgent Milestone Notification - 3 Days Remaining",
        text: `Hello ${student.addedByUsername || "Employee"}, the student ${student.name} has 3 days remaining to complete the full year.`,
      });
    }
  });

  await Promise.all(tasks);
});
